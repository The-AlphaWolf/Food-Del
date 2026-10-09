"use client";

import {
  addDays,
  istDateOf,
  PAYOUT_STATE_LABELS,
  PAYOUT_STATES,
  type PayoutState,
} from "@food-del/domain";
import type { PayoutListQuery, PayoutRow, PayoutSummary } from "@food-del/domain/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Download,
  Hourglass,
  type LucideIcon,
  PauseCircle,
  RotateCcw,
  Undo2,
  Wallet,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useId, useState } from "react";
import { OpsShell } from "@/components/ops-shell";
import { useToast } from "@/components/toast";
import { Dialog } from "@/components/ui/dialog";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  Skeleton,
  Textarea,
} from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDateTime, formatINR, formatINRCompact, formatLocalDate } from "@/lib/format";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

/** Status colour always comes with an icon and a label (never colour alone). */
const STATE_LOOK: Record<PayoutState, { tone: Tone; icon: LucideIcon }> = {
  HELD_FOR_REVIEW: { tone: "warning", icon: PauseCircle },
  WAITING_ON_CLAIM: { tone: "info", icon: Hourglass },
  NEEDS_PAYOUT_ACCOUNT: { tone: "warning", icon: AlertTriangle },
  TRANSFER_FAILED: { tone: "danger", icon: XCircle },
  IN_CLAIM_WINDOW: { tone: "neutral", icon: Clock },
  TRANSFER_PENDING: { tone: "info", icon: Clock },
  RELEASING: { tone: "info", icon: Clock },
  RELEASED: { tone: "success", icon: CheckCircle2 },
  REVERSAL_PENDING: { tone: "danger", icon: Undo2 },
  CLAWED_BACK: { tone: "neutral", icon: Ban },
};

const PERIODS = [7, 30, 90] as const;

function StateBadge({ state }: { state: PayoutState }) {
  const look = STATE_LOOK[state];
  return (
    <Badge tone={look.tone}>
      <look.icon className="size-3.5" aria-hidden />
      {PAYOUT_STATE_LABELS[state]}
    </Badge>
  );
}

/** One line on what happens next, so nobody has to decode the state. */
function nextStep(p: PayoutRow) {
  switch (p.state) {
    case "IN_CLAIM_WINDOW":
      return `Pays after ${formatDateTime(p.releaseAfter)}, if no claim comes in.`;
    case "WAITING_ON_CLAIM":
      return (
        <>
          A claim is open; it's paid or clawed back once the claim is resolved.{" "}
          <Link href="/ops/claims" className="font-semibold text-jaggery hover:underline">
            Claims
          </Link>
        </>
      );
    case "HELD_FOR_REVIEW":
      return `Held ${p.heldAt ? formatDateTime(p.heldAt) : ""}: “${p.heldReason}”`;
    case "NEEDS_PAYOUT_ACCOUNT":
      return (
        <>
          Can't be paid until the kitchen links a Razorpay Route account.{" "}
          <Link
            href={`/ops/kitchens/${p.kitchen.id}/edit`}
            className="font-semibold text-jaggery hover:underline"
          >
            Link account
          </Link>
        </>
      );
    case "TRANSFER_FAILED":
      return `Transfer failed: ${p.transferError ?? "unknown error"}. Fix the cause, then retry.`;
    case "TRANSFER_PENDING":
      return "Transfer queued with Razorpay; pays on the next run after it goes through.";
    case "RELEASING":
      return "Transferred and due; pays on the next run.";
    case "RELEASED":
      return `Paid ${p.releasedAt ? formatDateTime(p.releasedAt) : ""} · ${p.transferId ?? ""}`;
    case "REVERSAL_PENDING":
      return p.transferError
        ? `Clawback failed: ${p.transferError}. Retry once fixed.`
        : "Claim approved; taking the transfer back from the kitchen's account.";
    case "CLAWED_BACK":
      return `Clawed back ${p.reversedAt ? formatDateTime(p.reversedAt) : ""} after an approved claim.`;
  }
}

