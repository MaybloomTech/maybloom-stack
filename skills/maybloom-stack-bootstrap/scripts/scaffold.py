#!/usr/bin/env python3
"""
Scaffold a new project from the maybloom-stack templates.

The bootstrap skill copies the templates/ tree into a target directory,
substituting these placeholders in any file whose name ends in `.tmpl`:

  __APP_NAME__       — PascalCase display name (e.g. "Foobar")
  __APP_SLUG__       — lowercase slug (e.g. "foobar"), used in proto package
                        names, npm package names, the database name, etc.
  __APP_SLUG_UPPER__ — uppercase env-var prefix (e.g. "FOOBAR")
  __ORG_SCOPE__      — npm scope including the @ (e.g. "@foobar-tech")
  __LICENSE_FIELD__  — the package.json "license" value: the SPDX id, or
                        UNLICENSED when no licence was chosen
  __LICENSE_RULE__   — the licence-header rule written into CLAUDE.md

A licence is optional (`--license`, default `none`). When one is chosen,
every generated source file (.ts, .tsx, .js, .mjs, .go) gets a first line
`// SPDX-License-Identifier: <id>`, and for Apache-2.0 and MIT a LICENSE
file (and NOTICE, for Apache) is written from templates/licenses/ with the
`--copyright` holder and the current year. Any other SPDX id gets the
headers only; the LICENSE file is the user's to add.

Layout mapping (templates → output):

  templates/root/*                       → <out>/
  templates/proto/package.json.tmpl      → <out>/packages/protocol-buffers/...
  templates/proto/tsconfig.json          → <out>/packages/protocol-buffers/...
  templates/proto/tsup.config.ts         → <out>/packages/protocol-buffers/...
  templates/proto/src-placeholder/       → <out>/packages/protocol-buffers/src/
                                           (kept empty; buf generate fills it)
  templates/proto/proto-tree/*           → <out>/proto/<APP_SLUG>/*
  templates/backend/*                    → <out>/packages/backend/*
  templates/interface/*                  → <out>/packages/interface/*
  templates/site/*                       → <out>/packages/docs-site/*

`.tmpl` files have placeholders substituted and the suffix dropped.
Everything else is copied verbatim.
"""
from __future__ import annotations

import argparse
import re
from datetime import date
import shutil
import sys
from pathlib import Path

PLACEHOLDER_KEYS = (
    "__APP_NAME__",
    "__APP_SLUG__",
    "__APP_SLUG_UPPER__",
    "__ORG_SCOPE__",
    "__LICENSE_FIELD__",
    "__LICENSE_RULE__",
)

SLUG_RE = re.compile(r"^[a-z][a-z0-9-]*$")
SPDX_RE = re.compile(r"^[A-Za-z0-9.+-]+$")

# Licences whose text ships in templates/licenses/<id>.txt.tmpl.
BUNDLED_LICENSES = ("Apache-2.0", "MIT")
# Files that take a `//` comment header.
HEADER_SUFFIXES = {".ts", ".tsx", ".js", ".mjs", ".go"}


def derive_substitutions(name: str, slug: str, org: str, license_id: str) -> dict[str, str]:
    if not SLUG_RE.match(slug):
        sys.exit(f"--slug must be lowercase letters, digits, or dashes: {slug!r}")
    if not org.startswith("@"):
        sys.exit(f"--org must start with '@': {org!r}")
    if license_id != "none" and not SPDX_RE.match(license_id):
        sys.exit(f"--license must be 'none' or an SPDX identifier: {license_id!r}")
    if license_id == "none":
        license_field = "UNLICENSED"
        license_rule = (
            "No licence header yet: no LICENSE was chosen at bootstrap. Once one is,\n"
            "  start every hand-written source file with `// SPDX-License-Identifier: <id>`."
        )
    else:
        license_field = license_id
        license_rule = (
            f"Every hand-written source file starts with `// SPDX-License-Identifier: {license_id}`;\n"
            "  generated files, config and markdown do not."
        )
    return {
        "__APP_NAME__": name,
        "__APP_SLUG__": slug,
        "__APP_SLUG_UPPER__": slug.upper().replace("-", "_"),
        "__ORG_SCOPE__": org,
        "__LICENSE_FIELD__": license_field,
        "__LICENSE_RULE__": license_rule,
    }


def substitute(text: str, subs: dict[str, str]) -> str:
    for key, value in subs.items():
        text = text.replace(key, value)
    return text


def copy_file(src: Path, dst: Path, subs: dict[str, str]) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if src.suffix == ".tmpl":
        # Drop the .tmpl suffix on the way out.
        final = dst.with_name(dst.name[: -len(".tmpl")])
        final.write_text(substitute(src.read_text(encoding="utf-8"), subs), encoding="utf-8")
    else:
        shutil.copyfile(src, dst)


def copy_tree(src_root: Path, dst_root: Path, subs: dict[str, str]) -> None:
    for src in src_root.rglob("*"):
        if src.is_dir():
            continue
        rel = src.relative_to(src_root)
        copy_file(src, dst_root / rel, subs)


