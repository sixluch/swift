import { z } from "zod";
import { KNOWLEDGE_BASE_MAX_CHARS } from "./knowledge.js";
import {
  COVERAGE_TIERS,
  DELIVERY_CHANNELS,
  GENDERS,
  MAX_DEPENDANTS,
  RELATIONS,
} from "./profile.js";

/** Strips spaces, dashes, dots and parentheses so "+961 3 123 456" validates. */
export function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-().]/g, "");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9]{7,15}$/;

const EMAIL_MESSAGE = "Enter a valid email address.";
const PHONE_MESSAGE = "Enter a valid phone number.";
const AGE_MESSAGE = "Enter an age between 0 and 120.";
const NAME_MESSAGE = "Tell us the applicant's name.";
const COVERAGE_MESSAGE = "Pick from inpatient, outpatient, dental or maternity.";

// Messages are user-facing (the form renders them inline), so missing/wrong-type
// cases get the same wording as a badly formatted value rather than Zod's default.
export const leadInputSchema = z.object({
  email: z
    .string({ error: EMAIL_MESSAGE })
    .trim()
    .toLowerCase()
    .refine((v) => EMAIL_RE.test(v), EMAIL_MESSAGE),
  // Sent as one E.164 string — the gate joins its country-code select to the
  // typed digits before posting, so there is no separate dial-code field here.
  phone: z
    .string({ error: PHONE_MESSAGE })
    .trim()
    .transform(normalizePhone)
    .refine((v) => PHONE_RE.test(v), PHONE_MESSAGE),
  source: z.string().trim().max(200).optional(),
});

export type LeadInput = z.infer<typeof leadInputSchema>;

export const coverageTypeSchema = z.enum(
  ["inpatient", "outpatient", "dental", "maternity"],
  { error: COVERAGE_MESSAGE },
);

export const quoteRequestSchema = z.object({
  name: z.string({ error: NAME_MESSAGE }).trim().min(1, NAME_MESSAGE).max(100),
  age: z.coerce
    .number({ error: AGE_MESSAGE })
    .int(AGE_MESSAGE)
    .min(0, AGE_MESSAGE)
    .max(120, AGE_MESSAGE),
  coverageTypes: z
    .array(coverageTypeSchema, { error: "Pick at least one coverage type." })
    .min(1, "Pick at least one coverage type."),
  // Country of residence resolves the rate-card area, so a request without it
  // gets mock quotes only. Zod strips unknown keys, so omitting these here
  // silently dropped them on the way to the provider.
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Pick a country from the list.")
    .optional(),
  additionalAges: z
    .array(z.coerce.number().int().min(0).max(120), { error: AGE_MESSAGE })
    .max(10)
    .optional(),
});

export type QuoteRequestInput = z.infer<typeof quoteRequestSchema>;

/** UI message shape sent by the AI SDK's useChat hook. */
const uiMessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(["user", "assistant", "system"]),
  parts: z.array(z.looseObject({ type: z.string() })).min(1),
});

const isoCountrySchema = z
  .string({ error: "Pick a country from the list." })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "Pick a country from the list.");

export const chatRequestSchema = z.object({
  leadId: z.uuid({ error: "A saved lead is required before chatting." }),
  messages: z.array(uiMessageSchema).min(1, "Send at least one message."),
  inputMode: z.enum(["typed", "voice"]).default("typed"),
});

const ageSchema = z.coerce
  .number({ error: AGE_MESSAGE })
  .int(AGE_MESSAGE)
  .min(0, AGE_MESSAGE)
  .max(120, AGE_MESSAGE);

const DATE_MESSAGE = "Pick a start date from today onwards.";

/** Today as YYYY-MM-DD in UTC — the form's date input has no timezone either. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The quote form, submitted whole on every COMPARE. Every field the pricing
 * depends on is required here, so the provider is never asked to quote against
 * a half-filled form; gender and effective date are required because the
 * client's form marks them so, not because a price depends on them yet.
 */
export const quoteFormSchema = z.object({
  leadId: z.uuid({ error: "A saved lead is required before quoting." }),
  fullName: z.string({ error: NAME_MESSAGE }).trim().min(1, NAME_MESSAGE).max(100),
  country: isoCountrySchema.describe("Country of expatriation"),
  nationality: isoCountrySchema,
  effectiveDate: z
    .string({ error: DATE_MESSAGE })
    .regex(/^\d{4}-\d{2}-\d{2}$/, DATE_MESSAGE)
    .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), DATE_MESSAGE)
    // Yesterday's date is a mistake, not a backdated policy.
    .refine((v) => v >= todayIso(), DATE_MESSAGE),
  age: ageSchema,
  gender: z.enum(GENDERS, { error: "Pick male or female." }),
  dependants: z
    .array(
      z.object({
        relation: z.enum(RELATIONS, { error: "Pick spouse or child." }),
        age: ageSchema,
        gender: z.enum(GENDERS, { error: "Pick male or female." }),
      }),
      { error: "Dependants must be a list." },
    )
    .max(MAX_DEPENDANTS, `Up to ${MAX_DEPENDANTS} family members per quote.`)
    .default([]),
  coverageTier: z.enum(COVERAGE_TIERS, {
    error: `Pick a cover level: ${COVERAGE_TIERS.join(", ")}.`,
  }),
});

export type QuoteFormInput = z.infer<typeof quoteFormSchema>;

