ALTER TABLE "vendor_payouts" ADD COLUMN "held_reason" text;--> statement-breakpoint
ALTER TABLE "vendor_payouts" ADD COLUMN "held_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vendor_payouts" ADD COLUMN "reversed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vendor_payouts" ADD COLUMN "provider_reversal_id" text;--> statement-breakpoint
CREATE INDEX "payouts_vendor_idx" ON "vendor_payouts" USING btree ("vendor_id","created_at");--> statement-breakpoint
ALTER TABLE "vendor_payouts" ADD CONSTRAINT "payouts_hold_reason" CHECK (("vendor_payouts"."held_reason" is null) = ("vendor_payouts"."held_at" is null));