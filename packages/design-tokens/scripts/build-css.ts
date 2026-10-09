/** Generate Tailwind v4 `@theme` CSS from the TypeScript tokens. Run after editing tokens. */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderThemeCss } from "../src/css";

const out = fileURLToPath(new URL("../src/theme.css", import.meta.url));
writeFileSync(out, renderThemeCss());
console.log(`Wrote ${out}`);
