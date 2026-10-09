"use client";

import { describeWeekdays } from "@food-del/domain";
import {
  CreateKitchenRequestSchema,
  type KitchenDetail,
  UpdateKitchenRequestSchema,
} from "@food-del/domain/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import {
  type FieldErrors,
  fieldId,
  issuesFor,
  optional,
  serverErrors,
  summaryOf,
} from "@/lib/forms";
import { useToast } from "../toast";
import { ErrorSummary } from "../ui/error-summary";
import { Button, describedBy, Field, Input, Select, Textarea } from "../ui/primitives";
import { FormSection, Stepper, useOnboardingOptions, WeekdayPicker } from "./common";

const FORM = "kitchen";

interface Draft {
  name: string;
  cityId: string;
  tagline: string;
  establishedYear: string;
  story: string;
  pickupPincode: string;
  line1: string;
  line2: string;
  landmark: string;
  contactName: string;
  contactPhone: string;
  fssaiLicenseNo: string;
  fssaiValidUntil: string;
  gstin: string;
  dispatchWeekdays: number;
  orderCutoffLocal: string;
  prepLeadDays: string;
  prepStartLocal: string;
  readyForPickupLocal: string;
  dailyShipmentCap: string;
  commissionPct: string;
  payoutAccountRef: string;
  ownerName: string;
  ownerPhone: string;
}

const BLANK: Draft = {
  name: "",
  cityId: "",
  tagline: "",
  establishedYear: "",
  story: "",
  pickupPincode: "",
  line1: "",
  line2: "",
  landmark: "",
  contactName: "",
  contactPhone: "",
  fssaiLicenseNo: "",
  fssaiValidUntil: "",
  gstin: "",
  dispatchWeekdays: 63,
  orderCutoffLocal: "18:00",
  prepLeadDays: "1",
  prepStartLocal: "06:00",
  readyForPickupLocal: "12:00",
  dailyShipmentCap: "40",
  commissionPct: "20",
  payoutAccountRef: "",
  ownerName: "",
  ownerPhone: "",
};

function fromKitchen(k: KitchenDetail): Draft {
  return {
    ...BLANK,
    name: k.name,
    cityId: k.city.id,
    tagline: k.tagline ?? "",
    establishedYear: k.establishedYear ? String(k.establishedYear) : "",
    story: k.story ?? "",
    pickupPincode: k.pickupPincode,
    line1: k.pickupAddress.line1,
    line2: k.pickupAddress.line2 ?? "",
    landmark: k.pickupAddress.landmark ?? "",
    contactName: k.pickupAddress.contactName,
    contactPhone: k.pickupAddress.contactPhone.replace(/^\+91/, ""),
    fssaiLicenseNo: k.fssaiLicenseNo,
    fssaiValidUntil: k.fssaiValidUntil,
    gstin: k.gstin ?? "",
    dispatchWeekdays: k.dispatchWeekdays,
    orderCutoffLocal: k.orderCutoffLocal,
    prepLeadDays: String(k.prepLeadDays),
    prepStartLocal: k.prepStartLocal,
    readyForPickupLocal: k.readyForPickupLocal,
    dailyShipmentCap: String(k.dailyShipmentCap),
    commissionPct: String(k.commissionBps / 100),
    payoutAccountRef: k.payoutAccountRef ?? "",
  };
}

/** Blank required numbers become NaN so validation says "enter a number", not "0 is too small". */
const num = (v: string) => (v.trim() === "" ? Number.NaN : Number(v));

function toFields(d: Draft) {
  return {
    name: d.name.trim(),
    tagline: optional(d.tagline) ?? null,
    story: optional(d.story) ?? null,
    establishedYear: d.establishedYear.trim() ? num(d.establishedYear) : null,
    pickupPincode: d.pickupPincode.trim(),
    pickupAddress: {
      line1: d.line1.trim(),
      line2: optional(d.line2),
      landmark: optional(d.landmark),
      contactName: d.contactName.trim(),
      contactPhone: d.contactPhone.trim(),
    },
    fssaiLicenseNo: d.fssaiLicenseNo.trim(),
    fssaiValidUntil: d.fssaiValidUntil,
    gstin: optional(d.gstin.toUpperCase()) ?? null,
    orderCutoffLocal: d.orderCutoffLocal,
    prepLeadDays: num(d.prepLeadDays),
    prepStartLocal: d.prepStartLocal,
    readyForPickupLocal: d.readyForPickupLocal,
    dispatchWeekdays: d.dispatchWeekdays,
    dailyShipmentCap: num(d.dailyShipmentCap),
    commissionBps: Math.round(num(d.commissionPct) * 100),
    payoutAccountRef: optional(d.payoutAccountRef) ?? null,
  };
}

