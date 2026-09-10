import { and, asc, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db/client.js";
import {
  clearSessionCookie,
  createSession,
  destroySession,
  hashPassword,
  readSessionCookie,
  requireAdmin,
  setSessionCookie,
  verifyPassword,
  type AdminEnv,
} from "../lib/admin-auth.js";
import { toCsv } from "../lib/csv.js";
import { fieldErrors } from "../lib/http.js";
import { adminLeadsQuerySchema, adminLoginSchema, type AdminLeadsQuery } from "../lib/validation.js";

export const adminRoute = new Hono<AdminEnv>();

/**
 * Wrong username and wrong password must be indistinguishable, in wording and
 * in timing — so a missing user still pays for one scrypt derivation.
 */
const DUMMY_HASH = await hashPassword(
  "not-a-real-password-this-only-exists-to-equalise-timing",
);

const SIGN_IN_FAILED = "Username or password is incorrect.";

adminRoute.post("/auth/login", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body." }, 400);
  }

  const parsed = adminLoginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed.", fields: fieldErrors(parsed.error) }, 400);
  }

  const { username, password } = parsed.data;

  const [user] = await db
    .select()
    .from(schema.adminUsers)
    .where(eq(schema.adminUsers.username, username))
    .limit(1);

  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    console.warn(`[admin] failed sign-in for "${username}"`);
    return c.json({ error: SIGN_IN_FAILED }, 401);
  }

  const { token, expiresAt } = await createSession(user.id);
  await db
    .update(schema.adminUsers)
    .set({ lastLoginAt: new Date() })
    .where(eq(schema.adminUsers.id, user.id));

  setSessionCookie(c, token, expiresAt);
  console.log(`[admin] "${username}" signed in`);
  return c.json({ username: user.username, expiresAt });
});

adminRoute.post("/auth/logout", async (c) => {
  const token = readSessionCookie(c);
  if (token) await destroySession(token);
  clearSessionCookie(c);
  return c.json({ ok: true });
});

adminRoute.get("/auth/me", requireAdmin, (c) => c.json(c.get("admin")));

// Everything below is data. The UI's redirect is convenience; this is the gate.
adminRoute.use("/leads", requireAdmin);
adminRoute.use("/leads/*", requireAdmin);
adminRoute.use("/leads.csv", requireAdmin);

/** Columns shared by the table and the CSV, so the two can never disagree. */
const leadColumns = {
  id: schema.leads.id,
  email: schema.leads.email,
  phone: schema.leads.phone,
  source: schema.leads.source,
  createdAt: schema.leads.createdAt,
  conversationId: schema.conversations.id,
  fullName: schema.conversations.fullName,
  country: schema.conversations.country,
  nationality: schema.conversations.nationality,
  age: schema.conversations.age,
  planType: schema.conversations.planType,
  familyAges: schema.conversations.familyAges,
  coverageTier: schema.conversations.coverageTier,
  deliveryChannel: schema.conversations.deliveryChannel,
  messageCount: sql<number>`(
    select count(*)::int from ${schema.messages}
    where ${schema.messages.conversationId} = ${schema.conversations.id}
  )`.as("message_count"),
  quoteCount: sql<number>`(
    select count(*)::int from ${schema.quoteRequests}
    where ${schema.quoteRequests.conversationId} = ${schema.conversations.id}
  )`.as("quote_count"),
};

const hasQuoteSql = sql`exists (
  select 1 from ${schema.quoteRequests}
  where ${schema.quoteRequests.conversationId} = ${schema.conversations.id}
)`;