def scaffold(templates: Path, out: Path, subs: dict[str, str]) -> None:
    if out.exists() and any(out.iterdir()):
        sys.exit(f"Refusing to scaffold into non-empty directory: {out}")
    out.mkdir(parents=True, exist_ok=True)

    # Root configs.
    copy_tree(templates / "root", out, subs)

    # Protocol-buffers package.
    pb_pkg = out / "packages" / "protocol-buffers"
    proto_src = templates / "proto"
    for entry in ("package.json.tmpl", "tsconfig.json", "tsup.config.ts"):
        copy_file(proto_src / entry, pb_pkg / entry, subs)
    # Keep the src/ folder so tsup has somewhere to write into. Buf generate
    # fills it on `pnpm install` (postinstall hook). Drop a .gitkeep until then.
    (pb_pkg / "src").mkdir(parents=True, exist_ok=True)
    (pb_pkg / "src" / ".gitkeep").write_text("", encoding="utf-8")

    # Hand-written proto sources land under proto/<slug>/...
    proto_tree_src = templates / "proto" / "proto-tree"
    proto_tree_dst = out / "proto" / subs["__APP_SLUG__"]
    copy_tree(proto_tree_src, proto_tree_dst, subs)

    # Backend package.
    copy_tree(templates / "backend", out / "packages" / "backend", subs)

    # Interface package.
    copy_tree(templates / "interface", out / "packages" / "interface", subs)

    # Docs site: the worked example of a static site built from the contract.
    copy_tree(templates / "site", out / "packages" / "docs-site", subs)


def stamp_headers(out: Path, license_id: str) -> int:
    """Prepend the SPDX header to every generated source file. Returns the count."""
    header = f"// SPDX-License-Identifier: {license_id}\n"
    count = 0
    for path in out.rglob("*"):
        if not path.is_file() or path.suffix not in HEADER_SUFFIXES:
            continue
        text = path.read_text(encoding="utf-8")
        if text.startswith("#!") or text.startswith(header):
            continue
        path.write_text(header + text, encoding="utf-8")
        count += 1
    return count


def write_license(templates: Path, out: Path, license_id: str, holder: str) -> bool:
    """Write LICENSE (and NOTICE for Apache-2.0) when the text is bundled."""
    if license_id not in BUNDLED_LICENSES:
        return False
    subs = {"__COPYRIGHT_HOLDER__": holder, "__YEAR__": str(date.today().year)}
    text = (templates / "licenses" / f"{license_id}.txt.tmpl").read_text(encoding="utf-8")
    (out / "LICENSE").write_text(substitute(text, subs), encoding="utf-8")
    if license_id == "Apache-2.0":
        notice = (templates / "licenses" / "NOTICE.txt.tmpl").read_text(encoding="utf-8")
        (out / "NOTICE").write_text(substitute(notice, subs), encoding="utf-8")
    return True


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--name", required=True, help="Display name, e.g. 'Foobar'")
    parser.add_argument("--slug", required=True, help="Lowercase slug, e.g. 'foobar'")
    parser.add_argument("--org", required=True, help="npm scope, e.g. '@foobar-tech'")
    parser.add_argument("--out", required=True, help="Target directory (must be empty or non-existent)")
    parser.add_argument(
        "--license",
        default="none",
        help="SPDX licence id (e.g. 'Apache-2.0', 'MIT') or 'none' (default). "
        "Stamps a header on every source file; writes LICENSE for bundled texts.",
    )
    parser.add_argument(
        "--copyright",
        default=None,
        help="Copyright holder for the LICENSE text; required unless --license is 'none'",
    )
    parser.add_argument(
        "--templates",
        default=str(Path(__file__).resolve().parent.parent / "templates"),
        help="Path to the templates dir (defaults to the bundled one)",
    )
    args = parser.parse_args(argv)

    if args.license != "none" and not args.copyright:
        parser.error("--copyright is required when --license is not 'none'")
    subs = derive_substitutions(args.name, args.slug, args.org, args.license)
    templates, out = Path(args.templates), Path(args.out).resolve()
    scaffold(templates, out, subs)
    print(f"Scaffolded {args.name} ({args.slug}) into {args.out}")
    if args.license != "none":
        stamped = stamp_headers(out, args.license)
        print(f"Stamped `// SPDX-License-Identifier: {args.license}` on {stamped} source files")
        if write_license(templates, out, args.license, args.copyright):
            print(f"Wrote LICENSE ({args.license}, {args.copyright})")
        else:
            print(f"No bundled text for {args.license}: add LICENSE yourself")
    print()
    print("Next steps:")
    print(f"  cd {args.out}")
    print("  pnpm install   # runs proto:gen + build via postinstall")
    print("  pnpm dev:backend")
    print("  pnpm dev:interface   # in another terminal")
    print("  pnpm dev:docs-site   # the contract, rendered from the protos")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
