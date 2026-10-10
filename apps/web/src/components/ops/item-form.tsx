"use client";

import {
  ART_LABELS,
  type DIETS,
  formatShelfLife,
  minResidualFloorHours,
  TEMP_LABELS,
  type TempClass,
  validateFreshness,
} from "@food-del/domain";
import {
  type ItemAdminDetail,
  type ItemInput,
  ItemInputSchema,
  type ReachPreviewRequest,
} from "@food-del/domain/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Plane, Plus, Trash2, Truck, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatINR, formatLocalDate } from "@/lib/format";
import {
  type FieldErrors,
  fieldId,
  issuesFor,
  optional,
  paiseToRupees,
  rupeesToPaise,
  serverErrors,
  summaryOf,
} from "@/lib/forms";
import { ItemArt } from "../item-art";
import { useToast } from "../toast";
import { ErrorSummary } from "../ui/error-summary";
import {
  Button,
  Card,
  describedBy,
  Field,
  Input,
  Select,
  Skeleton,
  Textarea,
} from "../ui/primitives";
import { FormSection, useOnboardingOptions } from "./common";

const FORM = "item";

interface PackDraft {
  id?: string;
  label: string;
  price: string;
  mrp: string;
  netG: string;
  packedG: string;
  cap: string;
  isActive: boolean;
}

interface Draft {
  name: string;
  categoryId: string;
  shortDescription: string;
  description: string;
  originStory: string;
  diet: (typeof DIETS)[number];
  artKey: string;
  isFeatured: boolean;
  tempClass: TempClass;
  shelfLifeHours: string;
  minResidualHours: string;
  madeToOrder: boolean;
  maxAgeAtDispatchHours: string;
  hsnCode: string;
  gstRateBps: number;
  ingredients: string;
  allergens: string;
  storage: string;
  packs: PackDraft[];
}

const BLANK_PACK: PackDraft = {
  label: "",
  price: "",
  mrp: "",
  netG: "",
  packedG: "",
  cap: "30",
  isActive: true,
};

const BLANK: Draft = {
  name: "",
  categoryId: "",
  shortDescription: "",
  description: "",
  originStory: "",
  diet: "VEG",
  artKey: "",
  isFeatured: false,
  tempClass: "AMBIENT",
  shelfLifeHours: "",
  minResidualHours: "",
  madeToOrder: true,
  maxAgeAtDispatchHours: "",
  hsnCode: "",
  gstRateBps: 500,
  ingredients: "",
  allergens: "",
  storage: "",
  packs: [{ ...BLANK_PACK }],
};

function fromItem(i: ItemAdminDetail): Draft {
  return {
    name: i.name,
    categoryId: i.categoryId,
    shortDescription: i.shortDescription,
    description: i.description ?? "",
    originStory: i.originStory ?? "",
    diet: i.diet,
    artKey: i.artKey ?? "",
    isFeatured: i.isFeatured,
    tempClass: i.tempClass,
    shelfLifeHours: String(i.shelfLifeHours),
    minResidualHours: String(i.minResidualHours),
    madeToOrder: i.madeToOrder,
    maxAgeAtDispatchHours: i.maxAgeAtDispatchHours ? String(i.maxAgeAtDispatchHours) : "",
    hsnCode: i.hsnCode,
    gstRateBps: i.gstRateBps,
    ingredients: i.ingredients,
    allergens: i.allergens.join(", "),
    storage: i.storage,
    packs: i.variants
      .filter((v) => v.isActive)
      .map((v) => ({
        id: v.id,
        label: v.label,
        price: paiseToRupees(v.pricePaise),
        mrp: paiseToRupees(v.mrpPaise),
        netG: String(v.netWeightG),
        packedG: String(v.packedWeightG),
        cap: String(v.defaultDailyCap),
        isActive: true,
      })),
  };
}

const num = (v: string) => (v.trim() === "" ? Number.NaN : Number(v));

