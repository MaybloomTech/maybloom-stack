// Readies the gallery's static export (`pnpm build:gallery`) to be served
// from any path: Expo writes root-absolute URLs (`/_expo/…`, `/assets/…`),
// which become relative, and `_expo/` becomes `expo/`, since some static
// hosts reserve or hide names that start with `_`. It checks the export is
// the gallery's before touching anything, then lists the files to publish
// in files.json.
import {
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// The gallery's sentinel, the testID on its page (src/gallery/Gallery.tsx
// reads the same file).
const { testID: sentinel } = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../src/gallery/sentinel.json", import.meta.url)),
    "utf8",
  ),
);
const dir = process.argv[2];
if (!dir) {
  console.error("usage: node scripts/gallery-export.mjs <export dir>");
  process.exit(2);
}
if (!existsSync(join(dir, "_expo"))) {
  console.error(
    `${dir} has no _expo/: it is already processed or not an export; run pnpm build:gallery again`,
  );
  process.exit(1);
}

const list = () =>
  readdirSync(dir, { recursive: true }).filter((f) =>
    statSync(join(dir, f)).isFile(),
  );

// The sentinel must be in the bundle, or this is the app's export: refuse
// before renaming or rewriting anything.
const isGallery = list()
  .filter((f) => f.endsWith(".js"))
  .some((f) => readFileSync(join(dir, f), "utf8").includes(sentinel));
if (!isGallery) {
  console.error(
    `${dir} is not the gallery's export: no "${sentinel}" in its bundle; left as it was`,
  );
  process.exit(1);
}

renameSync(join(dir, "_expo"), join(dir, "expo"));
const files = list();

const rewrite = (file, edit) => {
  const path = join(dir, file);
  writeFileSync(path, edit(readFileSync(path, "utf8")));
};

// `/_expo/` first, in any attribute (scripts, stylesheets, preloads), then
// every other root-absolute src or href; protocol-relative ones (`//host`)
// are left alone.
for (const file of files.filter((f) => f.endsWith(".html"))) {
  const up = relative(dirname(file), ".") || ".";
  rewrite(file, (html) =>
    html
      .replaceAll('"/_expo/', `"${up}/expo/`)
      .replace(/(href|src)="\/(?!\/)/g, `$1="${up}/`),
  );
}

for (const file of files.filter((f) => f.endsWith(".js"))) {
  rewrite(file, (js) =>
    js.replaceAll('"/_expo/', '"./expo/').replaceAll('"/assets/', '"./assets/'),
  );
}

// A stylesheet's url() resolves against the stylesheet, not the page.
for (const file of files.filter((f) => f.endsWith(".css"))) {
  const up = relative(dirname(file), ".") || ".";
  rewrite(file, (css) =>
    css.replace(
      /url\((['"]?)\/(?!\/)(_expo\/)?/g,
      (_, quote, expo) => `url(${quote}${up}/${expo ? "expo/" : ""}`,
    ),
  );
}

const published = files.filter((f) => f !== "metadata.json").sort();
writeFileSync(
  join(dir, "files.json"),
  `${JSON.stringify(published, null, 2)}\n`,
);
console.log(
  `gallery export ready: ${published.length} files, listed in ${join(dir, "files.json")}`,
);
