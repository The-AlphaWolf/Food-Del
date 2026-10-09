"use client";

import { Info, RotateCcw } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { BASE_PATH } from "@/lib/demo";

type State =
  | { kind: "starting"; stage: string }
  | { kind: "ready" }
  | { kind: "unsupported"; reason: string };

const RELOADED = "food-del-demo-reloaded";

/** Wait until the service worker controls this page and its backend answers. */
async function start(onStage: (s: string) => void): Promise<void> {
  if (!("serviceWorker" in navigator)) throw new Error("This browser can't run service workers.");
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.source === "food-del-demo" && e.data.type === "progress") onStage(e.data.stage);
  });
  const reg = await navigator.serviceWorker.register(`${BASE_PATH}/demo-sw.js`, {
    scope: `${BASE_PATH}/`,
  });
  if (!navigator.serviceWorker.controller) {
    // A hard reload bypasses the worker; a normal one brings it back.
    if (reg.active && !sessionStorage.getItem(RELOADED)) {
      sessionStorage.setItem(RELOADED, "1");
      window.location.reload();
      return new Promise(() => {});
    }
    await new Promise<void>((resolve) =>
      navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
        once: true,
      }),
    );
  }
  sessionStorage.removeItem(RELOADED);
  navigator.serviceWorker.controller?.postMessage({ type: "start" });
  for (let i = 0; i < 120; i++) {
    const r = await fetch(`${BASE_PATH}/api/v1/health`).catch(() => null);
    if (r?.ok) return;
    if (r?.status === 503) throw new Error((await r.json()).detail ?? "The demo couldn't start.");
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error("The demo took too long to start. Please reload.");
}

async function resetDemo() {
  if (
    !window.confirm("Start over? Orders, kitchens and accounts you made in this demo are erased.")
  )
    return;
  const sw = navigator.serviceWorker.controller;
  if (sw) {
    await new Promise<void>((resolve) => {
      const done = (e: MessageEvent) => {
        if (e.data?.source === "food-del-demo" && e.data.type === "reset-done") resolve();
      };
      navigator.serviceWorker.addEventListener("message", done);
      sw.postMessage({ type: "reset" });
      setTimeout(resolve, 10_000);
    });
  }
  localStorage.clear();
  window.location.href = `${BASE_PATH}/`;
}

/**
 * GitHub Pages has no server, so the whole backend runs in this browser (a service worker with
 * Postgres compiled to WebAssembly). Pages render once it's up.
 */
export function DemoGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ kind: "starting", stage: "Starting the demo" });
  useEffect(() => {
    start((stage) => setState((s) => (s.kind === "starting" ? { kind: "starting", stage } : s)))
      .then(() => setState({ kind: "ready" }))
      .catch((e) => setState({ kind: "unsupported", reason: (e as Error).message }));
  }, []);

  if (state.kind === "ready") {
    return (
      <>
        <div className="border-b border-info/20 bg-info-soft text-info print:hidden">
          <div className="container-page flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-xs">
            <p className="flex items-start gap-1.5">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                <strong>Demo:</strong> everything runs in your browser, with test payments and a
                simulated courier. Sign in with any mobile number and code <strong>123456</strong>.
                Ops console: <strong>9900000002</strong>. A kitchen: <strong>9900000105</strong>.
              </span>
            </p>
            <button
              type="button"
              onClick={resetDemo}
              className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline"
            >
              <RotateCcw className="size-3.5" aria-hidden /> Reset demo
            </button>
          </div>
        </div>
        {children}
      </>
    );
  }
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-display text-4xl font-extrabold text-jaggery">Food-Del</p>
      {state.kind === "starting" ? (
        <>
          <div
            className="size-8 animate-spin rounded-full border-4 border-line border-t-jaggery"
            aria-hidden
          />
          <p className="font-semibold" role="status" aria-live="polite">
            {state.stage}…
          </p>
          <p className="max-w-sm text-sm text-ink-muted">
            This demo runs the whole platform in your browser, database included. The first visit
            takes a few seconds.
          </p>
        </>
      ) : (
        <p role="alert" className="max-w-md font-semibold text-danger">
          {state.reason} Try a current Chrome, Edge, Firefox or Safari, outside private browsing.
        </p>
      )}
    </div>
  );
}
