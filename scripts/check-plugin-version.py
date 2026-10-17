#!/usr/bin/env python3
"""Check that a change to what the plugin ships comes with a version bump.

Claude Code updates an installed plugin only when its version changes, so
a merge that changes the skills, the agents or the manifests without a
bump never reaches anyone who already has the plugin: `claude plugin
update` reports the old version as the latest. This compares the branch
against its base and fails when a shipped path changed but the version in
.claude-plugin/plugin.json did not go up. It also holds the version in the
marketplace entry equal to plugin.json's, so the two cannot drift.

Run from the repo root: python3 scripts/check-plugin-version.py [BASE]
BASE defaults to origin/main; the diff is from its merge base with HEAD.
It reads committed HEAD only, so commit the bump before running it, and
fetch first (on a fork, pass upstream/main) so the base is current.
The version is MAJOR.MINOR.PATCH; pre-release suffixes are not accepted.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLUGIN = ".claude-plugin/plugin.json"
MARKETPLACE = ".claude-plugin/marketplace.json"

# What an installed plugin carries. The scaffold's templates live under
# skills/, so skills/ covers them; templates/ is listed for a top-level one.
SHIPPED = ("skills/", "agents/", "templates/", ".claude-plugin/")

SEMVER_RE = re.compile(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)")


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, check=True, capture_output=True, text=True
    ).stdout


def parse(version: object, where: str, errors: list[str]) -> tuple[int, ...] | None:
    if not isinstance(version, str) or not SEMVER_RE.fullmatch(version):
        errors.append(f"{where}: version {version!r} is not MAJOR.MINOR.PATCH")
        return None
    return tuple(int(part) for part in version.split("."))


def main() -> int:
    base = sys.argv[1] if len(sys.argv) > 1 else "origin/main"
    errors: list[str] = []

    # Everything from committed HEAD, as CI sees it: an uncommitted bump
    # would otherwise pass here and fail there.
    plugin = json.loads(git("show", f"HEAD:{PLUGIN}"))
    version = plugin.get("version")
    head = parse(version, PLUGIN, errors)

    entries = [
        p for p in json.loads(git("show", f"HEAD:{MARKETPLACE}")).get("plugins", [])
        if p.get("name") == plugin.get("name")
    ]
    if len(entries) != 1:
        errors.append(f"{MARKETPLACE}: expected one entry named {plugin.get('name')!r}")
    elif entries[0].get("version") != version:
        errors.append(
            f"{MARKETPLACE}: version {entries[0].get('version')!r} "
            f"differs from {PLUGIN}'s {version!r}"
        )

    merge_base = git("merge-base", base, "HEAD").strip()
    # --no-renames lists a moved file under both names, so moving a file
    # out of a shipped directory counts as a change to it.
    changed = git(
        "diff", "--name-only", "--no-renames", "-z", merge_base, "HEAD"
    ).split("\0")
    shipped = [path for path in changed if path.startswith(SHIPPED)]

    if shipped and head is not None:
        before = json.loads(git("show", f"{merge_base}:{PLUGIN}")).get("version")
        old = parse(before, f"{PLUGIN} at {merge_base[:7]}", errors)
        if old is not None and head <= old:
            listed = "\n      ".join(shipped[:10])
            more = f"\n      ... and {len(shipped) - 10} more" if len(shipped) > 10 else ""
            errors.append(
                f"{PLUGIN}: version {version} is not above the base's {before}, "
                f"but the change touches what the plugin ships:\n      {listed}{more}\n"
                f"    Raise the version in {PLUGIN} and {MARKETPLACE} "
                "(see CONTRIBUTING.md, 'Releasing the plugin')."
            )

    if errors:
        print("plugin version check failed:\n", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    if shipped:
        print(f"plugin version {version}: bumped for {len(shipped)} shipped file(s)")
    else:
        print(f"plugin version {version}: nothing the plugin ships changed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
