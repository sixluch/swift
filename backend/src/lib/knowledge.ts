import { asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import type { Quote } from "./quotes-api/types.js";

/**
 * The knowledge base is admin-written text that goes straight into the chat's
 * system prompt — there is no fine-tuning and no retrieval step. Two kinds:
 *
 * - **General** (one text, `app_settings`): what cover types mean, how the
 *   process works, brand FAQ. Sent on every message.
 * - **Per insurer** (`insurers.knowledge_base`): what that company covers,
 *   exclusions, waiting periods, claims. Sent only for insurers that appear in
 *   the visitor's current quotes, so the prompt stays small and the model
 *   can't volunteer details about a company the visitor wasn't quoted.
 *
 * Both are capped at `KNOWLEDGE_BASE_MAX_CHARS`. That cap is what makes
 * prompt-stuffing sound: a handful of insurers at 30k characters each is well
 * inside any model's context. Pasting whole policy wordings is where this
 * design stops and chunked retrieval starts — refuse at the cap rather than
 * silently truncating, so the admin knows the text didn't all get in.
 */
export const KNOWLEDGE_BASE_MAX_CHARS = 30_000;

export const GENERAL_KNOWLEDGE_KEY = "general_knowledge_base";

export interface InsurerKnowledge {
  name: string;
  text: string;
}

/** What the `/api/knowledge` routes return per company. */
export interface InsurerKnowledgeRecord {
  id: string;
  name: string;
  knowledgeBase: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Knowledge {
  general: string;
  insurers: InsurerKnowledge[];
}

export const EMPTY_KNOWLEDGE: Knowledge = { general: "", insurers: [] };

export async function getGeneralKnowledge(): Promise<string> {
  const [row] = await db
    .select({ value: schema.appSettings.value })
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, GENERAL_KNOWLEDGE_KEY))
    .limit(1);
  return row?.value ?? "";
}

export async function setGeneralKnowledge(value: string): Promise<void> {
  await db
    .insert(schema.appSettings)
    .values({ key: GENERAL_KNOWLEDGE_KEY, value })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value, updatedAt: new Date() },
    });
}

/**
 * Knowledge for the insurers behind `quotes`, matched on the insurer's name —
 * the only identity a `Quote` carries. The mock provider's fictional insurers
 * match nothing and are simply absent, as they should be.
 */
export async function getInsurerKnowledge(quotes: Quote[]): Promise<InsurerKnowledge[]> {
  const names = [...new Set(quotes.map((q) => q.insurer))];
  if (names.length === 0) return [];

  const rows = await db
    .select({ name: schema.insurers.name, text: schema.insurers.knowledgeBase })
    .from(schema.insurers)
    .where(inArray(schema.insurers.name, names))
    .orderBy(schema.insurers.name);

  return rows.filter((row) => row.text.trim() !== "");
}

/** Everything the chat prompt needs, in one round of queries. */
export async function getKnowledge(quotes: Quote[]): Promise<Knowledge> {
  const [general, insurers] = await Promise.all([
    getGeneralKnowledge(),
    getInsurerKnowledge(quotes),
  ]);
  return { general, insurers };
}

/**
 * Every company's knowledge base, for the machine-facing API. Filtered to the
 * given names (case-insensitive) when `names` is non-empty; companies with no
 * text are left out unless `includeEmpty` — a voice AI wants the ones it can
 * actually answer from.
 */
export async function listInsurerKnowledge(options: {
  names?: string[];
  includeEmpty?: boolean;
} = {}): Promise<InsurerKnowledgeRecord[]> {
  const rows = await db
    .select({
      id: schema.insurers.id,
      name: schema.insurers.name,
      knowledgeBase: schema.insurers.knowledgeBase,
    })
    .from(schema.insurers)
    .orderBy(asc(schema.insurers.name));

  const wanted = new Set((options.names ?? []).map((n) => n.trim().toLowerCase()).filter(Boolean));
  return rows.filter(
    (row) =>
      (wanted.size === 0 || wanted.has(row.name.toLowerCase())) &&
      (options.includeEmpty || row.knowledgeBase.trim() !== ""),
  );
}

/** One company by id or by name (case-insensitive); null when unknown. */
export async function findInsurerKnowledge(ref: string): Promise<InsurerKnowledgeRecord | null> {
  const [row] = await db
    .select({
      id: schema.insurers.id,
      name: schema.insurers.name,
      knowledgeBase: schema.insurers.knowledgeBase,
    })
    .from(schema.insurers)
    .where(
      UUID_RE.test(ref)
        ? eq(schema.insurers.id, ref)
        : sql`lower(${schema.insurers.name}) = lower(${ref})`,
    )
    .limit(1);
  return row ?? null;
}
