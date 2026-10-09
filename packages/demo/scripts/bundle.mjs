// Bundle the demo backend into one classic-script service worker and copy PGlite's WebAssembly
// next to it. Usage: node scripts/bundle.mjs <output dir> (defaults to apps/web/public).
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.argv[2] ?? join(here, "../../../apps/web/public"));
const require = createRequire(import.meta.url);
const pgliteDist = dirname(require.resolve("@electric-sql/pglite"));

await build({
  entryPoints: [join(here, "../src/sw.ts")],
  outfile: join(out, "demo-sw.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  sourcemap: true,
  conditions: ["browser", "import", "default"],
  alias: {
    "node:crypto": join(here, "../src/shims/node-crypto.ts"),
    crypto: join(here, "../src/shims/node-crypto.ts"),
    postgres: join(here, "../src/shims/postgres.ts"),
  },
  define: { "process.env.NODE_ENV": '"production"', "import.meta.url": '"file:///demo/"' },
  logLevel: "warning",
  logOverride: { "empty-import-meta": "silent" },
});
mkdirSync(join(out, "demo"), { recursive: true });
for (const f of ["pglite.wasm", "initdb.wasm", "pglite.data"]) {
  copyFileSync(join(pgliteDist, f), join(out, "demo", f));
}
console.log(`Demo service worker written to ${join(out, "demo-sw.js")}`);
