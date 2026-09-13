CREATE TABLE "insurer_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"insurer_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"content" "bytea" NOT NULL,
	"parse_status" text DEFAULT 'pending' NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "insurer_documents_insurer_filename_key" UNIQUE("insurer_id","filename")
);
--> statement-breakpoint
CREATE TABLE "insurers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "insurers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "insurer_documents" ADD CONSTRAINT "insurer_documents_insurer_id_insurers_id_fk" FOREIGN KEY ("insurer_id") REFERENCES "public"."insurers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "insurer_documents_insurer_id_idx" ON "insurer_documents" USING btree ("insurer_id");