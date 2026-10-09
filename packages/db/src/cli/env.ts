import "dotenv/config";

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set (see .env.example).");
    process.exit(1);
  }
  return url;
}
