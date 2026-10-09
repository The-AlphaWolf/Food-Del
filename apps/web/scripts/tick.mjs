// Development scheduler: runs every job once per interval against the local app.
const base = process.env.APP_URL ?? "http://localhost:3000";
const every = Number(process.env.TICK_SECONDS ?? 30) * 1000;

async function tick() {
  try {
    const res = await fetch(`${base}/api/v1/dev/tick`, { method: "POST" });
    const results = await res.json();
    const busy = Array.isArray(results) ? results.filter((r) => r.processed > 0) : [];
    if (busy.length)
      console.log(new Date().toISOString(), busy.map((r) => `${r.job}:${r.processed}`).join(" "));
  } catch (e) {
    console.warn("tick failed:", e.message);
  }
}

console.log(`Ticking ${base} every ${every / 1000}s (Ctrl+C to stop)`);
await tick();
setInterval(tick, every);
