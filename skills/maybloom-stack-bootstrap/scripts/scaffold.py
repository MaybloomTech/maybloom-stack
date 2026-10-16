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
  __GO_MODULE__      — the Go module path (e.g. "github.com/foobar-tech/foobar/go");
                        written into every proto's go_package on both paths,
                        so a Go service can be added later without touching
                        the contract
  __BACKEND_PORT__   — the port the backend listens on: 8080 for Go, 3000 for
                        TypeScript; the interface's default API URL follows it
  __LICENSE_FIELD__  — the package.json "license" value: the SPDX id, or
                        UNLICENSED when no licence was chosen
  __LICENSE_RULE__   — the licence-header rule written into CLAUDE.md

A licence is optional (`--license`, default `none`). When one is chosen,
every hand-written source file (.ts, .tsx, .js, .mjs, .go; config files and
.d.ts declarations excepted, as the CLAUDE.md rule says) gets a first line
`// SPDX-License-Identifier: <id>`, and for Apache-2.0 and MIT a LICENSE
file (and NOTICE, for Apache) is written from templates/licenses/ with the
`--copyright` holder and the current year. Any other SPDX id gets the
headers only; the LICENSE file is the user's to add.

The backend is Go by default (`--backend go`, the stack's default since
September 2026) or TypeScript on request (`--backend typescript`, the
documented alternative path). Both serve the same contract.

