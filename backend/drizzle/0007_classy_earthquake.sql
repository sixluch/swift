ALTER TABLE "conversations" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "effective_date" date;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "dependants" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_requests" ADD COLUMN "notices" jsonb;--> statement-breakpoint
ALTER TABLE "quote_requests" ADD COLUMN "profile" jsonb;--> statement-breakpoint
ALTER TABLE "conversations" DROP COLUMN "plan_type";--> statement-breakpoint
ALTER TABLE "conversations" DROP COLUMN "family_ages";
