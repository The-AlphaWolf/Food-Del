/** The demo talks to PGlite; postgres.js (TCP) can't run in a browser. */
export default function postgres(): never {
  throw new Error("postgres.js is not available in the browser demo");
}
