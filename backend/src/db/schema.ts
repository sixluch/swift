import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  coverageType: text("coverage_type")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  // The mandatory question sequence writes its answers here — one profile per
  // conversation, which is also what the admin report reads.
  fullName: text("full_name"),
  country: text("country"), // ISO 3166-1 alpha-2, country of residence
  nationality: text("nationality"), // ISO 3166-1 alpha-2
  age: integer("age"),
  planType: text("plan_type"), // 'individual' | 'family'
  familyAges: text("family_ages"), // free text, as the user phrased it
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

export type Lead = typeof leads.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
