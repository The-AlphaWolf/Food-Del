CREATE TYPE "public"."actor" AS ENUM('SYSTEM', 'CUSTOMER', 'VENDOR', 'OPS', 'CARRIER');--> statement-breakpoint
CREATE TYPE "public"."batch_status" AS ENUM('OPEN', 'LOCKED', 'IN_PRODUCTION', 'PACKED', 'HANDED_OVER', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."blackout_scope" AS ENUM('NATIONAL', 'CITY', 'VENDOR', 'CARRIER');--> statement-breakpoint
CREATE TYPE "public"."city_launch_status" AS ENUM('HIDDEN', 'COMING_SOON', 'LIVE', 'PAUSED');--> statement-breakpoint
CREATE TYPE "public"."claim_kind" AS ENUM('SPOILED', 'DAMAGED', 'MISSING_ITEMS', 'LATE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."claim_resolution" AS ENUM('REFUND', 'RESHIP', 'NONE');--> statement-breakpoint
CREATE TYPE "public"."claim_status" AS ENUM('OPEN', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."coolant" AS ENUM('NONE', 'GEL_PCM', 'DRY_ICE');--> statement-breakpoint
CREATE TYPE "public"."diet" AS ENUM('VEG', 'EGG', 'NON_VEG');--> statement-breakpoint
CREATE TYPE "public"."failure_reason" AS ENUM('VENDOR_UNFULFILLED', 'UNDELIVERABLE', 'SPOILED', 'LOST', 'DAMAGED');--> statement-breakpoint
CREATE TYPE "public"."fulfillment_mode" AS ENUM('VENDOR_PACKED', 'HUB_PACKED');--> statement-breakpoint
CREATE TYPE "public"."item_status" AS ENUM('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."lane_source" AS ENUM('CARRIER_FEED', 'MANUAL', 'OBSERVED');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('PENDING_PAYMENT', 'CONFIRMED', 'IN_FULFILLMENT', 'COMPLETED', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('PENDING', 'DONE', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('RAZORPAY', 'FAKE');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('CREATED', 'CAPTURED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('ON_HOLD', 'RELEASED', 'REVERSED');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('PENDING', 'PROCESSED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('CUSTOMER', 'VENDOR_OWNER', 'VENDOR_STAFF', 'OPS', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."ship_mode" AS ENUM('AIR_EXPRESS', 'SURFACE_EXPRESS');--> statement-breakpoint
CREATE TYPE "public"."shipment_status" AS ENUM('PENDING_PAYMENT', 'PLACED', 'BATCHED', 'PACKED_COLD_CHAIN', 'PICKED_UP', 'IN_TRANSIT_INTERCITY', 'AT_DESTINATION_HUB', 'OUT_FOR_LOCAL_DELIVERY', 'DELIVERY_ATTEMPT_FAILED', 'DELIVERED', 'CANCELLED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."temp_class" AS ENUM('AMBIENT', 'CHILLED', 'FROZEN');--> statement-breakpoint
CREATE TYPE "public"."vendor_status" AS ENUM('ONBOARDING', 'ACTIVE', 'PAUSED', 'OFFBOARDED');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "inventory_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"dispatch_date" date NOT NULL,
	"capacity" integer NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"sold" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "inventory_slots_variant_date" UNIQUE("variant_id","dispatch_date"),
	CONSTRAINT "inventory_slots_no_oversell" CHECK ("inventory_slots"."capacity" >= 0 and "inventory_slots"."reserved" >= 0 and "inventory_slots"."sold" >= 0 and "inventory_slots"."reserved" + "inventory_slots"."sold" <= "inventory_slots"."capacity")
);
--> statement-breakpoint
CREATE TABLE "item_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"label" text NOT NULL,
	"price_paise" integer NOT NULL,
	"mrp_paise" integer,
	"net_weight_g" integer NOT NULL,
	"packed_weight_g" integer NOT NULL,
	"default_daily_cap" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "item_variants_sku_unique" UNIQUE("sku"),
	CONSTRAINT "variants_price" CHECK ("item_variants"."price_paise" > 0),
	CONSTRAINT "variants_mrp" CHECK ("item_variants"."mrp_paise" is null or "item_variants"."mrp_paise" >= "item_variants"."price_paise"),
	CONSTRAINT "variants_weights" CHECK ("item_variants"."net_weight_g" > 0 and "item_variants"."packed_weight_g" >= "item_variants"."net_weight_g"),
	CONSTRAINT "variants_cap" CHECK ("item_variants"."default_daily_cap" >= 0)
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"short_description" text NOT NULL,
	"description" text,
	"origin_story" text,
	"diet" "diet" NOT NULL,
	"temp_class" "temp_class" NOT NULL,
	"shelf_life_hours" integer NOT NULL,
	"min_residual_hours" integer NOT NULL,
	"made_to_order" boolean DEFAULT true NOT NULL,
	"max_age_at_dispatch_hours" integer,
	"hsn_code" varchar(8) NOT NULL,
	"gst_rate_bps" integer NOT NULL,
	"legal" jsonb NOT NULL,
	"image_url" text,
	"art_key" text,
	"is_featured" boolean DEFAULT false NOT NULL,
	"status" "item_status" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_slug_unique" UNIQUE("slug"),
	CONSTRAINT "items_shelf_life" CHECK ("items"."shelf_life_hours" > 0),
	CONSTRAINT "items_residual" CHECK ("items"."min_residual_hours" >= 0 and "items"."min_residual_hours" < "items"."shelf_life_hours"),
	CONSTRAINT "items_stock_age" CHECK ("items"."made_to_order" or "items"."max_age_at_dispatch_hours" is not null),
	CONSTRAINT "items_gst" CHECK ("items"."gst_rate_bps" between 0 and 2800)
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"tagline" text,
	"story" text,
	"established_year" smallint,
	"pickup_pincode" char(6) NOT NULL,
	"pickup_address" jsonb NOT NULL,
	"fssai_license_no" char(14) NOT NULL,
	"fssai_valid_until" date NOT NULL,
	"gstin" char(15),
	"fulfillment_mode" "fulfillment_mode" DEFAULT 'VENDOR_PACKED' NOT NULL,
	"order_cutoff_local" time DEFAULT '18:00' NOT NULL,
	"prep_lead_days" smallint DEFAULT 1 NOT NULL,
	"prep_start_local" time DEFAULT '06:00' NOT NULL,
	"ready_for_pickup_local" time DEFAULT '12:00' NOT NULL,
	"dispatch_weekdays" smallint DEFAULT 63 NOT NULL,
	"daily_shipment_cap" integer NOT NULL,
	"commission_bps" integer DEFAULT 2000 NOT NULL,
	"payout_account_ref" text,
	"status" "vendor_status" DEFAULT 'ONBOARDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendors_slug_unique" UNIQUE("slug"),
	CONSTRAINT "vendors_fssai_format" CHECK ("vendors"."fssai_license_no" ~ '^[0-9]{14}$'),
	CONSTRAINT "vendors_weekdays" CHECK ("vendors"."dispatch_weekdays" between 0 and 127),
	CONSTRAINT "vendors_cap" CHECK ("vendors"."daily_shipment_cap" >= 0),
	CONSTRAINT "vendors_commission" CHECK ("vendors"."commission_bps" between 0 and 10000)
);
--> statement-breakpoint
CREATE TABLE "cities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"state_code" char(2) NOT NULL,
	"airport_iata" char(3),
	"is_origin" boolean DEFAULT false NOT NULL,
	"is_destination" boolean DEFAULT false NOT NULL,
	"launch_status" "city_launch_status" DEFAULT 'HIDDEN' NOT NULL,
	"tagline" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cities_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "pincodes" (
	"pincode" char(6) PRIMARY KEY NOT NULL,
	"city_id" uuid,
	"area_name" text,
	"district" text NOT NULL,
	"state_code" char(2) NOT NULL,
	"is_oda" boolean DEFAULT false NOT NULL,
	CONSTRAINT "pincodes_format" CHECK ("pincodes"."pincode" ~ '^[1-9][0-9]{5}$')
);
--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text,
	"recipient_name" text NOT NULL,
	"phone" varchar(13) NOT NULL,
	"line1" text NOT NULL,
	"line2" text,
	"landmark" text,
	"pincode" char(6) NOT NULL,
	"city_name" text NOT NULL,
	"state_code" char(2) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	"vendor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" varchar(13),
	"email" text,
	"full_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "calendar_blackouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "blackout_scope" NOT NULL,
	"scope_ref" text DEFAULT '' NOT NULL,
	"date" date NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "blackouts_unique" UNIQUE("scope","scope_ref","date"),
	CONSTRAINT "blackouts_scope_ref" CHECK (("calendar_blackouts"."scope" = 'NATIONAL') = ("calendar_blackouts"."scope_ref" = ''))
);
--> statement-breakpoint
CREATE TABLE "dispatch_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"dispatch_date" date NOT NULL,
	"carrier_code" text NOT NULL,
	"status" "batch_status" DEFAULT 'LOCKED' NOT NULL,
	"locked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pickup_ref" text,
	"handed_over_at" timestamp with time zone,
	CONSTRAINT "batches_unique" UNIQUE("vendor_id","dispatch_date","carrier_code")
);
--> statement-breakpoint
CREATE TABLE "packaging_profiles" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"temp_class" "temp_class" NOT NULL,
	"coolant" "coolant" NOT NULL,
	"max_hold_hours" smallint NOT NULL,
	"is_dangerous_goods" boolean DEFAULT false NOT NULL,
	"outer_length_mm" integer NOT NULL,
	"outer_breadth_mm" integer NOT NULL,
	"outer_height_mm" integer NOT NULL,
	"tare_weight_g" integer NOT NULL,
	"max_payload_g" integer NOT NULL,
	"cost_paise" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "packaging_dry_ice_is_dg" CHECK ("packaging_profiles"."coolant" <> 'DRY_ICE' or "packaging_profiles"."is_dangerous_goods"),
	CONSTRAINT "packaging_positive" CHECK ("packaging_profiles"."max_hold_hours" > 0 and "packaging_profiles"."max_payload_g" > 0)
);
--> statement-breakpoint
CREATE TABLE "rate_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"carrier_code" text NOT NULL,
	"mode" "ship_mode" NOT NULL,
	"zone" text NOT NULL,
	"volumetric_divisor" integer NOT NULL,
	"first_slab_g" integer NOT NULL,
	"first_slab_paise" integer NOT NULL,
	"addl_slab_g" integer NOT NULL,
	"addl_slab_paise" integer NOT NULL,
	"fuel_surcharge_bps" integer DEFAULT 0 NOT NULL,
	"oda_surcharge_paise" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_cards_service_zone" UNIQUE("carrier_code","mode","zone"),
	CONSTRAINT "rate_cards_slabs" CHECK ("rate_cards"."first_slab_g" > 0 and "rate_cards"."addl_slab_g" > 0)
);
--> statement-breakpoint
CREATE TABLE "serviceability_matrix" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "serviceability_matrix_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"origin_city_id" uuid NOT NULL,
	"dest_pincode" char(6) NOT NULL,
	"carrier_code" text NOT NULL,
	"mode" "ship_mode" NOT NULL,
	"transit_hours_p50" smallint NOT NULL,
	"transit_hours_p90" smallint NOT NULL,
	"pickup_cutoff_local" time NOT NULL,
	"delivers_sunday" boolean DEFAULT false NOT NULL,
	"accepts_dry_ice" boolean DEFAULT false NOT NULL,
	"rate_zone" text NOT NULL,
	"source" "lane_source" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "serviceability_lane" UNIQUE("origin_city_id","dest_pincode","carrier_code","mode"),
	CONSTRAINT "serviceability_transit" CHECK ("serviceability_matrix"."transit_hours_p50" > 0 and "serviceability_matrix"."transit_hours_p90" >= "serviceability_matrix"."transit_hours_p50")
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"kind" "claim_kind" NOT NULL,
	"description" text NOT NULL,
	"photo_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "claim_status" DEFAULT 'OPEN' NOT NULL,
	"resolution" "claim_resolution",
	"refund_paise" integer DEFAULT 0 NOT NULL,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "inventory_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"converted_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	CONSTRAINT "holds_qty" CHECK ("inventory_holds"."quantity" > 0),
	CONSTRAINT "holds_single_outcome" CHECK ("inventory_holds"."converted_at" is null or "inventory_holds"."released_at" is null)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"channel" varchar(16) NOT NULL,
	"recipient" text NOT NULL,
	"template" text NOT NULL,
	"body" text NOT NULL,
	"provider_ref" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"inventory_slot_id" uuid NOT NULL,
	"quantity" smallint NOT NULL,
	"unit_price_paise" integer NOT NULL,
	"gst_rate_bps" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "order_items_qty" CHECK ("order_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"dest_pincode" char(6) NOT NULL,
	"ship_to" jsonb NOT NULL,
	"is_gift" boolean DEFAULT false NOT NULL,
	"gift_message" text,
	"sender_name" text,
	"hide_prices" boolean DEFAULT false NOT NULL,
	"items_total_paise" integer NOT NULL,
	"packaging_fee_paise" integer NOT NULL,
	"shipping_fee_paise" integer NOT NULL,
	"discount_paise" integer DEFAULT 0 NOT NULL,
	"gst_included_paise" integer DEFAULT 0 NOT NULL,
	"grand_total_paise" integer NOT NULL,
	"idempotency_key" text,
	"hold_expires_at" timestamp with time zone,
	"placed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number"),
	CONSTRAINT "orders_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "orders_total" CHECK ("orders"."grand_total_paise" = "orders"."items_total_paise" + "orders"."packaging_fee_paise" + "orders"."shipping_fee_paise" - "orders"."discount_paise"),
	CONSTRAINT "orders_amounts" CHECK ("orders"."items_total_paise" > 0 and "orders"."discount_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "outbox_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"topic" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"provider_order_id" text NOT NULL,
	"provider_payment_id" text,
	"amount_paise" integer NOT NULL,
	"refunded_paise" integer DEFAULT 0 NOT NULL,
	"status" "payment_status" DEFAULT 'CREATED' NOT NULL,
	"method" text,
	"captured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_provider_order_id_unique" UNIQUE("provider_order_id"),
	CONSTRAINT "payments_provider_payment_id_unique" UNIQUE("provider_payment_id"),
	CONSTRAINT "payments_refund_bound" CHECK ("payments"."refunded_paise" between 0 and "payments"."amount_paise")
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"shipment_id" uuid,
	"amount_paise" integer NOT NULL,
	"reason" text NOT NULL,
	"provider_refund_id" text,
	"status" "refund_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "refunds_provider_refund_id_unique" UNIQUE("provider_refund_id"),
	CONSTRAINT "refunds_amount" CHECK ("refunds"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "shipment_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "shipment_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"shipment_id" uuid NOT NULL,
	"from_status" "shipment_status",
	"to_status" "shipment_status" NOT NULL,
	"actor" "actor" NOT NULL,
	"actor_id" uuid,
	"external_event_id" text,
	"note" text,
	"carrier_payload" jsonb,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"sequence" smallint NOT NULL,
	"vendor_id" uuid NOT NULL,
	"batch_id" uuid,
	"status" "shipment_status" DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"dispatch_date" date NOT NULL,
	"order_cutoff_at" timestamp with time zone NOT NULL,
	"promised_delivery_date" date NOT NULL,
	"usually_arrives_on" date NOT NULL,
	"packaging_code" text NOT NULL,
	"carrier_code" text NOT NULL,
	"mode" "ship_mode" NOT NULL,
	"awb_number" text,
	"carrier_shipment_ref" text,
	"label_url" text,
	"tracking_url" text,
	"dead_weight_g" integer NOT NULL,
	"chargeable_weight_g" integer NOT NULL,
	"eta_p50_at" timestamp with time zone NOT NULL,
	"eta_p90_at" timestamp with time zone NOT NULL,
	"deliver_by_at" timestamp with time zone NOT NULL,
	"latest_eta_at" timestamp with time zone,
	"is_at_risk" boolean DEFAULT false NOT NULL,
	"prepared_at" timestamp with time zone,
	"packed_at" timestamp with time zone,
	"picked_up_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"failure_reason" "failure_reason",
	"items_total_paise" integer NOT NULL,
	"shipping_cost_paise" integer NOT NULL,
	"shipping_fee_paise" integer NOT NULL,
	"packaging_fee_paise" integer NOT NULL,
	"discount_paise" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipments_awb_number_unique" UNIQUE("awb_number"),
	CONSTRAINT "shipments_failure_reason" CHECK (("shipments"."status" = 'FAILED') = ("shipments"."failure_reason" is not null)),
	CONSTRAINT "shipments_promise" CHECK ("shipments"."eta_p90_at" <= "shipments"."deliver_by_at" or "shipments"."packed_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "vendor_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"gross_paise" integer NOT NULL,
	"commission_paise" integer NOT NULL,
	"net_paise" integer NOT NULL,
	"status" "payout_status" DEFAULT 'ON_HOLD' NOT NULL,
	"release_after" timestamp with time zone NOT NULL,
	"provider_transfer_id" text,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_payouts_shipment_id_unique" UNIQUE("shipment_id"),
	CONSTRAINT "payouts_math" CHECK ("vendor_payouts"."net_paise" = "vendor_payouts"."gross_paise" - "vendor_payouts"."commission_paise")
);
--> statement-breakpoint
ALTER TABLE "inventory_slots" ADD CONSTRAINT "inventory_slots_variant_id_item_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."item_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_variants" ADD CONSTRAINT "item_variants_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_pickup_pincode_pincodes_pincode_fk" FOREIGN KEY ("pickup_pincode") REFERENCES "public"."pincodes"("pincode") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pincodes" ADD CONSTRAINT "pincodes_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_pincode_pincodes_pincode_fk" FOREIGN KEY ("pincode") REFERENCES "public"."pincodes"("pincode") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_batches" ADD CONSTRAINT "dispatch_batches_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serviceability_matrix" ADD CONSTRAINT "serviceability_matrix_origin_city_id_cities_id_fk" FOREIGN KEY ("origin_city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serviceability_matrix" ADD CONSTRAINT "serviceability_matrix_dest_pincode_pincodes_pincode_fk" FOREIGN KEY ("dest_pincode") REFERENCES "public"."pincodes"("pincode") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_customer_id_profiles_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_holds" ADD CONSTRAINT "inventory_holds_slot_id_inventory_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."inventory_slots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_holds" ADD CONSTRAINT "inventory_holds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_item_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."item_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_inventory_slot_id_inventory_slots_id_fk" FOREIGN KEY ("inventory_slot_id") REFERENCES "public"."inventory_slots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_profiles_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_dest_pincode_pincodes_pincode_fk" FOREIGN KEY ("dest_pincode") REFERENCES "public"."pincodes"("pincode") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_batch_id_dispatch_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."dispatch_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_packaging_code_packaging_profiles_code_fk" FOREIGN KEY ("packaging_code") REFERENCES "public"."packaging_profiles"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payouts" ADD CONSTRAINT "vendor_payouts_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payouts" ADD CONSTRAINT "vendor_payouts_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_slots_date_idx" ON "inventory_slots" USING btree ("dispatch_date");--> statement-breakpoint
CREATE INDEX "variants_item_idx" ON "item_variants" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "items_vendor_idx" ON "items" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "items_category_idx" ON "items" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "vendors_city_idx" ON "vendors" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "pincodes_city_idx" ON "pincodes" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "addresses_user_idx" ON "addresses" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_unique" ON "memberships" USING btree ("user_id","role",coalesce("vendor_id", '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
CREATE INDEX "memberships_vendor_idx" ON "memberships" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "blackouts_date_idx" ON "calendar_blackouts" USING btree ("date");--> statement-breakpoint
CREATE INDEX "serviceability_lookup" ON "serviceability_matrix" USING btree ("dest_pincode","origin_city_id") WHERE "serviceability_matrix"."is_active";--> statement-breakpoint
CREATE INDEX "claims_status_idx" ON "claims" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "holds_order_idx" ON "inventory_holds" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "holds_open_idx" ON "inventory_holds" USING btree ("expires_at") WHERE "inventory_holds"."converted_at" is null and "inventory_holds"."released_at" is null;--> statement-breakpoint
CREATE INDEX "notifications_order_idx" ON "notifications" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_shipment_idx" ON "order_items" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_pending_idx" ON "orders" USING btree ("hold_expires_at") WHERE "orders"."status" = 'PENDING_PAYMENT';--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox" USING btree ("available_at") WHERE "outbox"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "shipment_events_shipment_idx" ON "shipment_events" USING btree ("shipment_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_events_external" ON "shipment_events" USING btree ("shipment_id","external_event_id") WHERE "shipment_events"."external_event_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_order_seq" ON "shipments" USING btree ("order_id","sequence");--> statement-breakpoint
CREATE INDEX "shipments_vendor_day_idx" ON "shipments" USING btree ("vendor_id","dispatch_date","status");--> statement-breakpoint
CREATE INDEX "shipments_cutoff_idx" ON "shipments" USING btree ("order_cutoff_at") WHERE "shipments"."status" = 'PLACED';--> statement-breakpoint
CREATE INDEX "shipments_open_idx" ON "shipments" USING btree ("status") WHERE "shipments"."status" not in ('DELIVERED', 'CANCELLED', 'FAILED');--> statement-breakpoint
CREATE INDEX "payouts_release_idx" ON "vendor_payouts" USING btree ("release_after") WHERE "vendor_payouts"."status" = 'ON_HOLD';