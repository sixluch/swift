CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"insurer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_insurer_name_key" UNIQUE("insurer_id","name")
);
--> statement-breakpoint
CREATE TABLE "rate_area_countries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rate_area_id" uuid NOT NULL,
	"printed_name" text NOT NULL,
	"country_iso" text,
	CONSTRAINT "rate_area_countries_area_name_key" UNIQUE("rate_area_id","printed_name")
);
--> statement-breakpoint
CREATE TABLE "rate_area_restrictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rate_area_id" uuid NOT NULL,
	"region" text NOT NULL,
	"discount_percent" numeric(6, 2) NOT NULL,
	"available" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rate_card_id" uuid NOT NULL,
	"area_code" text NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "rate_areas_card_code_key" UNIQUE("rate_card_id","area_code")
);
--> statement-breakpoint
CREATE TABLE "rate_benefits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rate_card_id" uuid NOT NULL,
	"label" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"unit" text NOT NULL,
	"excluded_plans" text[] DEFAULT '{}'::text[] NOT NULL,
	"only_plans" text[] DEFAULT '{}'::text[] NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"document_id" uuid,
	"currency" text DEFAULT 'USD' NOT NULL,
	"premium_basis" text DEFAULT 'annual' NOT NULL,
	"source_filename" text,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"parsed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_cards_document_key" UNIQUE("document_id")
);
--> statement-breakpoint
CREATE TABLE "rate_deductibles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rate_card_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"reduction_percent" numeric(6, 2) NOT NULL,
	"excluded_plans" text[] DEFAULT '{}'::text[] NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rate_card_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "rate_plans_card_code_key" UNIQUE("rate_card_id","code")
);
--> statement-breakpoint
CREATE TABLE "rate_premiums" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rate_card_id" uuid NOT NULL,
	"rate_area_id" uuid NOT NULL,
	"rate_plan_id" uuid NOT NULL,
	"age_min" integer NOT NULL,
	"age_max" integer NOT NULL,
	"premium" integer NOT NULL,
	CONSTRAINT "rate_premiums_area_plan_age_key" UNIQUE("rate_area_id","rate_plan_id","age_min")
);
--> statement-breakpoint
CREATE TABLE "rate_surcharges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rate_card_id" uuid NOT NULL,
	"label" text NOT NULL,
	"percent" numeric(6, 2) NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_insurer_id_insurers_id_fk" FOREIGN KEY ("insurer_id") REFERENCES "public"."insurers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_area_countries" ADD CONSTRAINT "rate_area_countries_rate_area_id_rate_areas_id_fk" FOREIGN KEY ("rate_area_id") REFERENCES "public"."rate_areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_area_restrictions" ADD CONSTRAINT "rate_area_restrictions_rate_area_id_rate_areas_id_fk" FOREIGN KEY ("rate_area_id") REFERENCES "public"."rate_areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_areas" ADD CONSTRAINT "rate_areas_rate_card_id_rate_cards_id_fk" FOREIGN KEY ("rate_card_id") REFERENCES "public"."rate_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_benefits" ADD CONSTRAINT "rate_benefits_rate_card_id_rate_cards_id_fk" FOREIGN KEY ("rate_card_id") REFERENCES "public"."rate_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_document_id_insurer_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."insurer_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_deductibles" ADD CONSTRAINT "rate_deductibles_rate_card_id_rate_cards_id_fk" FOREIGN KEY ("rate_card_id") REFERENCES "public"."rate_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_rate_card_id_rate_cards_id_fk" FOREIGN KEY ("rate_card_id") REFERENCES "public"."rate_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_premiums" ADD CONSTRAINT "rate_premiums_rate_card_id_rate_cards_id_fk" FOREIGN KEY ("rate_card_id") REFERENCES "public"."rate_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_premiums" ADD CONSTRAINT "rate_premiums_rate_area_id_rate_areas_id_fk" FOREIGN KEY ("rate_area_id") REFERENCES "public"."rate_areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_premiums" ADD CONSTRAINT "rate_premiums_rate_plan_id_rate_plans_id_fk" FOREIGN KEY ("rate_plan_id") REFERENCES "public"."rate_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_surcharges" ADD CONSTRAINT "rate_surcharges_rate_card_id_rate_cards_id_fk" FOREIGN KEY ("rate_card_id") REFERENCES "public"."rate_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rate_area_countries_iso_idx" ON "rate_area_countries" USING btree ("country_iso");--> statement-breakpoint
CREATE INDEX "rate_premiums_lookup_idx" ON "rate_premiums" USING btree ("rate_card_id","rate_area_id","age_min");