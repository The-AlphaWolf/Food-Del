import { z } from "zod";
import { CITY_LAUNCH_STATUSES } from "../geo";
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

export const CitySchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    stateCode: z.string(),
    isOrigin: z.boolean(),
    isDestination: z.boolean(),
    launchStatus: z.enum(CITY_LAUNCH_STATUSES),
    tagline: z.string().nullable(),
    itemCount: z.number().int(),
  })
  .meta({ id: "City" });
export type City = z.infer<typeof CitySchema>;

export const CategorySchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
  })
  .meta({ id: "Category" });
export type Category = z.infer<typeof CategorySchema>;

export const VendorSummarySchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    tagline: z.string().nullable(),
    establishedYear: z.number().int().nullable(),
    city: CityRef,
  })
  .meta({ id: "VendorSummary" });
export type VendorSummary = z.infer<typeof VendorSummarySchema>;

export const VariantSchema = z
  .object({
    id: z.string(),
    sku: z.string(),
    label: z.string(),
    pricePaise: Money,
    mrpPaise: Money.nullable(),
    netWeightG: z.number().int(),
  })
  .meta({ id: "Variant" });
export type Variant = z.infer<typeof VariantSchema>;

/** Earliest delivery of the cheapest variant to the shopper's pincode, for listing cards. */
export const DeliverySummarySchema = z
  .discriminatedUnion("available", [
    z.object({
      available: z.literal(true),
      promisedDeliveryDate: LocalDateString,
      mode: ShipModeSchema,
      orderBy: Instant,
      deliveryFeePaise: Money,
    }),
    z.object({
      available: z.literal(false),
      reason: ReasonCodeSchema,
      message: z.string(),
    }),
  ])
  .meta({ id: "DeliverySummary" });
export type DeliverySummary = z.infer<typeof DeliverySummarySchema>;

export const ItemCardSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    shortDescription: z.string(),
    diet: DietSchema,
    tempClass: TempClassSchema,
    shelfLifeHours: z.number().int(),
    freshnessLabel: z.string(),
    imageUrl: z.string().nullable(),
    artKey: z.string().nullable(),
    isFeatured: z.boolean(),
    category: z.object({ slug: z.string(), name: z.string() }),
    vendor: VendorSummarySchema,
    fromPricePaise: Money,
    variants: z.array(VariantSchema),
    delivery: DeliverySummarySchema.nullable(),
  })
  .meta({ id: "ItemCard" });
export type ItemCard = z.infer<typeof ItemCardSchema>;

export const ItemDetailSchema = ItemCardSchema.extend({
  description: z.string().nullable(),
  originStory: z.string().nullable(),
  freshness: z.object({
    tempClass: TempClassSchema,
    shelfLifeHours: z.number().int(),
    minResidualHours: z.number().int(),
    madeToOrder: z.boolean(),
  }),
  legal: z.object({
    manufacturer: z.string(),
    ingredients: z.string(),
    allergens: z.array(z.string()),
    storage: z.string(),
    countryOfOrigin: z.string(),
    fssaiLicenseNo: z.string(),
  }),
  gstRateBps: z.number().int(),
  vendorStory: z.string().nullable(),
}).meta({ id: "ItemDetail" });
export type ItemDetail = z.infer<typeof ItemDetailSchema>;

export const ItemListQuerySchema = z.object({
  origin: z.string().optional(),
  category: z.string().optional(),
  vendor: z.string().optional(),
  q: z.string().max(80).optional(),
  featured: z.enum(["true", "false"]).optional(),
  pincode: Pincode.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type ItemListQuery = z.infer<typeof ItemListQuerySchema>;

export const VendorDetailSchema = VendorSummarySchema.extend({
  story: z.string().nullable(),
  items: z.array(ItemCardSchema),
}).meta({ id: "VendorDetail" });
export type VendorDetail = z.infer<typeof VendorDetailSchema>;