const MESSAGES: Record<string, string> = {
  name: "Enter the kitchen's name.",
  cityId: "Choose the city the kitchen cooks in.",
  establishedYear: "Enter a year, like 1921.",
  pickupPincode: "Enter the 6-digit pickup pincode.",
  "pickupAddress.line1": "Enter the pickup address.",
  "pickupAddress.contactName": "Who hands parcels to the courier?",
  "pickupAddress.contactPhone": "Enter a 10-digit mobile number.",
  fssaiLicenseNo: "FSSAI numbers are 14 digits.",
  fssaiValidUntil: "Enter the date the licence expires.",
  gstin: "Enter a valid 15-character GSTIN, or leave it blank.",
  dispatchWeekdays: "Pick at least one dispatch day.",
  orderCutoffLocal: "Enter a time, like 18:00.",
  prepLeadDays: "Between 0 and 3 days.",
  prepStartLocal: "Enter a time, like 06:00.",
  readyForPickupLocal: "Enter a time, like 12:00.",
  dailyShipmentCap: "How many parcels a day at most (1 or more).",
  commissionBps: "Commission is a percentage from 0 to 100.",
  "owner.name": "Enter the owner's name.",
  "owner.phone": "Enter the owner's 10-digit mobile number.",
};

const STEPS = [
  {
    title: "The kitchen",
    fields: ["name", "cityId", "tagline", "establishedYear", "story"],
  },
  {
    title: "Pickup & licence",
    fields: ["pickupPincode", "pickupAddress", "fssaiLicenseNo", "fssaiValidUntil", "gstin"],
  },
  {
    title: "Dispatch & terms",
    fields: [
      "dispatchWeekdays",
      "orderCutoffLocal",
      "prepLeadDays",
      "prepStartLocal",
      "readyForPickupLocal",
      "dailyShipmentCap",
      "commissionBps",
      "payoutAccountRef",
    ],
  },
  { title: "Owner & review", fields: ["owner"] },
] as const;
const ALL_FIELDS = STEPS.flatMap((s) => [...s.fields]);
const ORDER = [
  "name",
  "cityId",
  "tagline",
  "establishedYear",
  "story",
  "pickupPincode",
  "pickupAddress.line1",
  "pickupAddress.line2",
  "pickupAddress.landmark",
  "pickupAddress.contactName",
  "pickupAddress.contactPhone",
  "fssaiLicenseNo",
  "fssaiValidUntil",
  "gstin",
  ...STEPS[2].fields,
  "owner.name",
  "owner.phone",
];
/** Server problems that point at one field. */
const CODE_FIELDS = {
  PICKUP_OUTSIDE_CITY: "pickupPincode",
  UNKNOWN_PINCODE: "pickupPincode",
  SLUG_TAKEN: "name",
  INVALID_PHONE: "owner.phone",
};

/**
 * Create a kitchen in four short steps, or edit one on a single page. Validation runs per step
 * with the same schema the API enforces.
 */
