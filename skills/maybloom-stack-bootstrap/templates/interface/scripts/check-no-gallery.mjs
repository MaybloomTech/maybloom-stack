// Keeps the gallery and the design passes out of the app, in two checks:
// - the app's web export (default `dist`) must not carry the gallery's
//   sentinel, the testID on its page;
// - no source file outside the gallery may require() or require.context()
//   the gallery or src/design, which Biome's noRestrictedImports does not
//   see (it reads import statements only). A minified bundle names modules
//   by number, so the export alone cannot show src/design.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const sentinel = "design-board-gallery";
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
const allowed = /^(gallery|src\/gallery|src\/design)\//;
const requires =
  /require(?:\.context)?\(\s*['"`][^'"`]*\/(?:design|gallery)(?:\/|['"`])/;
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
