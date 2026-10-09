import type { Metadata } from "next";
import { HowItWorks } from "@/components/how-it-works";

export const metadata: Metadata = {
  title: "How fresh delivery works",
  description:
    "How Food-Del gets perishable delicacies across India fresh: made to order, timed cutoffs, cold-chain packaging and conservative delivery promises.",
};

const FAQ = [
  [
    "Why can't I get some sweets delivered to my city?",
    "Some sweets, like kacha golla, last only two days. If even the fastest flight can't get them to you with enough shelf life left, we don't offer them rather than risk sending them stale.",
  ],
  [
    "Why are some dates greyed out?",
    "Kitchens close on some days, couriers don't deliver on Sundays and national holidays, and each day has a fixed number of portions. Tap a greyed date to see the reason.",
  ],
  [
    "What is the order cutoff?",
    "Most kitchens close orders at 6 pm the day before dispatch so they can make your batch fresh. After the cutoff your order is in production and can't be cancelled.",
  ],
  [
    "How do you keep milk sweets cold?",
    "Chilled delicacies travel by air in insulated boxes with gel packs. We pick a box rated for the full journey plus a safety buffer, based on trials in peak summer heat.",
  ],
  [
    "What if it arrives spoiled?",
    "Tell us within 24 hours of delivery with a photo. If something went wrong in making or shipping, we refund you in full.",
  ],
  [
    "Can I pay cash on delivery?",
    "No. Perishable parcels can't be returned if a delivery is refused, so we only accept prepaid orders (UPI, cards and netbanking).",
  ],
];

export default function HowItWorksPage() {
  return (
    <div className="container-page py-12">
      <h1 className="mb-3 text-4xl font-extrabold md:text-5xl">How fresh delivery works</h1>
      <p className="mb-10 max-w-2xl text-lg text-ink-soft">
        Getting a three-day sweet across India is a race against the clock. Here's how we make sure
        it arrives as good as it left the kitchen.
      </p>
      <HowItWorks />
      <section className="mt-14 max-w-3xl" aria-labelledby="faq">
        <h2 id="faq" className="mb-4 text-3xl font-bold">
          Questions
        </h2>
        <div className="divide-y divide-line rounded-lg border border-line bg-card">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group p-5">
              <summary className="flex list-none items-center justify-between gap-4 font-semibold">
                {q}
                <span
                  className="text-jaggery transition-transform group-open:rotate-45"
                  aria-hidden
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-ink-soft">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
