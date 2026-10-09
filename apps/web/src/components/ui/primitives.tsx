import { AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "saffron" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-jaggery text-on-jaggery hover:bg-jaggery-deep shadow-sm",
  secondary: "bg-card text-ink border border-line-strong hover:border-jaggery hover:text-jaggery",
  ghost: "text-ink-soft hover:bg-paper-deep hover:text-ink",
  saffron: "bg-saffron text-on-saffron hover:brightness-95",
  danger: "bg-card text-danger border border-danger/40 hover:bg-danger-soft",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm gap-1.5",
  md: "h-11 px-4 text-[15px] gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

const base =
  "inline-flex items-center justify-center rounded-md font-semibold transition-colors duration-150 ease-out " +
  "disabled:opacity-50 disabled:cursor-not-allowed select-none whitespace-nowrap";

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      type="button"
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}

type Tone =
  | "neutral"
  | "chilled"
  | "ambient"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "saffron";
const tones: Record<Tone, string> = {
  neutral: "bg-paper-deep text-ink-soft",
  chilled: "bg-chilled-soft text-chilled",
  ambient: "bg-ambient-soft text-ambient",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  saffron: "bg-saffron-soft text-ink",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-xs font-semibold leading-none",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-lg border border-line bg-card", className)} {...props} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-paper-deep", className)} aria-hidden />;
}

/** ids a control should list in `aria-describedby` for its Field's hint and error. */
export function describedBy(id: string, opts: { hint?: string | null; error?: string | null }) {
  return (
    [opts.hint ? `${id}-hint` : null, opts.error ? `${id}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined
  );
}

/**
 * A labelled control with optional hint and error. The hint stays visible when there is an
 * error, and both are linked to the control with `describedBy(id, …)`.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  optional = false,
  announce = true,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: string | null;
  error?: string | null;
  optional?: boolean;
  /** Announce the error as it appears; turn off when an ErrorSummary already does. */
  announce?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-semibold text-ink">
        {label}
        {optional && <span className="ml-1 font-normal text-ink-muted">(optional)</span>}
      </label>
      {children}
      {hint && (
        <p id={`${htmlFor}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={`${htmlFor}-error`}
          role={announce ? "alert" : undefined}
          className="flex items-start gap-1.5 text-sm font-medium text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClasses =
  "h-11 w-full rounded-md border border-line-strong bg-card px-3 text-[15px] text-ink placeholder:text-ink-muted " +
  "transition-colors focus:border-jaggery focus:outline-none focus-visible:outline-2 focus-visible:outline-focus " +
  "aria-[invalid=true]:border-danger";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputClasses, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(inputClasses, "h-auto min-h-24 py-2.5", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(inputClasses, "pr-8", className)} {...props} />;
}

export function SectionHeading({
  eyebrow,
  title,
  action,
  id,
  className,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
  /** For `aria-labelledby` on the enclosing section. */
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex items-end justify-between gap-4", className)}>
      <div>
        {eyebrow && (
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-jaggery">
            {eyebrow}
          </p>
        )}
        <h2 id={id} className="text-2xl font-bold text-ink md:text-3xl">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line-strong bg-card/60 px-6 py-12 text-center">
      {icon && <div className="text-jaggery">{icon}</div>}
      <h3 className="text-xl font-bold">{title}</h3>
      {body && <p className="max-w-md text-ink-soft">{body}</p>}
      {action}
    </div>
  );
}
