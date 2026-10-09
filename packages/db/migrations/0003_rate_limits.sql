CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
-- Internal only: no policies, so only the service role can touch it.
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;
