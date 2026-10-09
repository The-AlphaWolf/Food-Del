import { formatLongDate, PRIVACY_NOTICE_VERSION, RETENTION } from "@food-del/domain";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy notice",
  description:
    "What personal data Food-Del collects, why, who we share it with, how long we keep it, and how to exercise your rights under India's DPDP Act.",
};

const COLLECTED: [string, string, string][] = [
  [
    "Mobile number",
    "To sign you in with a one-time code and to send order updates.",
    "Until you delete your account.",
  ],
  [
    "Name and email (optional)",
    "To address you and send receipts.",
    "Until you delete your account.",
  ],
  [
    "Delivery addresses and recipient phone numbers, including for gifts",
    "To deliver parcels and let couriers reach the recipient.",
    "Saved addresses until you delete them. On orders, until you delete your account.",
  ],
  ["Gift messages and sender name", "To print on the gift card.", "Until you delete your account."],
  [
    "Orders and payments (amounts, dates, items, payment status)",
    "To fulfil orders, handle refunds and meet GST record-keeping law.",
    `${RETENTION.taxRecordYears} years. If you delete your account, these are kept without your name or contact details.`,
  ],
  [
    "Claims and photos you send",
    "To decide refunds for damaged or late parcels.",
    "Until you delete your account.",
  ],
  [
    "Messages we send you (SMS, WhatsApp, email)",
    "To answer questions about what we told you and when.",
    `Message text for ${RETENTION.notificationBodyDays} days, then only the fact that a message was sent.`,
  ],
];

const PROCESSORS: [string, string][] = [
  ["Supabase (Mumbai region)", "Sign-in and our database"],
  ["Vercel (Mumbai region)", "Hosting the website"],
  ["Razorpay", "Payments and refunds. Card and UPI details go to Razorpay; we never see them."],
  [
    "Shiprocket and its courier partners",
    "Picking up and delivering parcels. They receive the recipient's name, phone and address.",
  ],
  ["MSG91, WhatsApp (Meta) and Resend", "Sending SMS, WhatsApp and email updates"],
  ["Sentry", "Reporting errors in our software, with contact details removed"],
];

export default function PrivacyPage() {
  const officer = process.env.GRIEVANCE_OFFICER_NAME;
  const email = process.env.GRIEVANCE_EMAIL ?? process.env.OPS_EMAIL ?? "privacy@food-del.in";
  return (
    <div className="container-page max-w-3xl py-12">
      <h1 className="mb-3 text-4xl font-extrabold md:text-5xl">Privacy notice</h1>
      <p className="mb-10 text-ink-soft">
        Version {PRIVACY_NOTICE_VERSION}, effective {formatLongDate(PRIVACY_NOTICE_VERSION)}. This
        notice explains how Food-Del handles your personal data under India's Digital Personal Data
        Protection Act, 2023. We ask you to read it when you sign in, and again whenever it changes.
      </p>

      <section aria-labelledby="what" className="mb-10">
        <h2 id="what" className="mb-4 text-2xl font-bold">
          What we collect, why, and for how long
        </h2>
        <div className="overflow-hidden rounded-lg border border-line bg-card">
          <dl className="divide-y divide-line">
            {COLLECTED.map(([what, why, howLong]) => (
              <div key={what} className="grid gap-1 p-4 sm:grid-cols-3 sm:gap-4">
                <dt className="font-semibold">{what}</dt>
                <dd className="text-sm text-ink-soft">{why}</dd>
                <dd className="text-sm text-ink-muted">{howLong}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="mt-3 text-sm text-ink-muted">
          We don't sell your data, show you third-party ads, or send marketing messages. We use your
          data only to sell and deliver food you order.
        </p>
      </section>

      <section aria-labelledby="who" className="mb-10">
        <h2 id="who" className="mb-4 text-2xl font-bold">
          Who else sees it
        </h2>
        <p className="mb-3 text-ink-soft">
          The kitchen that makes your order sees the recipient's name, phone and address on the
          parcel label. These service providers process data on our behalf, under contract:
        </p>
        <ul className="space-y-2">
          {PROCESSORS.map(([name, role]) => (
            <li key={name} className="text-sm">
              <strong>{name}</strong> <span className="text-ink-soft">· {role}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="rights" className="mb-10">
        <h2 id="rights" className="mb-4 text-2xl font-bold">
          Your rights
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-ink-soft">
          <li>
            <strong className="text-ink">See your data.</strong> Download everything we hold about
            you from <Link href="/account">Your account</Link> → Your data.
          </li>
          <li>
            <strong className="text-ink">Correct it.</strong> Edit your name, email and saved
            addresses in your account at any time.
          </li>
          <li>
            <strong className="text-ink">Erase it.</strong> Delete your account from the same page.
            We erase your name, phone, email, addresses, gift messages and claim descriptions
            straight away. Order amounts stay for tax law, without anything that identifies you.
          </li>
          <li>
            <strong className="text-ink">Withdraw.</strong> Deleting your account withdraws your
            consent. It doesn't affect orders already delivered.
          </li>
          <li>
            <strong className="text-ink">Nominate someone.</strong> You can name a person to
            exercise these rights if you die or become unable to. Write to the Grievance Officer.
          </li>
          <li>
            <strong className="text-ink">Complain.</strong> Write to our Grievance Officer first. If
            you're not satisfied with the reply, you can complain to the Data Protection Board of
            India.
          </li>
        </ul>
        <p className="mt-3 text-sm text-ink-muted">
          Food-Del is for adults. Please don't create an account if you're under 18.
        </p>
      </section>

      <section aria-labelledby="contact" className="rounded-lg border border-line bg-card p-5">
        <h2 id="contact" className="mb-2 text-2xl font-bold">
          Grievance Officer
        </h2>
        <p className="text-ink-soft">
          {officer ? <strong className="text-ink">{officer}</strong> : null}
          {officer ? <br /> : null}
          Email{" "}
          <a href={`mailto:${email}`} className="font-semibold text-jaggery underline">
            {email}
          </a>
          . We acknowledge within 7 days and aim to resolve within 30 days.
        </p>
      </section>
    </div>
  );
}
