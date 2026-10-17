// Keeps the gallery and the design passes out of the app, in two checks:
// - the app's web export (default `dist`) must not carry the gallery's
//   sentinel, the testID on its page;
// - no source file outside the gallery may require(), require.context() or
//   import() the gallery or src/design, which Biome's noRestrictedImports
//   does not see (it reads import statements only). Test files under src/
//   are exempt, as in biome.json: Metro never bundles them, and a test may
//   reuse the board's fake backend. A minified bundle names modules
//   by number, so the export alone cannot show src/design.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

// The gallery's sentinel, the testID on its page (src/gallery/Gallery.tsx
// reads the same file).
const { testID: sentinel } = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../src/gallery/sentinel.json", import.meta.url)),
    "utf8",
  ),
);
const dir = process.argv[2] ?? "dist";
// The package root; fileURLToPath decodes a space (`%20`) in the path.
const root = fileURLToPath(new URL("..", import.meta.url));

if (!existsSync(dir)) {
  console.error(`${dir} does not exist: run pnpm build:web first`);
  process.exit(1);
}

const filesUnder = (d) =>
  readdirSync(d, { recursive: true })
    .map((f) => join(d, f))
    .filter((f) => statSync(f).isFile());

const leaked = filesUnder(dir).filter(
  (f) => /\.(js|html)$/.test(f) && readFileSync(f, "utf8").includes(sentinel),
);

// Tested against the path inside the package, so a `gallery` folder above
// the checkout exempts nothing.
const allowed =
  /^(gallery|src\/gallery|src\/design)\/|^src\/.*(\.test\.[jt]sx?$|\/__tests__\/)/;
// A relative or `@/` specifier that names the gallery or src/design
// (`../gallery`, `../../src/design/x`, `@/gallery`), not any path that
// happens to end in one of those words (`../styles/design`).
const requires =
  /(?:require(?:\.context)?|import)\(\s*['"`](?:@\/|\.\/|(?:\.\.\/)+)(?:src\/)?(?:design|gallery)(?:\/|['"`])/;
const sources = ["app", "src"]
  .flatMap((d) => filesUnder(join(root, d)))
  .filter(
    (f) =>
      /\.[jt]sx?$/.test(f) &&
      !allowed.test(relative(root, f).split(sep).join("/")) &&
      requires.test(readFileSync(f, "utf8")),
  );

if (leaked.length > 0 || sources.length > 0) {
  if (leaked.length > 0)
    console.error(`the gallery leaked into ${dir}:\n  ${leaked.join("\n  ")}`);
  if (sources.length > 0)
    console.error(
      `the app requires the gallery or src/design:\n  ${sources.join("\n  ")}`,
    );
  process.exit(1);
}
console.log(
  `${dir}: no gallery in the export, and no require() of it in app code`,
);
