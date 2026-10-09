import { CalendarCheck, ChefHat, PackageCheck, Snowflake } from "lucide-react";

const STEPS = [
  {
    icon: CalendarCheck,
    title: "Pick the day it arrives",
    body: "We only offer dates when your delicacy can reach you with plenty of shelf life left.",
  },
  {
    icon: ChefHat,
    title: "Made fresh for your order",
    body: "The kitchen closes orders the evening before and prepares your batch on dispatch day.",
  },
  {
    icon: Snowflake,
    title: "Packed for the journey",
    body: "Milk sweets travel by air in insulated boxes with gel packs, sized to the flight time.",
  },
  {
    icon: PackageCheck,
    title: "Tracked to your door",
    body: "Live updates on WhatsApp. If it arrives anything less than fresh, we make it right.",
  },
];

export function HowItWorks() {
  return (
    <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {STEPS.map((s, i) => (
        <li key={s.title} className="rounded-lg border border-line bg-card p-5">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-pill bg-saffron-soft text-jaggery">
              <s.icon className="size-5" aria-hidden />
            </span>
            <span className="tabular text-sm font-bold text-ink-muted">Step {i + 1}</span>
          </div>
          <h3 className="mb-1 font-sans text-base font-bold">{s.title}</h3>
          <p className="text-sm text-ink-soft">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}
