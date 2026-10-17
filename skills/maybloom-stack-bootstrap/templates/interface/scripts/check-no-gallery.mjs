// Keeps the gallery and the design passes out of the app, by what was
// built rather than how imports are spelled. `pnpm check:no-gallery`
// exports the app with source maps to `dist-check` and runs this over it:
// - no source under gallery/, src/gallery/ or src/design/ may be in the
//   bundle's source maps, however it got there (any import form, depth,
//   alias, re-export through another file, require() or import());
// - the bundle must not carry the gallery's sentinel, the testID on its
//   page (src/gallery/sentinel.json).
// Biome's noRestrictedImports is the fast hint in the editor; this is the
// guarantee. The shipped export (`pnpm build:web`, `dist/`) has no maps and
// is not touched.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const dir = process.argv[2] ?? "dist-check";
// The package root; fileURLToPath decodes a space (`%20`) in the path.
const root = fileURLToPath(new URL("..", import.meta.url));
const { testID: sentinel } = JSON.parse(
  readFileSync(join(root, "src", "gallery", "sentinel.json"), "utf8"),
);

if (!existsSync(dir)) {
  console.error(`${dir} does not exist: run pnpm check:no-gallery, which exports it`);
  process.exit(1);
}

const files = readdirSync(dir, { recursive: true })
  .map((f) => join(dir, f))
  .filter((f) => statSync(f).isFile());
const maps = files.filter((f) => f.endsWith(".js.map"));
if (maps.length === 0) {
  console.error(`${dir} has no source maps: export it with --source-maps`);
  process.exit(1);
}

// Metro names sources from the server root, the workspace root in this
// monorepo (`/packages/interface/src/...`), so the package's own files are
// the ones under its path from there.
let serverRoot = root;
while (!existsSync(join(serverRoot, "pnpm-workspace.yaml"))) {
  const up = dirname(serverRoot);
  if (up === serverRoot) {
    serverRoot = root;
    break;
  }
  serverRoot = up;
}
const pkg = relative(serverRoot, root).split(sep).join("/");
const prefix = pkg ? `${pkg}/` : "";
// A file or a require.context over the folder (`gallery?ctx=...`).
const forbidden = /^(?:gallery|src\/gallery|src\/design)(?:[/?]|$)/;

const leaked = new Set();
for (const map of maps) {
  const { sources = [] } = JSON.parse(readFileSync(map, "utf8"));
  for (const source of sources) {
    const path = source.replace(/^\/+/, "");
    if (!path.startsWith(prefix)) continue;
    const inPackage = path.slice(prefix.length);
    if (forbidden.test(inPackage)) leaked.add(inPackage.replace(/\?.*$/, ""));
  }
}
const marked = files.filter(
  (f) => /\.(js|html)$/.test(f) && readFileSync(f, "utf8").includes(sentinel),
);

if (leaked.size > 0 || marked.length > 0) {
  if (leaked.size > 0)
    console.error(
      `the app's bundle contains the gallery or src/design:\n  ${[...leaked].sort().join("\n  ")}`,
    );
  if (marked.length > 0)
    console.error(
      `the gallery's sentinel is in the app's export:\n  ${marked.join("\n  ")}`,
    );
  process.exit(1);
}
console.log(
  `${dir}: none of gallery/, src/gallery or src/design in the app's bundle (${maps.length} source maps)`,
);