function toInput(d: Draft): ItemInput {
  return {
    categoryId: d.categoryId,
    name: d.name.trim(),
    shortDescription: d.shortDescription.trim(),
    description: optional(d.description) ?? null,
    originStory: optional(d.originStory) ?? null,
    diet: d.diet,
    tempClass: d.tempClass,
    shelfLifeHours: num(d.shelfLifeHours),
    minResidualHours: num(d.minResidualHours),
    madeToOrder: d.madeToOrder,
    maxAgeAtDispatchHours: d.madeToOrder ? null : num(d.maxAgeAtDispatchHours),
    hsnCode: d.hsnCode.trim(),
    gstRateBps: d.gstRateBps,
    ingredients: d.ingredients.trim(),
    allergens: d.allergens
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean),
    storage: d.storage.trim(),
    artKey: (d.artKey || null) as ItemInput["artKey"],
    isFeatured: d.isFeatured,
    variants: d.packs.map((p) => ({
      id: p.id,
      label: p.label.trim(),
      pricePaise: p.price.trim() ? rupeesToPaise(p.price) : Number.NaN,
      mrpPaise: p.mrp.trim() ? rupeesToPaise(p.mrp) : null,
      netWeightG: num(p.netG),
      packedWeightG: num(p.packedG),
      defaultDailyCap: num(p.cap),
      isActive: p.isActive,
    })),
  };
}

const PACK_MESSAGES: Record<string, string> = {
  label: "Name the pack, e.g. “Box of 12”.",
  pricePaise: "Enter the price in rupees.",
  mrpPaise: "Enter the MRP in rupees, or leave it blank.",
  netWeightG: "Enter the net weight in grams.",
  packedWeightG: "Enter the packed weight in grams.",
  defaultDailyCap: "How many the kitchen can make a day (0 or more).",
};
const MESSAGES: Record<string, string> = {
  name: "Enter the delicacy's name.",
  categoryId: "Choose a category.",
  shortDescription: "Describe it in one line (10–160 characters).",
  shelfLifeHours: "Enter the shelf life in hours.",
  minResidualHours: "Enter the hours of freshness it must have left on arrival.",
  maxAgeAtDispatchHours: "Enter how old stock may be when it leaves the kitchen, in hours.",
  hsnCode: "HSN codes are 4, 6 or 8 digits (sweets are usually 1704 or 2106).",
  ingredients: "List the ingredients.",
  storage: "Say how to store it.",
  variants: "Add at least one pack size.",
  ...Object.fromEntries(
    Array.from({ length: 6 }, (_, i) =>
      Object.entries(PACK_MESSAGES).map(([k, m]) => [`variants.${i}.${k}`, m] as const),
    ).flat(),
  ),
};
const FIELDS = [
  "name",
  "categoryId",
  "shortDescription",
  "description",
  "originStory",
  "diet",
  "artKey",
  "tempClass",
  "shelfLifeHours",
  "minResidualHours",
  "maxAgeAtDispatchHours",
  "hsnCode",
  "gstRateBps",
  "ingredients",
  "allergens",
  "storage",
  "variants",
] as const;

/** Debounce a value so the reach preview asks the planner once typing pauses. */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function previewRequest(d: Draft): ReachPreviewRequest | null {
  const pack = d.packs.find((p) => p.isActive && num(p.packedG) > 0 && num(p.price) > 0);
  const shelf = num(d.shelfLifeHours);
  const residual = num(d.minResidualHours);
  if (!pack || !(shelf > 0) || !(residual >= 0)) return null;
  const freshness = {
    tempClass: d.tempClass,
    shelfLifeHours: shelf,
    minResidualHours: residual,
    madeToOrder: d.madeToOrder,
    maxAgeAtDispatchHours: d.madeToOrder ? null : num(d.maxAgeAtDispatchHours) || null,
  };
  if (validateFreshness(freshness).length > 0) return null;
  return {
    ...freshness,
    packedWeightG: num(pack.packedG),
    pricePaise: rupeesToPaise(pack.price),
    gstRateBps: d.gstRateBps,
  };
}