Layout mapping (templates → output):

  templates/root/*                       → <out>/                (shared)
  templates/root-<backend>/*             → <out>/                (package.json, CLAUDE.md,
                                           and for Go: go.work, scripts/go, scripts/golangci-lint)
  templates/third_party/*                → <out>/third_party/    (vendored buf/validate/validate.proto)
  templates/proto/package.json.tmpl      → <out>/packages/protocol-buffers/...
  templates/proto/tsconfig.json          → <out>/packages/protocol-buffers/...
  templates/proto/tsup.config.ts         → <out>/packages/protocol-buffers/...
  templates/proto/src-placeholder/       → <out>/packages/protocol-buffers/src/
                                           (kept empty; buf generate fills it)
  templates/proto/proto-tree/*           → <out>/proto/<APP_SLUG>/*
  templates/backend-go/*                 → <out>/go/*                (--backend go)
  templates/backend-typescript/*         → <out>/packages/backend/*  (--backend typescript)
  templates/interface/*                  → <out>/packages/interface/*
  templates/site/*                       → <out>/packages/docs-site/*

`.tmpl` files have placeholders substituted and the suffix dropped.
Everything else is copied verbatim (mode bits included, so the scripts stay
executable). Placeholders in directory and file names are substituted too
(`cmd/__APP_SLUG__/`).
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
    "__GO_MODULE__",
    "__BACKEND_PORT__",
    "__LICENSE_FIELD__",
    "__LICENSE_RULE__",
)

BACKENDS = {"go": "8080", "typescript": "3000"}

# A proto package segment and a TypeScript identifier at once, so no dashes:
# `package my-app.resources.v1` does not parse and `my-app_pb` is not a name.
SLUG_RE = re.compile(r"^[a-z][a-z0-9]*$")
SPDX_RE = re.compile(r"^[A-Za-z0-9.+-]+$")
GO_MODULE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._~-]*(/[A-Za-z0-9._~-]+)+$")

# Licences whose text ships in templates/licenses/<id>.txt.tmpl.
BUNDLED_LICENSES = ("Apache-2.0", "MIT")
# Files that take a `//` comment header.
HEADER_SUFFIXES = {".ts", ".tsx", ".js", ".mjs", ".go"}


def takes_header(path: Path) -> bool:
    """Source files only: the rule written into CLAUDE.md exempts config and declarations."""
    if path.suffix not in HEADER_SUFFIXES:
        return False
    return ".config." not in path.name and not path.name.endswith(".d.ts")


def default_go_module(slug: str, org: str) -> str:
    """github.com/<org without the @>/<slug>/go: the module lives in go/, so its path ends there."""
    return f"github.com/{org.lstrip('@')}/{slug}/go"


def derive_substitutions(
    name: str, slug: str, org: str, license_id: str, backend: str, go_module: str | None
) -> dict[str, str]:
    if not SLUG_RE.match(slug):
        sys.exit(
            f"--slug must be lowercase letters and digits, starting with a letter, no dashes "
            f"(it is the proto package and a TypeScript identifier): {slug!r}"
        )
    if not org.startswith("@"):
        sys.exit(f"--org must start with '@': {org!r}")
    if backend not in BACKENDS:
        sys.exit(f"--backend must be one of {', '.join(BACKENDS)}: {backend!r}")
    go_module = go_module or default_go_module(slug, org)
    if not GO_MODULE_RE.match(go_module):
        sys.exit(f"--go-module must be an import path like github.com/acme/orchard/go: {go_module!r}")
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
        "__APP_SLUG_UPPER__": slug.upper(),
        "__ORG_SCOPE__": org,
        "__GO_MODULE__": go_module,
        "__BACKEND_PORT__": BACKENDS[backend],
        "__LICENSE_FIELD__": license_field,
        "__LICENSE_RULE__": license_rule,
    }


def substitute(text: str, subs: dict[str, str]) -> str:
    for key, value in subs.items():
        text = text.replace(key, value)
    return text


def copy_file(src: Path, dst: Path, subs: dict[str, str]) -> None:
    # Placeholders in the path too (cmd/__APP_SLUG__/main.go).
    dst = Path(substitute(str(dst), subs))
    dst.parent.mkdir(parents=True, exist_ok=True)
    if src.suffix == ".tmpl":
        # Drop the .tmpl suffix on the way out.
        final = dst.with_name(dst.name[: -len(".tmpl")])
        final.write_text(substitute(src.read_text(encoding="utf-8"), subs), encoding="utf-8")
        shutil.copymode(src, final)
    else:
        shutil.copy2(src, dst)


def copy_tree(src_root: Path, dst_root: Path, subs: dict[str, str]) -> None:
    for src in sorted(src_root.rglob("*")):
        if src.is_dir():
            continue
        rel = src.relative_to(src_root)
        copy_file(src, dst_root / rel, subs)


def scaffold(templates: Path, out: Path, subs: dict[str, str], backend: str) -> None:
    if out.exists() and any(out.iterdir()):
        sys.exit(f"Refusing to scaffold into non-empty directory: {out}")
    out.mkdir(parents=True, exist_ok=True)

    # Root configs: the shared ones, then the backend's own (package.json,
    # CLAUDE.md, and the Go toolchain wrappers on the Go path).
    copy_tree(templates / "root", out, subs)
    copy_tree(templates / f"root-{backend}", out, subs)

    # The vendored protovalidate module: the contract's field rules resolve
    # against it with no registry dependency.
    copy_tree(templates / "third_party", out / "third_party", subs)

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

    # The backend: the Go module at go/, or the TypeScript package.
    if backend == "go":
        copy_tree(templates / "backend-go", out / "go", subs)
    else:
        copy_tree(templates / "backend-typescript", out / "packages" / "backend", subs)

    # Interface package.
    copy_tree(templates / "interface", out / "packages" / "interface", subs)

    # Docs site: the worked example of a static site built from the contract.
    copy_tree(templates / "site", out / "packages" / "docs-site", subs)


def stamp_headers(out: Path, license_id: str) -> int:
    """Prepend the SPDX header to every hand-written source file. Returns the count."""
    # A blank line after the header keeps a package or module doc comment a
    # doc comment rather than a continuation of the licence line.
    header = f"// SPDX-License-Identifier: {license_id}\n\n"
    count = 0
    for path in out.rglob("*"):
        if not path.is_file() or not takes_header(path):
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
    parser.add_argument("--slug", required=True, help="Lowercase letters and digits, e.g. 'foobar' (no dashes: proto package, TS identifier)")
    parser.add_argument("--org", required=True, help="npm scope, e.g. '@foobar-tech'")
    parser.add_argument("--out", required=True, help="Target directory (must be empty or non-existent)")
    parser.add_argument(
        "--backend",
        default="go",
        choices=sorted(BACKENDS),
        help="The backend to scaffold: go (default; connect-go + sqlc + pgx + goose) "
        "or typescript (Fastify + Drizzle + PGlite, the documented alternative)",
    )
    parser.add_argument(
        "--go-module",
        default=None,
        help="Go module path for go/ and every proto's go_package "
        "(default: github.com/<org without @>/<slug>/go)",
    )
    parser.add_argument(
        "--license",
        default="none",
        help="SPDX licence id (e.g. 'Apache-2.0', 'MIT') or 'none' (default). "
        "Stamps a header on every source file (config and .d.ts excepted); writes LICENSE for bundled texts.",
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
    subs = derive_substitutions(args.name, args.slug, args.org, args.license, args.backend, args.go_module)
    templates, out = Path(args.templates), Path(args.out).resolve()
    scaffold(templates, out, subs, args.backend)
    print(f"Scaffolded {args.name} ({args.slug}) into {args.out} with the {args.backend} backend")
    if args.backend == "go":
        print(f"Go module: {subs['__GO_MODULE__']}")
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
    print("  pnpm install   # runs proto:gen + proto:descriptor + build via postinstall")
    if args.backend == "go":
        print("  docker compose up -d db            # the development Postgres")
        print("  (cd go && go mod tidy && go generate .)   # go.sum, then the contract and the data layer")
        print("  pnpm dev:backend                   # migrates on boot, listens on :8080")
    else:
        print(f"  pnpm --filter {args.org}/backend db:generate   # the first Drizzle migration")
        print("  pnpm dev:backend                   # PGlite, listens on :3000")
    print("  pnpm dev:interface   # in another terminal")
    print("  pnpm dev:docs-site   # the contract, rendered from the protos")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