function StatTile({
  label,
  value,
  sub,
  hero = false,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  sub: string;
  hero?: boolean;
  icon?: LucideIcon;
  tone?: "warning";
}) {
  return (
    <Card
      className={cn(
        "flex flex-col gap-1 p-4",
        hero && "sm:col-span-2 lg:col-span-1 lg:row-span-2 lg:justify-center lg:p-6",
      )}
    >
      <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-soft">
        {Icon && (
          <Icon
            className={cn("size-4", tone === "warning" ? "text-warning" : "text-ink-muted")}
            aria-hidden
          />
        )}
        {label}
      </p>
      {/* Proportional figures read better at display sizes; the exact amount is one hover/tap away. */}
      <p
        className={cn("font-sans font-semibold text-ink", hero ? "text-5xl" : "text-3xl")}
        title={formatINR(value)}
      >
        {formatINRCompact(value)}
        <span className="sr-only"> ({formatINR(value)})</span>
      </p>
      <p className="text-sm text-ink-muted">{sub}</p>
    </Card>
  );
}

function Tiles({ s, days }: { s: PayoutSummary; days: number }) {
  const span = `last ${days} days`;
  return (
    <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr] lg:grid-rows-2">
      <StatTile
        hero
        label="Owed to kitchens"
        value={s.owed.netPaise}
        sub={`${s.owed.count} ${s.owed.count === 1 ? "payout" : "payouts"} not yet paid`}
        icon={Wallet}
      />
      <StatTile
        label="Stuck until someone acts"
        value={s.needsAction.netPaise}
        sub={s.needsAction.count === 0 ? "Nothing stuck" : `${s.needsAction.count} need action`}
        icon={AlertTriangle}
        tone={s.needsAction.count > 0 ? "warning" : undefined}
      />
      <StatTile
        label={`Paid · ${span}`}
        value={s.paid.netPaise}
        sub={`${s.paid.count} transfers released`}
        icon={CheckCircle2}
      />
      <StatTile
        label={`Clawed back · ${span}`}
        value={s.clawedBack.netPaise}
        sub={`${s.clawedBack.count} after approved claims`}
        icon={Undo2}
      />
      <StatTile
        label={`Commission · ${span}`}
        value={s.commissionPaise}
        sub="On parcels delivered, net of clawbacks"
        icon={Wallet}
      />
    </div>
  );
}

