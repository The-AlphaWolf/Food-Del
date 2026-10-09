import { createDb } from "../client";
import { seed } from "../seed";
import { databaseUrl } from "./env";

const { db, close } = createDb(databaseUrl(), { max: 1 });
try {
  console.log("Seeded.", await seed(db, { today: new Date() }));
} finally {
  await close();
}