/** Where the visitor wants the comparison sent — chosen from the results panel. */
export const deliveryChoiceSchema = z.object({
  leadId: z.uuid({ error: "A saved lead is required." }),
  channel: z.enum(DELIVERY_CHANNELS, { error: "Pick email or WhatsApp." }),
});

/** Admin sign-in. Wording stays deliberately vague about which field was wrong. */
export const adminLoginSchema = z.object({
  username: z.string().trim().min(1, "Enter your username.").max(64),
  password: z.string().min(1, "Enter your password.").max(200),
});

// A junk query string should narrow the report, never 500 it — every field here
// falls back rather than throwing, so `.parse()` on the search params is total.
const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .catch(undefined)
    .transform((v) => (v ? v : undefined));

/** Query string for the lead report — shared by the table and the CSV export. */
export const adminLeadsQuerySchema = z.object({
  q: optionalTrimmed(120),
  from: optionalTrimmed(30),
  to: optionalTrimmed(30),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .optional()
    .catch(undefined),
  hasQuote: z.enum(["yes", "no"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25).catch(25),
});

export type AdminLeadsQuery = z.infer<typeof adminLeadsQuerySchema>;

/** Creating an insurance company from the admin console. */
const insurerNameSchema = z
  .string({ error: "Enter the insurance company's name." })
  .trim()
  .min(2, "Enter the insurance company's name.")
  .max(120, "That name is too long.");

/**
 * Refused above the cap rather than truncated: the text goes into the chat
 * prompt verbatim, and a silently cut-off knowledge base is one the admin
 * believes the assistant has read.
 */
const knowledgeBaseSchema = z
  .string({ error: "The knowledge base must be text." })
  .max(
    KNOWLEDGE_BASE_MAX_CHARS,
    `That's too long — the knowledge base is limited to ${KNOWLEDGE_BASE_MAX_CHARS.toLocaleString("en-US")} characters.`,
  )
  .transform((text) => text.replace(/\r\n/g, "\n").trim());

export const insurerInputSchema = z.object({
  name: insurerNameSchema,
  knowledgeBase: knowledgeBaseSchema.default(""),
});

export type InsurerInput = z.infer<typeof insurerInputSchema>;

/** Partial on purpose: the detail page saves the knowledge base on its own. */
export const insurerUpdateSchema = z
  .object({
    name: insurerNameSchema.optional(),
    knowledgeBase: knowledgeBaseSchema.optional(),
  })
  .refine((v) => v.name !== undefined || v.knowledgeBase !== undefined, {
    message: "Nothing to update.",
  });

export const generalKnowledgeSchema = z.object({
  knowledgeBase: knowledgeBaseSchema,
});

/** Manual edits to a rate card's benefit / surcharge / deductible tables. */
const percentValue = z.coerce.number().min(-100).max(1000);

export const sectionEditsSchema = z.object({
  edits: z
    .array(
      z.discriminatedUnion("table", [
        z.object({
          table: z.literal("benefit"),
          id: z.uuid(),
          available: z.boolean().optional(),
          amount: z.coerce.number().min(0).max(1_000_000).optional(),
        }),
        z.object({
          table: z.literal("surcharge"),
          id: z.uuid(),
          percent: percentValue.optional(),
        }),
        z.object({
          table: z.literal("deductible"),
          id: z.uuid(),
          available: z.boolean().optional(),
          reductionPercent: percentValue.optional(),
        }),
        z.object({
          table: z.literal("restriction"),
          id: z.uuid(),
          available: z.boolean().optional(),
          discountPercent: percentValue.optional(),
        }),
      ]),
    )
    .min(1, "Nothing to save.")
    .max(200),
});

/** Naming the product when a rate card is parsed. */
export const parseDocumentSchema = z.object({
  productName: z
    .string()
    .trim()
    .min(2, "Give the product a name.")
    .max(120, "That name is too long.")
    .optional(),
});

/**
 * `POST /api/ask` — a question for the assistant from a server-side caller
 * (the voice AI). `history` lets the caller keep a multi-turn conversation
 * without the backend storing anything; it is bounded so a runaway client
 * can't push an unbounded transcript into every request.
 */
export const askSchema = z.object({
  question: z
    .string({ error: "Send a question." })
    .trim()
    .min(1, "Send a question.")
    .max(2_000, "That question is too long (2,000 characters max)."),
  /** Restrict the insurer knowledge to these companies (by name). Default: every company that has a knowledge base. */
  insurers: z
    .array(z.string().trim().min(1).max(120), { error: "insurers must be a list of company names." })
    .max(20, "At most 20 insurers.")
    .optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"], { error: "history roles must be 'user' or 'assistant'." }),
        content: z.string().trim().min(1).max(4_000, "A history entry is too long (4,000 characters max)."),
      }),
      { error: "history must be a list of {role, content}." },
    )
    .max(20, "At most 20 history entries.")
    .default([]),
});

export type AskInput = z.infer<typeof askSchema>;

/**
 * `POST /api/quotes` — the quote form as a machine caller sends it: the same
 * fields as the web form (same schema, so the two cannot drift), no leadId,
 * and an optional `contact`. With `contact` the caller becomes a lead in the
 * CRM exactly as a web visitor would; without it the call only prices.
 */
export const apiQuoteSchema = quoteFormSchema.omit({ leadId: true }).extend({
  contact: leadInputSchema.pick({ email: true, phone: true }).optional(),
});

export type ApiQuoteInput = z.infer<typeof apiQuoteSchema>;
