"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/cn";
import { type ThemePreference, useTheme } from "@/lib/theme";

/** Header button: one tap between light and Night. */
export function ThemeButton({ className }: { className?: string }) {
  const { resolved, setPreference } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setPreference(next)}
      aria-label={next === "dark" ? "Switch to dark theme" : "Switch to light theme"}
      title={next === "dark" ? "Dark theme" : "Light theme"}
      className={cn(
        "flex size-11 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-paper-deep hover:text-ink",
        className,
      )}
    >
      {/* Both icons render; CSS shows the right one so the server HTML matches either theme. */}
      <Moon className="size-5 dark:hidden" aria-hidden />
      <Sun className="hidden size-5 dark:block" aria-hidden />
    </button>
  );
}

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

/** Full control, including going back to following the device. */
export function ThemeSwitcher({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  const id = useId();
  return (
    <fieldset className={className}>
      <legend id={id} className="mb-2 text-sm font-bold uppercase tracking-wider text-ink">
        Appearance
      </legend>
      <div className="inline-flex rounded-pill border border-line-strong bg-card p-1">
        {OPTIONS.map((o) => (
          <label
            key={o.value}
            className={cn(
              "flex min-h-10 items-center gap-1.5 rounded-pill px-3.5 text-sm font-semibold transition-colors",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
              preference === o.value
                ? "bg-jaggery text-on-jaggery"
                : "text-ink-soft hover:text-ink",
            )}
          >
            <input
              type="radio"
              name={`${id}-theme`}
              value={o.value}
              checked={preference === o.value}
              onChange={() => setPreference(o.value)}
              className="sr-only"
            />
            <o.icon className="size-4" aria-hidden />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
