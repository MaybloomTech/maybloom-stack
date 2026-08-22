#!/usr/bin/env python3
"""Resolve the dependency catalog at scaffold time.

The catalog used to ship as a list of version numbers, which meant every
project scaffolded from this skill inherited whatever was current on the day
the template was last edited. Nothing updated them: Dependabot cannot see a
`.tmpl` file, so the numbers only moved when someone noticed.

The fix is not to drop versions and take whatever is latest, because "latest"
is an untested combination and is sometimes actively broken — as of this
writing `npm view typescript version` returns a major that `astro check`
cannot load at all. So the catalog carries *constraints* instead of
versions: a package with a known ceiling records the ceiling and the reason,
and everything else resolves to current. A version number is a constraint
whose reason has been forgotten; this file is the same information with the
reason still attached.

Run from the scaffolded project root, before `pnpm install`:

    python3 resolve-catalog.py > pnpm-workspace.yaml
"""

from __future__ import annotations

import json
import subprocess
import sys

# Everything the workspace shares a version of. Order is the order it is
# written out, so keep related packages together.
PACKAGES = [
    "astro",
    "@astrojs/check",
    "@bufbuild/buf",
    "@bufbuild/protoc-gen-es",
    "@bufbuild/protobuf",
    "@biomejs/biome",
    "@connectrpc/connect",
    "@connectrpc/connect-fastify",
    "@connectrpc/connect-node",
    "@connectrpc/connect-web",
    "@types/node",
    "jose",
    "react",
    "react-dom",
    "@types/react",
    "tsup",
    "tsx",
    "typescript",
]

# A ceiling here is a known break, not a preference, and each one carries the
# reason so it can be retired rather than inherited forever. Check whether the
# reason still holds before scaffolding: these are claims with dates on them.
CONSTRAINTS: dict[str, tuple[str, str]] = {
    "typescript": (
        "6",
        "TypeScript 7 is the native compiler and does not expose the "
        "programmatic API `astro check` is built on, so typecheck fails "
        "outright. Track withastro/roadmap#1321.",
    ),
    # React Native pins React for the whole Expo SDK, so React moves when
    # Expo says it moves, never before.
    "react": ("19", "Expo SDK pins the React major; upgrade with Expo, not ahead of it."),
    "react-dom": ("19", "Must match react."),
    "@types/react": ("19", "Must match react."),
}


def latest(package: str, major: str | None) -> str:
    """Highest published version, optionally within a major."""
    spec = f"{package}@{major}" if major else package
    out = subprocess.run(
        ["npm", "view", spec, "version", "--json"],
        capture_output=True,
        text=True,
    )
    if out.returncode != 0:
        raise SystemExit(f"could not resolve {spec}:\n{out.stderr.strip()}")
    value = json.loads(out.stdout)
    if not isinstance(value, list):
        return value
    # A range matches many versions, and npm returns them in *publish* order,
    # not semver order — a patch backported to an older minor is published
    # last and would win. Sort properly, and drop prereleases.
    stable = [v for v in value if "-" not in v]
    return max(stable or value, key=_key)


def main() -> int:
    lines = [
        "packages:",
        '  - "packages/*"',
        "",
        "# Resolved at scaffold time by scripts/resolve-catalog.py rather than",
        "# copied from a template, so a new project starts on current versions",
        "# instead of whatever was current when the skill was last edited.",
        "# Re-run it to move the whole workspace at once.",
        "catalog:",
    ]

    for package in PACKAGES:
        ceiling, reason = CONSTRAINTS.get(package, (None, ""))
        version = latest(package, ceiling)
        if reason:
            for line in _wrap(reason):
                lines.append(f"  # {line}")
        key = f'"{package}"' if package.startswith("@") else package
        # A caret on a pinned major still floats within it, which is what the
        # constraints above are for: they bound the major, not the patches.
        lines.append(f"  {key}: ^{version}")

    print("\n".join(lines))
    return 0


def _key(version: str) -> tuple[int, ...]:
    return tuple(int(part) for part in version.split("-")[0].split("."))


def _wrap(text: str, width: int = 70) -> list[str]:
    words, out, line = text.split(), [], ""
    for word in words:
        if len(line) + len(word) + 1 > width:
            out.append(line)
            line = word
        else:
            line = f"{line} {word}".strip()
    if line:
        out.append(line)
    return out


if __name__ == "__main__":
    sys.exit(main())
