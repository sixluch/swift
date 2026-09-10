import { z } from "zod";
import { COVERAGE_TIERS, DELIVERY_CHANNELS, PLAN_TYPES } from "./profile.js";

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
});

export type QuoteRequestInput = z.infer<typeof quoteRequestSchema>;

// Chip clicks quote before the conversation has produced a name, and usually
// before an age — so the preview surface asks for neither.
export const quotePreviewSchema = z.object({
  coverageTypes: z
    .array(coverageTypeSchema, { error: "Pick at least one coverage type." })
    .min(1, "Pick at least one coverage type."),
  age: z.coerce
    .number({ error: AGE_MESSAGE })
    .int(AGE_MESSAGE)
    .min(0, AGE_MESSAGE)
    .max(120, AGE_MESSAGE)
    .optional(),
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

export type QuotePreviewInput = z.infer<typeof quotePreviewSchema>;

/** UI message shape sent by the AI SDK's useChat hook. */
const uiMessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(["user", "assistant", "system"]),
  parts: z.array(z.looseObject({ type: z.string() })).min(1),
});

const isoCountrySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "Pick a country from the list.");

/**
 * An answer given by clicking a card or picking from a dropdown. These are
 * applied to the profile directly by the route, never parsed by the model, so a
 * selection can't be mis-recorded.
 */
export const slotAnswerSchema = z.discriminatedUnion("slot", [
  z.object({ slot: z.literal("fullName"), value: z.string().trim().min(1).max(100) }),
  z.object({ slot: z.literal("country"), value: isoCountrySchema }),
  z.object({ slot: z.literal("nationality"), value: isoCountrySchema }),
  z.object({ slot: z.literal("age"), value: z.coerce.number().int().min(0).max(120) }),
  z.object({ slot: z.literal("planType"), value: z.enum(PLAN_TYPES) }),
  z.object({ slot: z.literal("familyAges"), value: z.string().trim().min(1).max(300) }),
  z.object({ slot: z.literal("coverageTier"), value: z.enum(COVERAGE_TIERS) }),
  z.object({ slot: z.literal("deliveryChannel"), value: z.enum(DELIVERY_CHANNELS) }),
]);

export const chatRequestSchema = z.object({
  leadId: z.uuid({ error: "A saved lead is required before chatting." }),
  messages: z.array(uiMessageSchema).min(1, "Send at least one message."),
  slotAnswer: slotAnswerSchema.optional(),
  inputMode: z.enum(["typed", "voice"]).default("typed"),
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