/** Dates arrive as YYYY-MM-DD and are read as UTC days; the app has no timezone setting yet. */
function parseDay(value: string | undefined, endOfDay: boolean): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildFilters(query: AdminLeadsQuery): SQL | undefined {
  const conditions: SQL[] = [];

  if (query.q) {
    const pattern = `%${query.q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    const match = or(
      ilike(schema.leads.email, pattern),
      ilike(schema.leads.phone, pattern),
      ilike(schema.conversations.fullName, pattern),
    );
    if (match) conditions.push(match);
  }

  const from = parseDay(query.from, false);
  if (from) conditions.push(gte(schema.leads.createdAt, from));

  const to = parseDay(query.to, true);
  if (to) conditions.push(lte(schema.leads.createdAt, to));

  if (query.country) conditions.push(eq(schema.conversations.country, query.country));

  if (query.hasQuote === "yes") conditions.push(hasQuoteSql);
  if (query.hasQuote === "no") conditions.push(sql`not ${hasQuoteSql}`);

  return conditions.length > 0 ? and(...conditions) : undefined;
}

adminRoute.get("/leads", async (c) => {
  const query = adminLeadsQuerySchema.parse(
    Object.fromEntries(new URL(c.req.url).searchParams),
  );
  const where = buildFilters(query);

  // A lead with no conversation is a real outcome — someone who passed the gate
  // and never sent a message — so this is a LEFT JOIN, not an inner one.
  const rows = await db
    .select(leadColumns)
    .from(schema.leads)
    .leftJoin(schema.conversations, eq(schema.conversations.leadId, schema.leads.id))
    .where(where)
    .orderBy(desc(schema.leads.createdAt))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  const [totals] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.leads)
    .leftJoin(schema.conversations, eq(schema.conversations.leadId, schema.leads.id))
    .where(where);

  return c.json({
    rows,
    total: totals?.total ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  });
});

const CSV_HEADERS = [
  "Created (UTC)",
  "Email",
  "Phone",
  "Name",
  "Country",
  "Nationality",
  "Age",
  "Plan type",
  "Family ages",
  "Cover level",
  "Send by",
  "Messages",
  "Quotes",
  "Source",
];

/** Guards against an unfiltered export quietly trying to buffer the whole table. */
const CSV_MAX_ROWS = 5000;

adminRoute.get("/leads.csv", async (c) => {
  const query = adminLeadsQuerySchema.parse(
    Object.fromEntries(new URL(c.req.url).searchParams),
  );
  const where = buildFilters(query);

  const rows = await db
    .select(leadColumns)
    .from(schema.leads)
    .leftJoin(schema.conversations, eq(schema.conversations.leadId, schema.leads.id))
    .where(where)
    .orderBy(desc(schema.leads.createdAt))
    .limit(CSV_MAX_ROWS);

  const csv = toCsv(
    CSV_HEADERS,
    rows.map((r) => [
      r.createdAt,
      r.email,
      r.phone,
      r.fullName,
      r.country,
      r.nationality,
      r.age,
      r.planType,
      r.familyAges,
      r.coverageTier,
      r.deliveryChannel,
      r.messageCount ?? 0,
      r.quoteCount ?? 0,
      r.source,
    ]),
  );

  const stamp = new Date().toISOString().slice(0, 10);
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="swiftbrokers-leads-${stamp}.csv"`);
  return c.body(csv);
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

adminRoute.get("/leads/:id", async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return c.json({ error: "Unknown lead." }, 400);

  const [lead] = await db
    .select()
    .from(schema.leads)
    .where(eq(schema.leads.id, id))
    .limit(1);

  if (!lead) return c.json({ error: "Unknown lead." }, 404);

  const [conversation] = await db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.leadId, lead.id))
    .limit(1);

  if (!conversation) {
    return c.json({ lead, conversation: null, messages: [], quoteRequests: [] });
  }

  const [messages, quoteRequests] = await Promise.all([
    db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, conversation.id))
      .orderBy(asc(schema.messages.createdAt)),
    db
      .select()
      .from(schema.quoteRequests)
      .where(eq(schema.quoteRequests.conversationId, conversation.id))
      .orderBy(asc(schema.quoteRequests.createdAt)),
  ]);

  return c.json({ lead, conversation, messages, quoteRequests });
});
