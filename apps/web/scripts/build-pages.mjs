// Build the GitHub Pages demo: bundle the in-browser backend, then a static export of the site.
// Pages that render per request on a server are switched to static for the export (Next needs
// `dynamic` to be a literal, so it can't depend on an environment variable) and restored after.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const app = fileURLToPath(new URL("..", import.meta.url));
const PAGES = [
  "src/app/page.tsx",
  "src/app/search/page.tsx",
  "src/app/from/[city]/page.tsx",
  "src/app/kitchens/[slug]/page.tsx",
  "src/app/delicacy/[slug]/page.tsx",
  "src/app/send/[slug]/to/[city]/page.tsx",
];
const DYNAMIC = 'export const dynamic = "force-dynamic";';
const STATIC = 'export const dynamic = "force-static";';

const env = {
  ...process.env,
  NEXT_PUBLIC_STATIC_DEMO: "1",
  NEXT_PUBLIC_DEV_TOOLS: "1",
  NEXT_PUBLIC_AUTH_MODE: "dev",
  NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH ?? "/Food-Del",
};
const run = (cmd) => execSync(cmd, { cwd: app, stdio: "inherit", env });

const originals = new Map();
try {
  for (const page of PAGES) {
    const path = `${app}/${page}`;
    const source = readFileSync(path, "utf8");
    if (!source.includes(DYNAMIC)) throw new Error(`${page} no longer declares ${DYNAMIC}`);
    originals.set(path, source);
    writeFileSync(path, source.replace(DYNAMIC, STATIC));
  }
  run("pnpm --filter @food-del/demo bundle");
  run("next build");
} finally {
  for (const [path, source] of originals) writeFileSync(path, source);
}
