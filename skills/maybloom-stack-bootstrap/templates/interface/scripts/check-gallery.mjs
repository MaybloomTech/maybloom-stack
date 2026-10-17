// Every feature module that exports a component is on the design board.
// The Components sheet is keyed by the exports of the modules it lists, so
// the typecheck catches a new component in a listed module; this catches a
// module that is not listed at all. A platform variant (`Map.web.tsx`,
// `.native`, `.ios`, `.android`) is the same module as its base file, and
// `x/index.tsx` is module `x`.
//
// It also refuses a default or class component export under src/features:
// the sheet's ComponentsOf sees only named function components (and
// memos), so either would pass the typecheck with no entry.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const features = join(root, "src", "features");
const sheet = readFileSync(
  join(root, "src", "gallery", "ComponentSheet.tsx"),
  "utf8",
);

const files = existsSync(features)
  ? readdirSync(features, { recursive: true })
      .map((f) => join(features, f))
      .filter((f) => statSync(f).isFile() && f.endsWith(".tsx"))
  : [];

// A component here is an export with a component's name: capitalised with
// a lowercase letter somewhere (`NoteRow`, `QRCode`; not `MAX_ITEMS`, not a
// hook): a function, a class, a const of any kind (an arrow, `memo(`,
// `forwardRef(`), a name in an `export { }` list, or a default export that
// is a capitalised function or a `memo(`/`forwardRef(`. The sheet's
// ComponentsOf then sorts out what renders.
const name = String.raw`[A-Z]\w*[a-z]\w*\b`;
const declared = new RegExp(
  String.raw`^export (?:default )?(?:async )?(?:function|class|const|let) ${name}`,
  "m",
);
const defaultWrapped = /^export default (?:memo|forwardRef)\(/m;
const componentBase = String.raw`(?:React\.)?(?:Pure)?Component\b`;
// What ComponentsOf cannot see: a default export of a component, or a
// component class.
const defaultComponent = new RegExp(
  String.raw`^export default (?:(?:async )?function ${name}|class (?:\w+ )?extends ${componentBase}|(?:memo|forwardRef)\(|${name}\s*;)`,
  "m",
);
// Only a component class: `export class HttpError extends Error` is not one.
const classComponent = new RegExp(
  String.raw`^export (?:default )?class ${name}\s+extends ${componentBase}`,
  "m",
);
// `export { Foo, bar as Baz }`, leaving out `type` names.
const listedNames = (source) =>
  [...source.matchAll(/^export \{([^}]*)\}/gm)]
    .flatMap((m) => m[1].split(","))
    .map((n) => n.trim())
    .filter((n) => n && !n.startsWith("type "))
    .map((n) => n.split(/\s+as\s+/).pop());
const exportsComponent = (source) =>
  declared.test(source) ||
  defaultWrapped.test(source) ||
  listedNames(source).some((n) => new RegExp(`^${name}$`).test(n));

const moduleOf = (f) =>
  relative(features, f)
    .split(sep)
    .join("/")
    .replace(/(\.(?:web|native|ios|android))?\.tsx$/, "")
    .replace(/\/index$/, "");

const unseen = files
  .filter((f) => {
    const source = readFileSync(f, "utf8");
    return (
      defaultComponent.test(source) ||
      classComponent.test(source) ||
      /^export \{[^}]*\b[A-Z]\w*\s+as\s+default\b/m.test(source)
    );
  })
  .map((f) => relative(root, f).split(sep).join("/"));
if (unseen.length > 0) {
  console.error(
    `default or class component exports under src/features, which the board's typecheck cannot see (export a named function component instead):\n  ${unseen.join("\n  ")}`,
  );
  process.exit(1);
}

const modules = new Set(
  files.filter((f) => exportsComponent(readFileSync(f, "utf8"))).map(moduleOf),
);

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// `x` is listed as `../features/x` or, for an index module, also as
// `../features/x/index`.
const listed = (m) =>
  new RegExp(
    `import type \\* as \\w+ from (['"])\\.\\./features/${escape(m)}(?:/index)?\\1;`,
  ).test(sheet);
const missing = [...modules].filter((m) => !listed(m));
if (missing.length > 0) {
  console.error(
    `feature modules missing from src/gallery/ComponentSheet.tsx (add an \`import type * as\`, the module to FeatureComponents, and its entries):\n  ${missing.join("\n  ")}`,
  );
  process.exit(1);
}
console.log(
  `design board covers all ${modules.size} feature modules with components`,
);
