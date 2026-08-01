// @ts-check
import { defineConfig } from "astro/config";

export default defineConfig({
  // Static output: the whole site is files, served by nginx. The contract is
  // read at build time, so there is nothing left to do at request time.
  output: "static",
  // `site` is only needed once this is published somewhere; set it then so
  // canonical URLs and a sitemap have something to be absolute against.
  // site: "https://docs.example.com",
});
