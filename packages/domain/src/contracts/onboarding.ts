import { z } from "zod";
import { validateFreshness } from "../catalog";
import { CITY_LAUNCH_STATUSES, normaliseIndianMobile } from "../geo";
import {
  ART_KEYS,
  FSSAI_RE,
  GST_RATES_BPS,
  GSTIN_RE,
  HHMM_RE,
  HSN_RE,
  IATA_RE,
  READINESS_KEYS,
  SLUG_RE,
  STATE_CODE_RE,
} from "../onboarding";
import {
  CityRef,
  DietSchema,
  Instant,
  LocalDateString,
  Money,
  Pincode,
  ReasonCodeSchema,
  ShipModeSchema,
  TempClassSchema,
} from "./common";

const Slug = z.string().regex(SLUG_RE, "Use lowercase letters, numbers and hyphens");
const LocalTime = z
  .string()
  .regex(HHMM_RE, "Use 24-hour time, e.g. 18:00")
  .meta({ id: "LocalTime", description: "Time of day in IST (HH:MM)", example: "18:00" });
const IndianMobile = z
  .string()
  .refine((v) => normaliseIndianMobile(v) !== null, "Enter a 10-digit Indian mobile number");
const PositivePaise = z.number().int().positive();
const KITCHEN_STATUSES = ["ONBOARDING", "ACTIVE", "PAUSED", "OFFBOARDED"] as const;
const ITEM_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"] as const;

// ─── Reference data for the forms ─────────────────────────────────────────────────────────────

export const OnboardingOptionsSchema = z
  .object({
    cities: z.array(
      z.object({
        id: z.string(),
        slug: z.string(),
        name: z.string(),
        stateCode: z.string(),
        isOrigin: z.boolean(),
        isDestination: z.boolean(),
        launchStatus: z.enum(CITY_LAUNCH_STATUSES),
        pincodes: z.number().int(),
      }),
    ),
    categories: z.array(z.object({ id: z.string(), slug: z.string(), name: z.string() })),
    /** Courier services we hold rate cards for, with their zones. */
    carriers: z.array(
      z.object({
        code: z.string(),
        modes: z.array(z.object({ mode: ShipModeSchema, zones: z.array(z.string()) })),
      }),
    ),
    artKeys: z.array(z.enum(ART_KEYS)),
    gstRatesBps: z.array(z.number().int()),
  })
  .meta({ id: "OnboardingOptions" });
export type OnboardingOptions = z.infer<typeof OnboardingOptionsSchema>;

// ─── Kitchens ─────────────────────────────────────────────────────────────────────────────────

const KitchenFields = {
  name: z.string().trim().min(2).max(80),
  tagline: z.string().trim().max(140).nullable().optional(),
  story: z.string().trim().max(2000).nullable().optional(),
  establishedYear: z.number().int().min(1700).max(2100).nullable().optional(),
  pickupPincode: Pincode,
  pickupAddress: z.object({
    line1: z.string().trim().min(3).max(200),
    line2: z.string().trim().max(200).optional(),
    landmark: z.string().trim().max(120).optional(),
    contactName: z.string().trim().min(2).max(80),
    contactPhone: IndianMobile,
  }),
  fssaiLicenseNo: z.string().regex(FSSAI_RE, "FSSAI numbers are 14 digits"),
  fssaiValidUntil: LocalDateString,
  gstin: z.string().regex(GSTIN_RE, "Enter a valid 15-character GSTIN").nullable().optional(),
  orderCutoffLocal: LocalTime,
  prepLeadDays: z.number().int().min(0).max(3),
  prepStartLocal: LocalTime,
  readyForPickupLocal: LocalTime,
  dispatchWeekdays: z.number().int().min(1).max(127),
  dailyShipmentCap: z.number().int().min(1).max(10_000),
  commissionBps: z.number().int().min(0).max(10_000),
  payoutAccountRef: z.string().trim().max(64).nullable().optional(),
};