function ByKitchen({ s, onPick }: { s: PayoutSummary; onPick: (kitchenId: string) => void }) {
  if (s.kitchens.length === 0) return null;
  return (
    <Card className="mb-8">
      <h2 className="border-b border-line px-4 py-3 font-sans text-lg font-bold md:px-6">
        By kitchen
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-muted">
              <th scope="col" className="sticky left-0 z-10 bg-card px-4 py-3 md:px-6">
                Kitchen
              </th>
              <th scope="col" className="px-3 py-3 text-right">
                Owed
              </th>
              <th scope="col" className="px-3 py-3 text-right">
                Need action
              </th>
              <th scope="col" className="px-3 py-3 text-right">
                Paid
              </th>
              <th scope="col" className="px-3 py-3 text-right">
                Clawed back
              </th>
              <th scope="col" className="px-3 py-3 text-right">
                Commission
              </th>
              <th scope="col" className="px-4 py-3">
                Payout account
              </th>
            </tr>
          </thead>
          <tbody className="tabular">
            {s.kitchens.map((k) => (
              <tr key={k.id} className="border-b border-line last:border-0">
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-card px-4 py-3 text-left font-semibold md:px-6"
                >
                  <button
                    type="button"
                    onClick={() => onPick(k.id)}
                    className="text-left hover:text-jaggery hover:underline"
                  >
                    {k.name}
                  </button>
                  <span className="block text-xs font-normal text-ink-muted">{k.city}</span>
                </th>
                <td className="px-3 py-3 text-right font-semibold">{formatINR(k.owedPaise)}</td>
                <td
                  className={cn(
                    "px-3 py-3 text-right",
                    k.needsAction > 0 && "font-bold text-warning",
                  )}
                >
                  {k.needsAction}
                </td>
                <td className="px-3 py-3 text-right">{formatINR(k.paidPaise)}</td>
                <td className="px-3 py-3 text-right">{formatINR(k.clawedBackPaise)}</td>
                <td className="px-3 py-3 text-right">{formatINR(k.commissionPaise)}</td>
                <td className="px-4 py-3">
                  {k.accountLinked ? (
                    <span className="inline-flex items-center gap-1 text-success">
                      <CheckCircle2 className="size-4" aria-hidden /> Linked
                    </span>
                  ) : (
                    <Link
                      href={`/ops/kitchens/${k.id}/edit`}
                      className="inline-flex items-center gap-1 font-semibold text-warning hover:underline"
                    >
                      <AlertTriangle className="size-4" aria-hidden /> Link account
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PayoutItem({ p, onHold }: { p: PayoutRow; onHold: (p: PayoutRow) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const done = () =>
    void qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("ops-payout") });
  const resume = useMutation({
    mutationFn: () => api.resumePayout(p.id),
    onSuccess: () => {
      toast("success", `${p.orderNumber}: hold lifted.`);
      done();
    },
    onError: (e) => toast("error", (e as Error).message),
  });
  const retry = useMutation({
    mutationFn: () => api.retryPayout(p.id),
    onSuccess: (r) => {
      toast(
        r.transferError ? "error" : "success",
        r.transferError
          ? `Still failing: ${r.transferError}`
          : `${p.orderNumber}: sent to Razorpay.`,
      );
      done();
    },
    onError: (e) => toast("error", (e as Error).message),
  });
  const canRetry = ["TRANSFER_FAILED", "TRANSFER_PENDING", "REVERSAL_PENDING"].includes(p.state);
  return (
    <li className="grid gap-3 py-4 md:grid-cols-[minmax(12rem,1.2fr)_minmax(14rem,1.6fr)_auto] md:items-center">
      <div>
        <p className="tabular font-semibold">{p.orderNumber}</p>
        <p className="text-sm text-ink-soft">
          {p.kitchen.name} · {p.kitchen.city}
        </p>
        <p className="text-xs text-ink-muted">
          {p.deliveredAt
            ? `Delivered ${formatLocalDate(istDateOf(new Date(p.deliveredAt)))}`
            : `Created ${formatDateTime(p.createdAt)}`}
        </p>
      </div>
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StateBadge state={p.state} />
          <p className="tabular text-sm">
            <span className="font-bold">{formatINR(p.netPaise)}</span>
            <span className="text-ink-muted">
              {" "}
              = {formatINR(p.grossPaise)} − {formatINR(p.commissionPaise)} commission
            </span>
          </p>
        </div>
        <p className="text-sm text-ink-soft">{nextStep(p)}</p>
      </div>
      <div className="flex flex-wrap gap-2 md:justify-end">
        {p.state === "HELD_FOR_REVIEW" ? (
          <Button
            size="sm"
            variant="secondary"
            loading={resume.isPending}
            onClick={() => resume.mutate()}
          >
            Resume
          </Button>
        ) : (
          p.status === "ON_HOLD" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onHold(p)}
              aria-label={`Hold ${p.orderNumber} for review`}
            >
              <PauseCircle className="size-4" aria-hidden /> Hold
            </Button>
          )
        )}
        {canRetry && (
          <Button
            size="sm"
            variant="secondary"
            loading={retry.isPending}
            onClick={() => retry.mutate()}
          >
            <RotateCcw className="size-4" aria-hidden /> Retry
          </Button>
        )}
      </div>
    </li>
  );
}

function HoldForm({ p, onDone }: { p: PayoutRow; onDone: () => void }) {
  const id = useId();
  const qc = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const hold = useMutation({
    mutationFn: () => api.holdPayout(p.id, { reason: reason.trim() }),
    onSuccess: () => {
      void qc.invalidateQueries({
        predicate: (q) => String(q.queryKey[0]).startsWith("ops-payout"),
      });
      toast("success", `${p.orderNumber} is held. It won't be paid until you resume it.`);
      onDone();
    },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (reason.trim().length < 3)
          return setError("Say why, so whoever picks it up knows what to check.");
        hold.mutate();
      }}
    >
      <p className="rounded-md bg-paper-deep p-3 text-sm">
        <span className="font-semibold">{p.orderNumber}</span> · {p.kitchen.name} ·{" "}
        {formatINR(p.netPaise)}
      </p>
      <Field
        label="Reason"
        htmlFor={`${id}-reason`}
        hint="Shown to ops on this payout until it's resumed."
        error={error}
      >
        <Textarea
          id={`${id}-reason`}
          rows={3}
          value={reason}
          maxLength={200}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={`${id}-reason-hint${error ? ` ${id}-reason-error` : ""}`}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <div className="flex justify-end border-t border-line pt-4">
        <Button type="submit" loading={hold.isPending}>
          Hold payout
        </Button>
      </div>
    </form>
  );
}

function StatementForm({
  from: defaultFrom,
  to: defaultTo,
  kitchens,
  kitchenId,
  onDone,
}: {
  from: string;
  to: string;
  kitchens: PayoutSummary["kitchens"];
  kitchenId: string;
  onDone: () => void;
}) {
  const id = useId();
  const toast = useToast();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [vendorId, setVendorId] = useState(kitchenId);
  const download = useMutation({
    mutationFn: () => api.payoutStatement({ from, to, vendorId: vendorId || undefined }),
    onSuccess: (csv) => {
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `payouts-${from}-to-${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast("success", `Statement downloaded: ${csv.trim().split("\n").length - 1} payouts.`);
      onDone();
    },
    onError: (e) => toast("error", (e as Error).message),
  });
  const invalid = !from || !to || from > to;
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!invalid) download.mutate();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="From" htmlFor={`${id}-from`}>
          <Input
            id={`${id}-from`}
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field
          label="To"
          htmlFor={`${id}-to`}
          error={from > to ? "The end date is before the start date." : null}
        >
          <Input id={`${id}-to`} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <Field label="Kitchen" htmlFor={`${id}-kitchen`}>
        <Select id={`${id}-kitchen`} value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
          <option value="">All kitchens</option>
          {kitchens.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </Select>
      </Field>
      <p className="text-sm text-ink-muted">
        One line per payout created in the period, amounts in rupees, with Razorpay transfer and
        reversal ids for reconciliation.
      </p>
      <div className="flex justify-end border-t border-line pt-4">
        <Button type="submit" disabled={invalid} loading={download.isPending}>
          <Download className="size-4" aria-hidden /> Download CSV
        </Button>
      </div>
    </form>
  );
}

function Payouts() {
  const params = useSearchParams();
  const [days, setDays] = useState<number>(30);
  const [state, setState] = useState<PayoutListQuery["state"] | "">(
    (params.get("state") as PayoutListQuery["state"]) ?? "",
  );
  const [kitchenId, setKitchenId] = useState(params.get("kitchen") ?? "");
  const [q, setQ] = useState("");
  const [holding, setHolding] = useState<PayoutRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const summary = useQuery({
    queryKey: ["ops-payout-summary", days],
    queryFn: () => api.payoutSummary(days),
  });
  const query: PayoutListQuery = {
    state: state || undefined,
    vendorId: kitchenId || undefined,
    q: q.trim() || undefined,
  };
  const list = useQuery({
    queryKey: ["ops-payouts", query],
    queryFn: () => api.payouts(query),
    placeholderData: (prev) => prev,
  });
  const s = summary.data;
  const today = s?.period.to ?? "";

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Payouts</h1>
          <p className="max-w-2xl text-ink-soft">
            Each kitchen is paid its share (items total minus commission) once the claim window
            after delivery closes. Money only moves through Razorpay Route transfers.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Period"
            className="inline-flex rounded-md border border-line-strong bg-card p-0.5"
          >
            {PERIODS.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={days === d}
                onClick={() => setDays(d)}
                className={cn(
                  "min-h-10 rounded px-3 text-sm font-semibold transition-colors",
                  days === d ? "bg-jaggery text-on-jaggery" : "text-ink-soft hover:text-ink",
                )}
              >
                {d} days
              </button>
            ))}
          </div>
          <Button variant="secondary" onClick={() => setExporting(true)} disabled={!s}>
            <Download className="size-4" aria-hidden /> Statement
          </Button>
        </div>
      </div>

      {!s ? <Skeleton className="mb-8 h-56" /> : <Tiles s={s} days={days} />}
      {s && (
        <ByKitchen
          s={s}
          onPick={(id) => {
            setKitchenId(id);
            const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            document
              .getElementById("all-payouts")
              ?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
          }}
        />
      )}

      <Card className="p-4 md:p-6">
        <h2 id="all-payouts" className="mb-4 font-sans text-lg font-bold">
          All payouts
        </h2>
        <div className="mb-2 grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="payout-state" className="mb-1.5 block text-sm font-semibold">
              Status
            </label>
            <Select
              id="payout-state"
              value={state}
              onChange={(e) => setState(e.target.value as typeof state)}
            >
              <option value="">All</option>
              <option value="NEEDS_ACTION">Needs action</option>
              {PAYOUT_STATES.map((st) => (
                <option key={st} value={st}>
                  {PAYOUT_STATE_LABELS[st]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="payout-kitchen" className="mb-1.5 block text-sm font-semibold">
              Kitchen
            </label>
            <Select
              id="payout-kitchen"
              value={kitchenId}
              onChange={(e) => setKitchenId(e.target.value)}
            >
              <option value="">All kitchens</option>
              {(s?.kitchens ?? []).map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="payout-q" className="mb-1.5 block text-sm font-semibold">
              Search
            </label>
            <Input
              id="payout-q"
              type="search"
              placeholder="Order number or kitchen"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        <p className="text-sm text-ink-muted" aria-live="polite">
          {list.data
            ? `${list.data.length} ${list.data.length === 1 ? "payout" : "payouts"}`
            : "Loading…"}
        </p>
        {!list.data ? (
          <Skeleton className="mt-4 h-40" />
        ) : list.data.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<Wallet className="size-8" />}
              title={state === "NEEDS_ACTION" ? "Nothing needs action" : "No payouts here"}
              body={
                state || kitchenId || q
                  ? "Try another status, kitchen or search."
                  : "Payouts appear here as parcels are delivered."
              }
            />
          </div>
        ) : (
          <ul className={cn("divide-y divide-line", list.isFetching && "opacity-70")}>
            {list.data.map((p) => (
              <PayoutItem key={p.id} p={p} onHold={setHolding} />
            ))}
          </ul>
        )}
      </Card>

      <Dialog
        open={holding !== null}
        onClose={() => setHolding(null)}
        title="Hold for review"
        description="The release job skips it until you resume it. Nothing is clawed back."
      >
        {holding && <HoldForm p={holding} onDone={() => setHolding(null)} />}
      </Dialog>
      <Dialog
        open={exporting}
        onClose={() => setExporting(false)}
        title="Download statement"
        description="For reconciling with Razorpay settlements."
      >
        {s && (
          <StatementForm
            from={addDays(today, -(days - 1))}
            to={today}
            kitchens={s.kitchens}
            kitchenId={kitchenId}
            onDone={() => setExporting(false)}
          />
        )}
      </Dialog>
    </>
  );
}

export default function PayoutsPage() {
  return (
    <OpsShell>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Payouts />
      </Suspense>
    </OpsShell>
  );
}