/** Where the drafted delicacy could reach fresh: the real planner, run per destination city. */
function ReachPreview({ kitchenId, draft }: { kitchenId: string; draft: Draft }) {
  const request = useDebounced(previewRequest(draft), 450);
  const key = JSON.stringify(request);
  const preview = useQuery({
    queryKey: ["ops-reach", kitchenId, key],
    queryFn: () => api.reachPreview(kitchenId, request!),
    enabled: request !== null,
    placeholderData: (prev) => prev,
  });
  const list = preview.data?.destinations ?? [];
  const reached = list.filter((d) => d.ok).length;
  return (
    <section aria-labelledby="reach-title" aria-busy={preview.isFetching || undefined}>
      <h2 id="reach-title" className="font-sans text-base font-bold">
        Where it can reach fresh
      </h2>
      {request === null ? (
        <p className="mt-2 text-sm text-ink-muted">
          Fill in the shelf life, freshness on arrival and one pack's price and packed weight to see
          which cities it can reach.
        </p>
      ) : !preview.data ? (
        <Skeleton className="mt-3 h-40" />
      ) : (
        <>
          <p
            className={cn("mt-1 text-sm font-semibold", reached ? "text-success" : "text-danger")}
            aria-live="polite"
          >
            {reached} of {list.length} cities from {preview.data.origin.name}
          </p>
          <ul
            className={cn("mt-3 divide-y divide-line text-sm", preview.isFetching && "opacity-60")}
          >
            {list.map((d) => (
              <li key={d.city.slug} className="flex gap-2 py-2">
                {d.ok ? (
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-success"
                    aria-label="Reaches"
                  />
                ) : (
                  <XCircle
                    className="mt-0.5 size-4 shrink-0 text-danger"
                    aria-label="Can't reach"
                  />
                )}
                <div className="min-w-0">
                  <p className="font-semibold">{d.city.name}</p>
                  {d.ok ? (
                    <p className="text-ink-soft">
                      <span className="inline-flex items-center gap-1">
                        {d.mode === "AIR_EXPRESS" ? (
                          <Plane className="size-3.5" aria-label="Air" />
                        ) : (
                          <Truck className="size-3.5" aria-label="Road" />
                        )}
                        by {formatLocalDate(d.deliveryDate!)}
                      </span>{" "}
                      · {d.packaging} · {formatINR(d.shippingPaise ?? 0)} shipping
                    </p>
                  ) : (
                    <p className="text-ink-soft">{d.message}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function ItemForm({ kitchenId, item }: { kitchenId: string; item?: ItemAdminDetail }) {
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const options = useOnboardingOptions();
  const [d, setD] = useState<Draft>(() => (item ? fromItem(item) : BLANK));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setD((x) => ({ ...x, [key]: value }));
  const setPack = (i: number, patch: Partial<PackDraft>) =>
    setD((x) => ({ ...x, packs: x.packs.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));

  const save = useMutation({
    mutationFn: () =>
      item ? api.updateItem(item.id, toInput(d)) : api.createItem(kitchenId, toInput(d)),
    onSuccess: (saved) => {
      qc.setQueryData(["ops-item", saved.id], saved);
      void qc.invalidateQueries({ queryKey: ["ops-kitchen", kitchenId] });
      if (item) {
        setD(fromItem(saved));
        toast("success", "Saved.");
      } else {
        toast("success", `${saved.name} saved as a draft. Put it on sale when you're ready.`);
        router.push(`/ops/kitchens/${kitchenId}`);
      }
    },
    onError: (e) => {
      const { fields, message } = serverErrors(e, {
        SLUG_TAKEN: "name",
        UNKNOWN_CATEGORY: "categoryId",
      });
      setErrors(fields);
      setFormError(message);
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = ItemInputSchema.safeParse(toInput(d));
    const found = issuesFor(parsed.success ? null : parsed.error, FIELDS, MESSAGES);
    if (!d.categoryId) found.categoryId = MESSAGES.categoryId!;
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length === 0) save.mutate();
  }

  const id = (path: string) => fieldId(FORM, path);
  const control = (path: string, hint?: boolean) => ({
    id: id(path),
    "aria-invalid": Boolean(errors[path]) || undefined,
    "aria-describedby": describedBy(id(path), {
      hint: hint ? "y" : undefined,
      error: errors[path],
    }),
  });
  const field = (path: string, label: string, hint?: string, opt = false) => ({
    label,
    htmlFor: id(path),
    hint,
    error: errors[path],
    optional: opt,
    announce: false,
  });
  const shelf = num(d.shelfLifeHours);
  const floor = shelf > 0 ? minResidualFloorHours(shelf) : null;
  const order = [
    ...FIELDS.slice(0, -1),
    ...d.packs.flatMap((_, i) => Object.keys(PACK_MESSAGES).map((k) => `variants.${i}.${k}`)),
    "variants",
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <form onSubmit={submit} noValidate className="grid content-start gap-6">
        <ErrorSummary errors={summaryOf(errors, FORM, order)} />
        {formError && (
          <p
            role="alert"
            className="rounded-md bg-danger-soft p-3 text-sm font-semibold text-danger"
          >
            {formError}
          </p>
        )}

        <FormSection title="About it" description="What shoppers read on the product page.">
          <div className="grid gap-4 md:grid-cols-2">
            <Field {...field("name", "Name", item ? `Address: /delicacy/${item.slug}` : undefined)}>
              <Input
                {...control("name", Boolean(item))}
                value={d.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field {...field("categoryId", "Category")}>
              <Select
                {...control("categoryId")}
                value={d.categoryId}
                onChange={(e) => set("categoryId", e.target.value)}
              >
                <option value="">Choose…</option>
                {options.data?.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field
            {...field(
              "shortDescription",
              "One-line description",
              "Shown on cards, up to 160 characters.",
            )}
          >
            <Input
              {...control("shortDescription", true)}
              maxLength={160}
              value={d.shortDescription}
              onChange={(e) => set("shortDescription", e.target.value)}
            />
          </Field>
          <Field {...field("description", "Full description", undefined, true)}>
            <Textarea
              {...control("description")}
              rows={3}
              value={d.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>
          <Field
            {...field(
              "originStory",
              "Origin story",
              "Where and why it came to be; shown as a pull quote.",
              true,
            )}
          >
            <Textarea
              {...control("originStory", true)}
              rows={2}
              value={d.originStory}
              onChange={(e) => set("originStory", e.target.value)}
            />
          </Field>
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-start">
            <Field {...field("diet", "Diet mark")}>
              <Select
                {...control("diet")}
                value={d.diet}
                onChange={(e) => set("diet", e.target.value as Draft["diet"])}
              >
                <option value="VEG">Vegetarian</option>
                <option value="EGG">Contains egg</option>
                <option value="NON_VEG">Non-vegetarian</option>
              </Select>
            </Field>
            <Field {...field("artKey", "Illustration", "Until photography arrives.")}>
              <Select
                {...control("artKey", true)}
                value={d.artKey}
                onChange={(e) => set("artKey", e.target.value)}
              >
                <option value="">Plain</option>
                {options.data?.artKeys.map((a) => (
                  <option key={a} value={a}>
                    {ART_LABELS[a]}
                  </option>
                ))}
              </Select>
            </Field>
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold md:mt-7">
              <input
                type="checkbox"
                checked={d.isFeatured}
                onChange={(e) => set("isFeatured", e.target.checked)}
                className="size-5 accent-[var(--color-jaggery)]"
              />
              Feature on the home page
            </label>
          </div>
        </FormSection>

        <FormSection
          title="Freshness"
          description="The delivery-date engine only offers dates that leave this much freshness on arrival."
        >
          <div className="grid gap-4 md:grid-cols-3">
            <Field
              {...field(
                "tempClass",
                "Travels",
                d.tempClass === "CHILLED" ? "Flies in insulated boxes; never by road." : undefined,
              )}
            >
              <Select
                {...control("tempClass", d.tempClass === "CHILLED")}
                value={d.tempClass}
                onChange={(e) => set("tempClass", e.target.value as TempClass)}
              >
                <option value="AMBIENT">{TEMP_LABELS.AMBIENT}</option>
                <option value="CHILLED">{TEMP_LABELS.CHILLED}</option>
              </Select>
            </Field>
            <Field
              {...field(
                "shelfLifeHours",
                "Shelf life (hours)",
                shelf > 0
                  ? `About ${formatShelfLife(shelf)} from cooking.`
                  : "From the moment it's made.",
              )}
            >
              <Input
                {...control("shelfLifeHours", true)}
                type="number"
                min={1}
                inputMode="numeric"
                value={d.shelfLifeHours}
                onChange={(e) => set("shelfLifeHours", e.target.value)}
              />
            </Field>
            <Field
              {...field(
                "minResidualHours",
                "Fresh on arrival (hours)",
                floor !== null
                  ? `At least ${floor} h — 30% of the shelf life.`
                  : "Hours of freshness left when it arrives.",
              )}
            >
              <Input
                {...control("minResidualHours", true)}
                type="number"
                min={0}
                inputMode="numeric"
                value={d.minResidualHours}
                onChange={(e) => set("minResidualHours", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-end">
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={d.madeToOrder}
                onChange={(e) => set("madeToOrder", e.target.checked)}
                className="size-5 accent-[var(--color-jaggery)]"
              />
              Made fresh for each dispatch
            </label>
            {!d.madeToOrder && (
              <Field {...field("maxAgeAtDispatchHours", "Oldest stock that may ship (hours)")}>
                <Input
                  {...control("maxAgeAtDispatchHours")}
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={d.maxAgeAtDispatchHours}
                  onChange={(e) => set("maxAgeAtDispatchHours", e.target.value)}
                />
              </Field>
            )}
          </div>
        </FormSection>

        <FormSection
          title="Labelling & tax"
          description="Printed on the product page, as FSSAI and Legal Metrology require."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field {...field("hsnCode", "HSN code")}>
              <Input
                {...control("hsnCode")}
                inputMode="numeric"
                className="tabular"
                value={d.hsnCode}
                onChange={(e) => set("hsnCode", e.target.value.replace(/\D/g, "").slice(0, 8))}
              />
            </Field>
            <Field {...field("gstRateBps", "GST")}>
              <Select
                {...control("gstRateBps")}
                value={d.gstRateBps}
                onChange={(e) => set("gstRateBps", Number(e.target.value))}
              >
                {(options.data?.gstRatesBps ?? [0, 500, 1200, 1800]).map((r) => (
                  <option key={r} value={r}>
                    {r / 100}%
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field {...field("ingredients", "Ingredients", "In descending order of weight.")}>
            <Textarea
              {...control("ingredients", true)}
              rows={2}
              value={d.ingredients}
              onChange={(e) => set("ingredients", e.target.value)}
            />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              {...field(
                "allergens",
                "Allergens",
                "Comma-separated, e.g. Milk, Tree nuts. Leave blank if none.",
                true,
              )}
            >
              <Input
                {...control("allergens", true)}
                value={d.allergens}
                onChange={(e) => set("allergens", e.target.value)}
              />
            </Field>
            <Field {...field("storage", "Storage")}>
              <Input
                {...control("storage")}
                value={d.storage}
                onChange={(e) => set("storage", e.target.value)}
              />
            </Field>
          </div>
        </FormSection>

        <FormSection
          title="Pack sizes"
          description="Each pack has its own price, weight and daily limit. Packs you remove stop selling but stay in order history."
        >
          <ul className="grid gap-4">
            {d.packs.map((p, i) => (
              <li
                key={p.id ?? `new-${i}`}
                className="rounded-md border border-line bg-paper p-3 md:p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-bold">Pack {i + 1}</p>
                  {d.packs.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove pack ${i + 1}`}
                      onClick={() =>
                        set(
                          "packs",
                          d.packs.filter((_, j) => j !== i),
                        )
                      }
                    >
                      <Trash2 className="size-4" aria-hidden /> Remove
                    </Button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Field {...field(`variants.${i}.label`, "Label", "e.g. Box of 12 (480 g)")}>
                    <Input
                      {...control(`variants.${i}.label`, true)}
                      value={p.label}
                      onChange={(e) => setPack(i, { label: e.target.value })}
                    />
                  </Field>
                  <Field {...field(`variants.${i}.pricePaise`, "Price (₹, incl. GST)")}>
                    <Input
                      {...control(`variants.${i}.pricePaise`)}
                      type="number"
                      min={1}
                      step="0.01"
                      inputMode="decimal"
                      value={p.price}
                      onChange={(e) => setPack(i, { price: e.target.value })}
                    />
                  </Field>
                  <Field {...field(`variants.${i}.mrpPaise`, "MRP (₹)", undefined, true)}>
                    <Input
                      {...control(`variants.${i}.mrpPaise`)}
                      type="number"
                      min={1}
                      step="0.01"
                      inputMode="decimal"
                      value={p.mrp}
                      onChange={(e) => setPack(i, { mrp: e.target.value })}
                    />
                  </Field>
                  <Field {...field(`variants.${i}.netWeightG`, "Net weight (g)")}>
                    <Input
                      {...control(`variants.${i}.netWeightG`)}
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={p.netG}
                      onChange={(e) => setPack(i, { netG: e.target.value })}
                    />
                  </Field>
                  <Field
                    {...field(
                      `variants.${i}.packedWeightG`,
                      "Packed weight (g)",
                      "With its own box; drives shipping.",
                    )}
                  >
                    <Input
                      {...control(`variants.${i}.packedWeightG`, true)}
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={p.packedG}
                      onChange={(e) => setPack(i, { packedG: e.target.value })}
                    />
                  </Field>
                  <Field {...field(`variants.${i}.defaultDailyCap`, "Can make a day")}>
                    <Input
                      {...control(`variants.${i}.defaultDailyCap`)}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={p.cap}
                      onChange={(e) => setPack(i, { cap: e.target.value })}
                    />
                  </Field>
                </div>
              </li>
            ))}
          </ul>
          {d.packs.length < 6 && (
            <Button
              variant="secondary"
              className="w-fit"
              onClick={() => set("packs", [...d.packs, { ...BLANK_PACK }])}
            >
              <Plus className="size-4" aria-hidden /> Add a pack size
            </Button>
          )}
        </FormSection>

        <div className="sticky bottom-0 z-10 -mx-4 flex justify-end gap-3 border-t border-line bg-paper/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
          <Button type="submit" loading={save.isPending}>
            {item ? "Save changes" : "Save as draft"}
          </Button>
        </div>
      </form>

      <aside className="grid content-start gap-4 lg:sticky lg:top-24 lg:self-start">
        <Card className="overflow-hidden">
          <div className="aspect-[4/3]">
            <ItemArt
              art={d.artKey || null}
              tempClass={d.tempClass}
              label={`Illustration for ${d.name || "this delicacy"}`}
            />
          </div>
          <div className="p-4">
            <p className="font-display text-lg font-bold">{d.name || "Untitled delicacy"}</p>
            <p className="text-sm text-ink-soft">{d.shortDescription || "One-line description"}</p>
          </div>
        </Card>
        <Card className="p-4">
          <ReachPreview kitchenId={kitchenId} draft={d} />
        </Card>
      </aside>
    </div>
  );
}