export const CreateKitchenRequestSchema = z
  .object({
    ...KitchenFields,
    cityId: z.uuid(),
    slug: Slug.optional(),
    owner: z.object({ name: z.string().trim().min(2).max(80), phone: IndianMobile }),
  })
  .meta({ id: "CreateKitchenRequest" });
export type CreateKitchenRequest = z.infer<typeof CreateKitchenRequestSchema>;

export const UpdateKitchenRequestSchema = z
  .object(KitchenFields)
  .partial()
  .meta({ id: "UpdateKitchenRequest" });
export type UpdateKitchenRequest = z.infer<typeof UpdateKitchenRequestSchema>;

export const AddKitchenMemberRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    phone: IndianMobile,
    role: z.enum(["VENDOR_OWNER", "VENDOR_STAFF"]),
  })
  .meta({ id: "AddKitchenMemberRequest" });
export type AddKitchenMemberRequest = z.infer<typeof AddKitchenMemberRequestSchema>;

export const ReadinessCheckSchema = z
  .object({
    key: z.enum(READINESS_KEYS),
    label: z.string(),
    ok: z.boolean(),
    blocking: z.boolean(),
    detail: z.string(),
  })
  .meta({ id: "ReadinessCheck" });

export const ItemAdminSummarySchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    category: z.string(),
    tempClass: TempClassSchema,
    shelfLifeHours: z.number().int(),
    status: z.enum(ITEM_STATUSES),
    variants: z.number().int(),
    fromPricePaise: Money.nullable(),
    artKey: z.string().nullable(),
  })
  .meta({ id: "ItemAdminSummary" });
export type ItemAdminSummary = z.infer<typeof ItemAdminSummarySchema>;

export const KitchenDetailSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    status: z.enum(KITCHEN_STATUSES),
    city: CityRef.extend({ id: z.string() }),
    ...KitchenFields,
    tagline: z.string().nullable(),
    story: z.string().nullable(),
    establishedYear: z.number().int().nullable(),
    gstin: z.string().nullable(),
    payoutAccountRef: z.string().nullable(),
    members: z.array(
      z.object({
        userId: z.string(),
        name: z.string().nullable(),
        phone: z.string().nullable(),
        role: z.enum(["VENDOR_OWNER", "VENDOR_STAFF"]),
      }),
    ),
    items: z.array(ItemAdminSummarySchema),
    readiness: z.array(ReadinessCheckSchema),
    readyToGoLive: z.boolean(),
    createdAt: Instant,
  })
  .meta({ id: "KitchenDetail" });
export type KitchenDetail = z.infer<typeof KitchenDetailSchema>;

// ─── Delicacies ───────────────────────────────────────────────────────────────────────────────

