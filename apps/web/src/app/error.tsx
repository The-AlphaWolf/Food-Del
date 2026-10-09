"use client";

import { Button } from "@/components/ui/primitives";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container-page flex flex-col items-center gap-4 py-24 text-center">
      <h1 className="text-4xl font-extrabold">Something went wrong</h1>
      <p className="max-w-md text-ink-soft">
        Please try again. If it keeps happening, mention reference {error.digest ?? "—"} when you
        contact us.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
