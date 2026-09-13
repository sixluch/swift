import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/** Postgres `bytea`. Drizzle has no built-in column type for it. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // The admin report sorts and filters on this column on every request.
  (t) => [index("leads_created_at_idx").on(t.createdAt)],
);

/** Shape of a `conversations.dependants` entry. Mirrors `Dependant` in lib/profile.ts. */
export interface Dependant {
  relation: "spouse" | "child";
  age: number;
  gender: "male" | "female";
}

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  coverageType: text("coverage_type")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  // The quote form writes its answers here — one profile per conversation,
  // overwritten on every COMPARE, which is also what the admin report reads.
  // Each submission is additionally snapshotted on quote_requests.
  fullName: text("full_name"),
  country: text("country"), // ISO 3166-1 alpha-2, country of expatriation / residence
  nationality: text("nationality"), // ISO 3166-1 alpha-2
  age: integer("age"),
  gender: text("gender"), // 'male' | 'female' — stored for the CRM, not a pricing input
  effectiveDate: date("effective_date"), // requested policy start date
  // Spouse / children on the same policy: [{ relation, age, gender }]. Each is
  // priced at its own age band; an empty array is an individual policy.
  dependants: jsonb("dependants").$type<Dependant[]>().notNull().default(sql`'[]'::jsonb`),
  coverageTier: text("coverage_tier"), // 'inpatient' | 'inpatient_outpatient' | 'dental' | 'maternity'
  deliveryChannel: text("delivery_channel"), // 'email' | 'whatsapp'
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // 'user' | 'assistant' | 'system'
  content: text("content").notNull(),
  inputMode: text("input_mode"), // 'typed' | 'voice'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quoteRequests = pgTable("quote_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  name: text("name"),
  age: integer("age"),
  coverageType: text("coverage_type")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  quotesReturned: jsonb("quotes_returned"),
  // Insurer-level messages that came back with the quotes ("not available in
  // your country"), kept so the support chat can explain them.
  notices: jsonb("notices").$type<string[]>(),
  // The whole form as submitted, so the snapshot stays readable after the
  // conversation's profile is overwritten by a later COMPARE.
  profile: jsonb("profile"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Admin console credentials. The product ships with a single operator account,
 * created by `npm run admin:create` — there is no default password in the repo
 * and no self-signup route.
 */
export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(), // scrypt:<salt hex>:<derived hex>
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

/**
 * Opaque server-side sessions rather than JWTs, so signing out and revoking
 * access actually take effect. Only the SHA-256 of the token is stored — a
 * database dump is therefore not a set of usable cookies.
 */
export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminUserId: uuid("admin_user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("admin_sessions_expires_at_idx").on(t.expiresAt)],
);

/**
 * A real insurance company, created by an admin. Rate cards hang off products
 * that hang off this (products arrive with the rate-card parser).
 */
export const insurers = pgTable("insurers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  /**
   * Free text the admin writes about the company and what it covers. Injected
   * into the chat's system prompt whenever this insurer is among the visitor's
   * quotes — see `lib/knowledge.ts`. Empty string, not null: "no knowledge
   * base" and "an empty one" mean the same thing to the prompt.
   */
  knowledgeBase: text("knowledge_base").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Admin-editable settings that are not tied to any row elsewhere — today just
 * the general knowledge base the chat always receives. Key/value so a second
 * setting is a new row, not a migration.
 */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The original rate-card PDF, kept for audit — a parsed number no one can trace
 * back to a source document is not worth quoting from.
 *
 * Stored as `bytea` rather than on disk: these files are a few hundred KB, and
 * the deployment target is Vercel, where local disk does not survive a request.
 * Re-uploading the same filename for an insurer replaces the row (unique index
 * below) rather than accumulating copies.
 */
export const insurerDocuments = pgTable(
  "insurer_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    insurerId: uuid("insurer_id")
      .notNull()
      .references(() => insurers.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    content: bytea("content").notNull(),
    // 'pending' until the rate-card parser runs; 'parsed' | 'failed' after.
    parseStatus: text("parse_status").notNull().default("pending"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("insurer_documents_insurer_filename_key").on(t.insurerId, t.filename),
    index("insurer_documents_insurer_id_idx").on(t.insurerId),
  ],
);

export type Lead = typeof leads.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
export type Insurer = typeof insurers.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
export type InsurerDocument = typeof insurerDocuments.$inferSelect;

/** An insurer's product, e.g. VUMI "Global Flex VIP". One product, many rate cards over time. */
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    insurerId: uuid("insurer_id")
      .notNull()
      .references(() => insurers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("products_insurer_name_key").on(t.insurerId, t.name)],
);

/**
 * One parsed rate card. Tied to the document it came from, so every stored
 * premium is traceable to a PDF and a SHA-256. Re-parsing a document replaces
 * its rate card rather than adding a second one.
 */
export const rateCards = pgTable(
  "rate_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").references(() => insurerDocuments.id, {
      onDelete: "set null",
    }),
    currency: text("currency").notNull().default("USD"),
    // VUMI prints annual premiums; the client chose to keep them as printed.
    premiumBasis: text("premium_basis").notNull().default("annual"),
    sourceFilename: text("source_filename"),
    /** Anything the parser could not account for, shown to the admin. */
    warnings: jsonb("warnings").notNull().default(sql`'[]'::jsonb`),
    parsedAt: timestamp("parsed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("rate_cards_document_key").on(t.documentId)],
);

/** The 5 plan tiers: Total > Ultra > Superior > Standard > Basic. */
export const ratePlans = pgTable(
  "rate_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rateCardId: uuid("rate_card_id")
      .notNull()
      .references(() => rateCards.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (t) => [unique("rate_plans_card_code_key").on(t.rateCardId, t.code)],
);

/** A geographic area, which is what the premium actually varies by. */
export const rateAreas = pgTable(
  "rate_areas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rateCardId: uuid("rate_card_id")
      .notNull()
      .references(() => rateCards.id, { onDelete: "cascade" }),
    areaCode: text("area_code").notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (t) => [unique("rate_areas_card_code_key").on(t.rateCardId, t.areaCode)],
);

/**
 * Which countries fall in an area. `countryIso` is null when the printed name
 * could not be resolved — recorded rather than dropped, so a missing price is
 * visible instead of silent.
 */
export const rateAreaCountries = pgTable(
  "rate_area_countries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rateAreaId: uuid("rate_area_id")
      .notNull()
      .references(() => rateAreas.id, { onDelete: "cascade" }),
    printedName: text("printed_name").notNull(),
    countryIso: text("country_iso"),
  },
  (t) => [
    unique("rate_area_countries_area_name_key").on(t.rateAreaId, t.printedName),
    index("rate_area_countries_iso_idx").on(t.countryIso),
  ],
);

/** "DISCOUNT FOR COVERAGE RESTRICTION" — varies by area, unlike the other tables. */
export const rateAreaRestrictions = pgTable("rate_area_restrictions", {
  id: uuid("id").primaryKey().defaultRandom(),
  rateAreaId: uuid("rate_area_id")
    .notNull()
    .references(() => rateAreas.id, { onDelete: "cascade" }),
  region: text("region").notNull(),
  discountPercent: numeric("discount_percent", { precision: 6, scale: 2 }).notNull(),
  available: boolean("available").notNull().default(true),
});

/** One premium: area x age band x plan. Whole units of the card's currency, as printed. */
export const ratePremiums = pgTable(
  "rate_premiums",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rateCardId: uuid("rate_card_id")
      .notNull()
      .references(() => rateCards.id, { onDelete: "cascade" }),
    rateAreaId: uuid("rate_area_id")
      .notNull()
      .references(() => rateAreas.id, { onDelete: "cascade" }),
    ratePlanId: uuid("rate_plan_id")
      .notNull()
      .references(() => ratePlans.id, { onDelete: "cascade" }),
    ageMin: integer("age_min").notNull(),
    ageMax: integer("age_max").notNull(),
    premium: integer("premium").notNull(),
  },
  (t) => [
    unique("rate_premiums_area_plan_age_key").on(t.rateAreaId, t.ratePlanId, t.ageMin),
    index("rate_premiums_lookup_idx").on(t.rateCardId, t.rateAreaId, t.ageMin),
  ],
);

/**
 * Optional benefits the admin can switch on or off for this card. `available`
 * is the admin's toggle; the parsed rows themselves are never deleted, so
 * turning something back on doesn't need a re-parse.
 */
export const rateBenefits = pgTable("rate_benefits", {
  id: uuid("id").primaryKey().defaultRandom(),
  rateCardId: uuid("rate_card_id")
    .notNull()
    .references(() => rateCards.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  unit: text("unit").notNull(), // 'currency' | 'percent'
  excludedPlans: text("excluded_plans").array().notNull().default(sql`'{}'::text[]`),
  onlyPlans: text("only_plans").array().notNull().default(sql`'{}'::text[]`),
  available: boolean("available").notNull().default(true),
  sortOrder: integer("sort_order").notNull(),
});

/** Payment-frequency loading: Annual 0%, Semi-Annual 2%, Quarterly 4%, Monthly 6%. */
export const rateSurcharges = pgTable("rate_surcharges", {
  id: uuid("id").primaryKey().defaultRandom(),
  rateCardId: uuid("rate_card_id")
    .notNull()
    .references(() => rateCards.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  percent: numeric("percent", { precision: 6, scale: 2 }).notNull(),
  sortOrder: integer("sort_order").notNull(),
});

/**
 * Deductible, outpatient per-visit excess and outpatient coinsurance — three
 * kinds printed in one table. The client's rule: a quote picks **one row only**,
 * they do not stack.
 */
export const rateDeductibles = pgTable("rate_deductibles", {
  id: uuid("id").primaryKey().defaultRandom(),
  rateCardId: uuid("rate_card_id")
    .notNull()
    .references(() => rateCards.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // 'deductible' | 'outpatient_excess' | 'outpatient_coinsurance'
  label: text("label").notNull(),
  reductionPercent: numeric("reduction_percent", { precision: 6, scale: 2 }).notNull(),
  excludedPlans: text("excluded_plans").array().notNull().default(sql`'{}'::text[]`),
  available: boolean("available").notNull().default(true),
  sortOrder: integer("sort_order").notNull(),
});

export type Product = typeof products.$inferSelect;
export type RateCard = typeof rateCards.$inferSelect;