export const VariantInputSchema = z
  .object({
    /** Existing pack size to update; omit to add a new one. */
    id: z.string().optional(),
    label: z.string().trim().min(1).max(40),
    pricePaise: PositivePaise,
    mrpPaise: PositivePaise.nullable().optional(),
    netWeightG: z.number().int().min(1).max(20_000),
    packedWeightG: z.number().int().min(1).max(25_000),
    defaultDailyCap: z.number().int().min(0).max(5_000),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.packedWeightG >= v.netWeightG, {
    message: "Packed weight includes the pack, so it can't be less than the net weight",
    path: ["packedWeightG"],
  })
  .refine((v) => v.mrpPaise == null || v.mrpPaise >= v.pricePaise, {
    message: "MRP can't be below the selling price",
    path: ["mrpPaise"],
  })
  .meta({ id: "VariantInput" });
export type VariantInput = z.infer<typeof VariantInputSchema>;

export const ItemInputSchema = z
  .object({
    categoryId: z.uuid(),
    name: z.string().trim().min(2).max(80),
    slug: Slug.optional(),
    shortDescription: z.string().trim().min(10).max(160),
    description: z.string().trim().max(2000).nullable().optional(),
    originStory: z.string().trim().max(1000).nullable().optional(),
    diet: DietSchema,
    tempClass: TempClassSchema,
    shelfLifeHours: z
      .number()
      .int()
      .min(1)
      .max(24 * 365),
    minResidualHours: z.number().int().min(0),
    madeToOrder: z.boolean(),
    maxAgeAtDispatchHours: z.number().int().min(1).nullable().optional(),
    hsnCode: z.string().regex(HSN_RE, "HSN codes are 4, 6 or 8 digits"),
    gstRateBps: z
      .number()
      .int()
      .refine((v) => (GST_RATES_BPS as readonly number[]).includes(v), "Pick a GST slab"),
    ingredients: z.string().trim().min(3).max(1000),
    allergens: z.array(z.string().trim().min(2).max(40)).max(14),
    storage: z.string().trim().min(3).max(300),
    artKey: z.enum(ART_KEYS).nullable().optional(),
    isFeatured: z.boolean().optional(),
    variants: z.array(VariantInputSchema).min(1).max(6),
  })
  .superRefine((v, ctx) => {
    for (const message of validateFreshness({
      tempClass: v.tempClass,
      shelfLifeHours: v.shelfLifeHours,
      minResidualHours: v.minResidualHours,
      madeToOrder: v.madeToOrder,
      maxAgeAtDispatchHours: v.maxAgeAtDispatchHours ?? null,
    })) {
      const path = message.startsWith("Stock")
        ? "maxAgeAtDispatchHours"
        : message.startsWith("Shelf life")
          ? "shelfLifeHours"
          : "minResidualHours";
      ctx.addIssue({ code: "custom", message, path: [path] });
    }
  })
  .meta({ id: "ItemInput" });
export type ItemInput = z.infer<typeof ItemInputSchema>;

export const ItemAdminDetailSchema = z
  .object({
    id: z.string(),
    vendorId: z.string(),
    slug: z.string(),
    status: z.enum(ITEM_STATUSES),
    categoryId: z.string(),
    name: z.string(),
    shortDescription: z.string(),
    description: z.string().nullable(),
    originStory: z.string().nullable(),
    diet: DietSchema,
    tempClass: TempClassSchema,
    shelfLifeHours: z.number().int(),
    minResidualHours: z.number().int(),
    madeToOrder: z.boolean(),
    maxAgeAtDispatchHours: z.number().int().nullable(),
    hsnCode: z.string(),
    gstRateBps: z.number().int(),
    ingredients: z.string(),
    allergens: z.array(z.string()),
    storage: z.string(),
    artKey: z.enum(ART_KEYS).nullable(),
    isFeatured: z.boolean(),
    variants: z.array(
      z.object({
        id: z.string(),
        sku: z.string(),
        label: z.string(),
        pricePaise: Money,
        mrpPaise: Money.nullable(),
        netWeightG: z.number().int(),
        packedWeightG: z.number().int(),
        defaultDailyCap: z.number().int(),
        isActive: z.boolean(),
      }),
    ),
  })
  .meta({ id: "ItemAdminDetail" });
export type ItemAdminDetail = z.infer<typeof ItemAdminDetailSchema>;

export const SetItemStatusRequestSchema = z
  .object({ status: z.enum(ITEM_STATUSES) })
  .meta({ id: "SetItemStatusRequest" });
export type SetItemStatusRequest = z.infer<typeof SetItemStatusRequestSchema>;

/** A delicacy as drafted in the form: enough to ask where it could travel. */
export const ReachPreviewRequestSchema = z
  .object({
    tempClass: TempClassSchema,
    shelfLifeHours: z.number().int().min(1),
    minResidualHours: z.number().int().min(0),
    madeToOrder: z.boolean(),
    maxAgeAtDispatchHours: z.number().int().min(1).nullable().optional(),
    packedWeightG: z.number().int().min(1).max(25_000),
    pricePaise: PositivePaise,
    gstRateBps: z.number().int().min(0).max(2800),
  })
  .meta({ id: "ReachPreviewRequest" });
export type ReachPreviewRequest = z.infer<typeof ReachPreviewRequestSchema>;

export const ReachPreviewSchema = z
  .object({
    origin: CityRef,
    destinations: z.array(
      z.object({
        city: CityRef,
        ok: z.boolean(),
        mode: ShipModeSchema.nullable(),
        carrierCode: z.string().nullable(),
        packaging: z.string().nullable(),
        dispatchDate: LocalDateString.nullable(),
        deliveryDate: LocalDateString.nullable(),
        shippingPaise: Money.nullable(),
        reason: ReasonCodeSchema.nullable(),
        message: z.string().nullable(),
      }),
    ),
  })
  .meta({ id: "ReachPreview" });
export type ReachPreview = z.infer<typeof ReachPreviewSchema>;

// ─── Routes ───────────────────────────────────────────────────────────────────────────────────

const RouteFields = {
  originCityId: z.uuid(),
  destinationCityId: z.uuid(),
  carrierCode: z.string().trim().min(2).max(40),
  mode: ShipModeSchema,
  transitHoursP50: z.number().int().min(1).max(240),
  transitHoursP90: z.number().int().min(1).max(336),
  pickupCutoffLocal: LocalTime,
  deliversSunday: z.boolean(),
  acceptsDryIce: z.boolean(),
  rateZone: z.string().trim().min(1).max(20),
  isActive: z.boolean(),
};

/** One courier service from one city to every pincode of another. */
export const RouteInputSchema = z
  .object(RouteFields)
  .refine((r) => r.transitHoursP90 >= r.transitHoursP50, {
    message: "The slow-day (p90) time can't be faster than the typical (p50) time",
    path: ["transitHoursP90"],
  })
  .refine((r) => r.originCityId !== r.destinationCityId, {
    message: "We don't deliver within the same city",
    path: ["destinationCityId"],
  })
  .meta({ id: "RouteInput" });
export type RouteInput = z.infer<typeof RouteInputSchema>;

export const RouteSchema = z
  .object({
    ...RouteFields,
    origin: CityRef,
    destination: CityRef,
    /** Pincodes in the destination city covered by this route. */
    pincodes: z.number().int(),
    activePincodes: z.number().int(),
    destinationPincodes: z.number().int(),
    /** False when pincodes on the route carry different timings (e.g. a carrier feed). */
    uniform: z.boolean(),
    source: z.enum(["CARRIER_FEED", "MANUAL", "OBSERVED"]),
    refreshedAt: Instant,
  })
  .meta({ id: "Route" });
export type Route = z.infer<typeof RouteSchema>;

// ─── Cities ───────────────────────────────────────────────────────────────────────────────────

export const CreateCityRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    slug: Slug.optional(),
    stateCode: z.string().regex(STATE_CODE_RE, "Two-letter state code, e.g. RJ"),
    airportIata: z.string().regex(IATA_RE, "Three-letter airport code").nullable().optional(),
    tagline: z.string().trim().max(140).nullable().optional(),
    isOrigin: z.boolean(),
    isDestination: z.boolean(),
    /** Unassigned directory pincodes in these districts join the city. */
    districts: z.array(z.string().trim().min(2)).max(20).default([]),
    /** Extra pincodes or ranges, e.g. "302001-302039, 303007". */
    pincodeRanges: z.string().trim().max(2000).optional(),
  })
  .meta({ id: "CreateCityRequest" });
export type CreateCityRequest = z.infer<typeof CreateCityRequestSchema>;

export const DirectoryDistrictSchema = z
  .object({
    district: z.string(),
    stateCode: z.string(),
    pincodes: z.number().int(),
  })
  .meta({ id: "DirectoryDistrict" });
export type DirectoryDistrict = z.infer<typeof DirectoryDistrictSchema>;