export function KitchenForm({ kitchen }: { kitchen?: KitchenDetail }) {
  const editing = Boolean(kitchen);
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const options = useOnboardingOptions();
  const [d, setD] = useState<Draft>(() => (kitchen ? fromKitchen(kitchen) : BLANK));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setD((x) => ({ ...x, [key]: value }));

  const origins = (options.data?.cities ?? []).filter((c) => c.isOrigin);
  const validate = (fields: readonly string[]) => {
    const fieldsValue = toFields(d);
    const parsed = editing
      ? UpdateKitchenRequestSchema.safeParse(fieldsValue)
      : CreateKitchenRequestSchema.safeParse({
          ...fieldsValue,
          cityId: d.cityId,
          owner: { name: d.ownerName.trim(), phone: d.ownerPhone.trim() },
        });
    const found = issuesFor(parsed.success ? null : parsed.error, fields, MESSAGES);
    if (fields.includes("cityId") && !d.cityId) found.cityId = MESSAGES.cityId!;
    return found;
  };

  const save = useMutation({
    mutationFn: () =>
      kitchen
        ? api.updateKitchen(kitchen.id, toFields(d))
        : api.createKitchen({
            ...toFields(d),
            cityId: d.cityId,
            owner: { name: d.ownerName.trim(), phone: d.ownerPhone.trim() },
          }),
    onSuccess: (k) => {
      qc.setQueryData(["ops-kitchen", k.id], k);
      void qc.invalidateQueries({ queryKey: ["ops-vendors"] });
      toast(
        "success",
        editing ? "Kitchen details saved." : `${k.name} added — finish the checklist to go live.`,
      );
      router.push(`/ops/kitchens/${k.id}`);
    },
    onError: (e) => {
      const { fields, message } = serverErrors(e, CODE_FIELDS);
      setErrors(fields);
      setFormError(message);
      // Jump back to the step that holds the problem.
      const first = Object.keys(fields)[0];
      if (!editing && first) {
        const at = STEPS.findIndex((s) =>
          s.fields.some((f) => first === f || first.startsWith(`${f}.`)),
        );
        if (at >= 0) setStep(at);
      }
    },
  });

  function next() {
    const found = validate(STEPS[step]!.fields);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length === 0) setStep(step + 1);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing && step < STEPS.length - 1) return next();
    const found = validate(ALL_FIELDS);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length === 0) save.mutate();
  }

  const show = (i: number) => editing || step === i;
  const id = (path: string) => fieldId(FORM, path);
  const control = (path: string, hint?: string) => ({
    id: id(path),
    "aria-invalid": Boolean(errors[path]) || undefined,
    "aria-describedby": describedBy(id(path), { hint, error: errors[path] }),
  });
  const field = (path: string, label: string, hint?: string, opt = false) => ({
    label,
    htmlFor: id(path),
    hint,
    error: errors[path],
    optional: opt,
    announce: false,
  });

  return (
    <form onSubmit={submit} noValidate className="grid gap-6">
      {!editing && <Stepper steps={STEPS.map((s) => s.title)} current={step} onSelect={setStep} />}
      <ErrorSummary errors={summaryOf(errors, FORM, ORDER)} />
      {formError && (
        <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm font-semibold text-danger">
          {formError}
        </p>
      )}

      {show(0) && (
        <FormSection title="The kitchen" description="How shoppers will meet it on the storefront.">
          <Field {...field("name", "Kitchen name")}>
            <Input
              {...control("name")}
              value={d.name}
              onChange={(e) => set("name", e.target.value)}
              autoComplete="organization"
            />
          </Field>
          {!editing && (
            <Field
              {...field(
                "cityId",
                "City",
                origins.length === 0
                  ? "No city ships out yet. Mark one as an origin under Cities."
                  : "Only cities set up to ship out are listed.",
              )}
            >
              <Select
                {...control("cityId", "hint")}
                value={d.cityId}
                onChange={(e) => set("cityId", e.target.value)}
              >
                <option value="">Choose a city…</option>
                {origins.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="grid gap-4 md:grid-cols-[1fr_12rem]">
            <Field
              {...field(
                "tagline",
                "Tagline",
                "One line, e.g. “Kolkata’s sandesh since 1885”.",
                true,
              )}
            >
              <Input
                {...control("tagline", "hint")}
                value={d.tagline}
                onChange={(e) => set("tagline", e.target.value)}
                maxLength={140}
              />
            </Field>
            <Field {...field("establishedYear", "Established", undefined, true)}>
              <Input
                {...control("establishedYear")}
                inputMode="numeric"
                placeholder="e.g. 1921"
                value={d.establishedYear}
                onChange={(e) =>
                  set("establishedYear", e.target.value.replace(/\D/g, "").slice(0, 4))
                }
              />
            </Field>
          </div>
          <Field
            {...field("story", "Story", "A few sentences about the family and the craft.", true)}
          >
            <Textarea
              {...control("story", "hint")}
              value={d.story}
              onChange={(e) => set("story", e.target.value)}
              rows={4}
            />
          </Field>
        </FormSection>
      )}

      {show(1) && (
        <FormSection
          title="Pickup & licence"
          description="Where the courier collects, and the licences printed on every product page."
        >
          <div className="grid gap-4 md:grid-cols-[12rem_1fr]">
            <Field {...field("pickupPincode", "Pickup pincode", "Must be in the kitchen's city.")}>
              <Input
                {...control("pickupPincode", "hint")}
                inputMode="numeric"
                autoComplete="postal-code"
                className="tabular"
                value={d.pickupPincode}
                onChange={(e) =>
                  set("pickupPincode", e.target.value.replace(/\D/g, "").slice(0, 6))
                }
              />
            </Field>
            <Field {...field("pickupAddress.line1", "Address")}>
              <Input
                {...control("pickupAddress.line1")}
                autoComplete="street-address"
                value={d.line1}
                onChange={(e) => set("line1", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field {...field("pickupAddress.line2", "Area", undefined, true)}>
              <Input
                {...control("pickupAddress.line2")}
                value={d.line2}
                onChange={(e) => set("line2", e.target.value)}
              />
            </Field>
            <Field {...field("pickupAddress.landmark", "Landmark", undefined, true)}>
              <Input
                {...control("pickupAddress.landmark")}
                value={d.landmark}
                onChange={(e) => set("landmark", e.target.value)}
              />
            </Field>
            <Field {...field("pickupAddress.contactName", "Dispatch contact")}>
              <Input
                {...control("pickupAddress.contactName")}
                value={d.contactName}
                onChange={(e) => set("contactName", e.target.value)}
              />
            </Field>
            <Field
              {...field(
                "pickupAddress.contactPhone",
                "Contact mobile",
                "The courier calls this number at pickup.",
              )}
            >
              <Input
                {...control("pickupAddress.contactPhone", "hint")}
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                value={d.contactPhone}
                onChange={(e) => set("contactPhone", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Field {...field("fssaiLicenseNo", "FSSAI licence no.")}>
              <Input
                {...control("fssaiLicenseNo")}
                inputMode="numeric"
                className="tabular"
                value={d.fssaiLicenseNo}
                onChange={(e) =>
                  set("fssaiLicenseNo", e.target.value.replace(/\D/g, "").slice(0, 14))
                }
              />
            </Field>
            <Field
              {...field(
                "fssaiValidUntil",
                "Licence valid until",
                "At least 30 days left to go live.",
              )}
            >
              <Input
                {...control("fssaiValidUntil", "hint")}
                type="date"
                value={d.fssaiValidUntil}
                onChange={(e) => set("fssaiValidUntil", e.target.value)}
              />
            </Field>
            <Field {...field("gstin", "GSTIN", undefined, true)}>
              <Input
                {...control("gstin")}
                className="tabular uppercase"
                maxLength={15}
                value={d.gstin}
                onChange={(e) => set("gstin", e.target.value.toUpperCase())}
              />
            </Field>
          </div>
        </FormSection>
      )}

      {show(2) && (
        <FormSection
          title="Dispatch & terms"
          description="When the kitchen cooks and hands over, and what it can handle. The delivery-date engine plans every order from these."
        >
          <Field
            {...field("dispatchWeekdays", "Dispatch days", describeWeekdays(d.dispatchWeekdays))}
          >
            <WeekdayPicker
              id={id("dispatchWeekdays")}
              value={d.dispatchWeekdays}
              onChange={(m) => set("dispatchWeekdays", m)}
              invalid={Boolean(errors.dispatchWeekdays)}
              describedBy={describedBy(id("dispatchWeekdays"), {
                hint: "hint",
                error: errors.dispatchWeekdays,
              })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field {...field("orderCutoffLocal", "Order cutoff", "Orders close at this time.")}>
              <Input
                {...control("orderCutoffLocal", "hint")}
                type="time"
                value={d.orderCutoffLocal}
                onChange={(e) => set("orderCutoffLocal", e.target.value)}
              />
            </Field>
            <Field {...field("prepLeadDays", "Days before dispatch", "1 = the evening before.")}>
              <Input
                {...control("prepLeadDays", "hint")}
                type="number"
                min={0}
                max={3}
                inputMode="numeric"
                value={d.prepLeadDays}
                onChange={(e) => set("prepLeadDays", e.target.value)}
              />
            </Field>
            <Field {...field("prepStartLocal", "Cooking starts")}>
              <Input
                {...control("prepStartLocal")}
                type="time"
                value={d.prepStartLocal}
                onChange={(e) => set("prepStartLocal", e.target.value)}
              />
            </Field>
            <Field {...field("readyForPickupLocal", "Ready for pickup")}>
              <Input
                {...control("readyForPickupLocal")}
                type="time"
                value={d.readyForPickupLocal}
                onChange={(e) => set("readyForPickupLocal", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field {...field("dailyShipmentCap", "Parcels a day, at most")}>
              <Input
                {...control("dailyShipmentCap")}
                type="number"
                min={1}
                inputMode="numeric"
                value={d.dailyShipmentCap}
                onChange={(e) => set("dailyShipmentCap", e.target.value)}
              />
            </Field>
            <Field {...field("commissionBps", "Commission (%)")}>
              <Input
                {...control("commissionBps")}
                type="number"
                min={0}
                max={100}
                step={0.5}
                inputMode="decimal"
                value={d.commissionPct}
                onChange={(e) => set("commissionPct", e.target.value)}
              />
            </Field>
            <Field
              {...field(
                "payoutAccountRef",
                "Razorpay Route account",
                "Payouts are held until it's linked.",
                true,
              )}
            >
              <Input
                {...control("payoutAccountRef", "hint")}
                placeholder="acc_…"
                value={d.payoutAccountRef}
                onChange={(e) => set("payoutAccountRef", e.target.value)}
              />
            </Field>
          </div>
        </FormSection>
      )}

      {!editing && step === 3 && (
        <>
          <FormSection
            title="Owner"
            description="They'll sign in with this mobile number to run the kitchen portal: dispatch days, packing and labels."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field {...field("owner.name", "Owner's name")}>
                <Input
                  {...control("owner.name")}
                  autoComplete="name"
                  value={d.ownerName}
                  onChange={(e) => set("ownerName", e.target.value)}
                />
              </Field>
              <Field {...field("owner.phone", "Owner's mobile")}>
                <Input
                  {...control("owner.phone")}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  value={d.ownerPhone}
                  onChange={(e) => set("ownerPhone", e.target.value)}
                />
              </Field>
            </div>
          </FormSection>
          <Review
            draft={d}
            cityName={origins.find((c) => c.id === d.cityId)?.name ?? "—"}
            onEdit={setStep}
          />
        </>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-3 border-t border-line bg-paper/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        {!editing && step > 0 ? (
          <Button variant="secondary" onClick={() => setStep(step - 1)}>
            <ArrowLeft className="size-4" aria-hidden /> Back
          </Button>
        ) : (
          <span />
        )}
        {!editing && step < STEPS.length - 1 ? (
          <Button type="submit">
            Continue <ArrowRight className="size-4" aria-hidden />
          </Button>
        ) : (
          <Button type="submit" loading={save.isPending}>
            {editing ? "Save changes" : "Add kitchen"}
          </Button>
        )}
      </div>
    </form>
  );
}

function Review({
  draft: d,
  cityName,
  onEdit,
}: {
  draft: Draft;
  cityName: string;
  onEdit: (step: number) => void;
}) {
  const rows: [string, string, number][] = [
    ["Kitchen", `${d.name}${d.establishedYear ? ` · since ${d.establishedYear}` : ""}`, 0],
    ["City", cityName, 0],
    ["Pickup", `${d.line1}, ${d.pickupPincode} · ${d.contactName} (${d.contactPhone})`, 1],
    ["FSSAI", `${d.fssaiLicenseNo} · valid until ${d.fssaiValidUntil}`, 1],
    [
      "Dispatch",
      `${describeWeekdays(d.dispatchWeekdays)} · orders close ${d.orderCutoffLocal}, ${d.prepLeadDays} day(s) before · ready by ${d.readyForPickupLocal}`,
      2,
    ],
    ["Terms", `Up to ${d.dailyShipmentCap} parcels a day · ${d.commissionPct}% commission`, 2],
  ];
  return (
    <section
      aria-labelledby="review-title"
      className="rounded-lg border border-line bg-card p-4 md:p-6"
    >
      <h2 id="review-title" className="mb-3 text-xl font-bold">
        Check before adding
      </h2>
      <dl className="divide-y divide-line text-sm">
        {rows.map(([label, value, step]) => (
          <div
            key={label}
            className="grid gap-1 py-2.5 sm:grid-cols-[8rem_1fr_auto] sm:items-center"
          >
            <dt className="font-semibold text-ink-muted">{label}</dt>
            <dd className="text-ink">{value}</dd>
            <dd>
              <button
                type="button"
                onClick={() => onEdit(step)}
                className="min-h-11 font-semibold text-jaggery underline-offset-2 hover:underline sm:min-h-0"
              >
                Edit<span className="sr-only"> {label.toLowerCase()}</span>
              </button>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm text-ink-soft">
        The kitchen starts in onboarding and isn't visible to shoppers until it passes the go-live
        checklist.
      </p>
    </section>
  );
}
