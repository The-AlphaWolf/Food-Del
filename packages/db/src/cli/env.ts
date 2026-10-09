import { fileURLToPath } from "node:url";
import { config } from "dotenv";

// The repo-root .env shared with the web app (a package-local .env, if any, wins).
config({
  path: [".env", fileURLToPath(new URL("../../../../.env", import.meta.url))],
  quiet: true,
});

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set (see .env.example).");
    process.exit(1);
  }
  return url;
}
