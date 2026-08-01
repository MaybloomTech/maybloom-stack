#!/usr/bin/env python3
"""Check that the skill tree, the manifest, and the skills agree.

The tree in docs/assets/skill-tree.svg is a claim about coverage: a solid
leaf says the skills can work that path without reading a codebase the
reader has no access to. docs/assets/skill-tree.json is the data behind the
claim, and this script is what stops the two from drifting apart.

One leaf, one directory of references, entered through its README.md.

Run from the repo root: python3 scripts/check-skill-tree.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "docs/assets/skill-tree.json"
SVG = ROOT / "docs/assets/skill-tree.svg"
SHARED_REFS = ROOT / "skills/maybloom-stack-shared/references"

STATUSES = {"validated", "validating", "open"}
LIMBS = {"servers", "clients"}

# Leaf labels are flat <text> nodes in the SVG; the class carries the status.
TEXT_RE = re.compile(r'<text\b[^>]*class="([^"]+)"[^>]*>([^<]*)</text>')
CLASS_FOR_STATUS = {"validated": "name", "validating": "name", "open": "name-dim"}


def main() -> int:
    errors: list[str] = []

    manifest = json.loads(MANIFEST.read_text())
    leaves = manifest["leaves"]
    cross_cutting = set(manifest["crossCutting"])
    paths_dir = ROOT / manifest["pathsDir"]

    if not paths_dir.is_dir():
        print(f"pathsDir {manifest['pathsDir']} does not exist", file=sys.stderr)
        return 1

    # The SVG's own text, indexed by class, so a status change in the manifest
    # that nobody drew shows up as a failure rather than a wrong picture.
    svg_text: dict[str, set[str]] = {}
    for cls, text in TEXT_RE.findall(SVG.read_text()):
        svg_text.setdefault(cls.strip(), set()).add(text.strip())

    claimed: set[str] = set()
    seen_ids: set[str] = set()

    for leaf in leaves:
        lid = leaf.get("id", "<missing id>")
        where = f"leaf {lid!r}"

        if lid in seen_ids:
            errors.append(f"{where}: duplicate id")
        seen_ids.add(lid)

        status = leaf.get("status")
        if status not in STATUSES:
            errors.append(f"{where}: status {status!r} is not one of {sorted(STATUSES)}")
            continue
        if leaf.get("limb") not in LIMBS:
            errors.append(f"{where}: limb {leaf.get('limb')!r} is not one of {sorted(LIMBS)}")

        path = leaf.get("path")
        doc = leaf.get("doc")

        # A path is only as validated as the reference behind it.
        if status == "validated" and not path:
            errors.append(
                f"{where}: status is validated but no reference directory is "
                f"declared — either write one or drop the leaf to 'validating'"
            )
        if status == "validating" and not doc:
            errors.append(f"{where}: status is validating but no doc is declared")
        if status == "open" and path:
            errors.append(
                f"{where}: status is open but a reference directory is declared — "
                f"a path with a reference is at least validating"
            )

        if doc and not (ROOT / doc).is_file():
            errors.append(f"{where}: doc {doc} does not exist")

        if path:
            claimed.add(path)
            leaf_dir = paths_dir / path
            if not leaf_dir.is_dir():
                errors.append(f"{where}: reference directory {leaf_dir.relative_to(ROOT)} does not exist")
            elif not (leaf_dir / "README.md").is_file():
                errors.append(
                    f"{where}: {leaf_dir.relative_to(ROOT)} has no README.md — "
                    f"every path is entered through one"
                )

        # The picture has to show the leaf, drawn the way its status says.
        label = leaf.get("label", "")
        expected_class = CLASS_FOR_STATUS[status]
        if label not in svg_text.get(expected_class, set()):
            drawn = next((c for c, t in svg_text.items() if label in t), None)
            detail = f"drawn as class={drawn!r}" if drawn else "not drawn at all"
            errors.append(
                f"{where}: expected {label!r} in the SVG as class={expected_class!r} "
                f"for status {status!r}, but it is {detail}"
            )

    if any(leaf.get("status") == "validating" for leaf in leaves):
        if "VALIDATING" not in svg_text.get("tag-amber", set()):
            errors.append(
                "a leaf is validating but the SVG carries no amber VALIDATING tag"
            )

    # Every path directory belongs to a leaf. This is the check that catches a
    # reference someone wrote and nobody put on the tree.
    for child in sorted(p for p in paths_dir.iterdir() if p.is_dir()):
        if child.name not in claimed:
            errors.append(
                f"{child.relative_to(ROOT)} is not claimed by any leaf — "
                f"add it to the tree or delete it"
            )

    # Cross-cutting references sit at the top level and are declared as such,
    # so a path reference cannot be filed away where the tree never sees it.
    for path in sorted(SHARED_REFS.glob("*.md")):
        rel = str(path.relative_to(ROOT))
        if rel not in cross_cutting:
            errors.append(
                f"{rel} is not declared cross-cutting — if it documents one "
                f"path, move it under {manifest['pathsDir']}/<leaf>/"
            )
    for rel in sorted(cross_cutting):
        if not (ROOT / rel).is_file():
            errors.append(f"crossCutting entry {rel} does not exist")

    # Skills cite each other by relative path, and a skill that sends the agent
    # to a file that moved is worse than one that says nothing.
    link_re = re.compile(r"`((?:\.\./|references/)[^`]+\.md)`")
    for md in sorted((ROOT / "skills").rglob("*.md")):
        for link in link_re.findall(md.read_text()):
            if not (md.parent / link).resolve().is_file():
                errors.append(
                    f"{md.relative_to(ROOT)}: link `{link}` does not resolve"
                )

    if errors:
        print("skill tree is out of step with the skills:\n", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        print(
            "\nThe tree, docs/assets/skill-tree.json, and skills/ have to move "
            "together.",
            file=sys.stderr,
        )
        return 1

    counts = {s: sum(1 for l in leaves if l["status"] == s) for s in sorted(STATUSES)}
    summary = ", ".join(f"{n} {s}" for s, n in counts.items())
    print(f"skill tree is consistent: {len(leaves)} leaves ({summary})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
