/**
 * Service worker for the GitHub Pages demo. It answers the site's `/api/*` requests with the
 * real Food-Del API running here, against Postgres (PGlite) stored in this browser's IndexedDB.
 * Nothing leaves the browser; every visitor gets their own kitchens, orders and ops console.
 */
import { createDemoBackend, type DemoBackend } from "./backend";

declare const self: ServiceWorkerGlobalScope;

/** "/Food-Del" on GitHub Pages, "" at a domain root. */
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const API = `${BASE}/api/`;
/** Scheduled jobs run at most this often, triggered by API traffic. */
const TICK_MS = 60_000;
const DATA_DIR = "idb://food-del-demo";

let backend: Promise<DemoBackend> | null = null;
let stage = "Waking up";
let lastTick = 0;

async function broadcast(message: Record<string, unknown>) {
  for (const client of await self.clients.matchAll({ includeUncontrolled: true })) {
    client.postMessage({ source: "food-del-demo", ...message });
  }
}
function progress(next: string) {
  stage = next;
  void broadcast({ type: "progress", stage });
}

async function start(): Promise<DemoBackend> {
  progress("Downloading Postgres (about 6 MB, once)");
  const asset = (name: string) => `${BASE}/demo/${name}`;
  const [pgliteWasmModule, initdbWasmModule, fsBundle] = await Promise.all([
    WebAssembly.compileStreaming(fetch(asset("pglite.wasm"))),
    WebAssembly.compileStreaming(fetch(asset("initdb.wasm"))),
    fetch(asset("pglite.data")).then((r) => r.blob()),
  ]);
  const b = await createDemoBackend({
    dataDir: DATA_DIR,
    basePath: `${BASE}/api`,
    appUrl: `${self.location.origin}${BASE}`,
    pglite: { pgliteWasmModule, initdbWasmModule, fsBundle, relaxedDurability: true },
    onProgress: progress,
    logger: {
      info: () => {},
      warn: (m, d) => console.warn(m, d),
      error: (m, d) => console.error(m, d),
    },
  });
  progress("Ready");
  void broadcast({ type: "ready" });
  return b;
}

function getBackend(): Promise<DemoBackend> {
  if (!backend) {
    backend = start().catch((e) => {
      backend = null;
      void broadcast({ type: "error", message: e instanceof Error ? e.message : String(e) });
      throw e;
    });
  }
  return backend;
}

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === `${API}demo/status`) {
    return Response.json({ stage, ready: stage === "Ready" });
  }
  let b: DemoBackend;
  try {
    b = await getBackend();
  } catch (e) {
    return Response.json(
      { title: "The demo backend couldn't start in this browser.", detail: String(e) },
      { status: 503, headers: { "Content-Type": "application/problem+json" } },
    );
  }
  if (Date.now() - lastTick > TICK_MS) {
    lastTick = Date.now();
    // Ahead of the request, so batches lock and queued work goes out as it would on a server.
    await b.tick();
  }
  return b.api.fetch(request);
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
  void getBackend();
});

/** Erase this browser's demo database and start again from the seed. */
async function reset(): Promise<void> {
  const current = backend;
  backend = null;
  stage = "Waking up";
  if (current) await (await current.catch(() => null))?.client.close();
  const name = DATA_DIR.replace("idb://", "");
  const dbs = (await indexedDB.databases?.().catch(() => [])) ?? [];
  const names = dbs.map((d) => d.name).filter((n): n is string => !!n && n.includes(name));
  for (const n of names.length ? names : [`/pglite/${name}`, name]) {
    await new Promise<void>((resolve) => {
      const r = indexedDB.deleteDatabase(n);
      r.onsuccess = r.onerror = r.onblocked = () => resolve();
    });
  }
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "reset") {
    event.waitUntil(
      reset().then(() =>
        event.source?.postMessage({ source: "food-del-demo", type: "reset-done" }),
      ),
    );
    return;
  }
  if (event.data?.type === "start") {
    void getBackend();
    event.source?.postMessage({ source: "food-del-demo", type: "progress", stage });
  }
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname.startsWith(API)) {
    event.respondWith(handle(event.request));
  }
});
