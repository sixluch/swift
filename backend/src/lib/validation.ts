import { z } from "zod";

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
});

export type QuotePreviewInput = z.infer<typeof quotePreviewSchema>;

/** UI message shape sent by the AI SDK's useChat hook. */
const uiMessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(["user", "assistant", "system"]),
  parts: z.array(z.looseObject({ type: z.string() })).min(1),
});

export const chatRequestSchema = z.object({
  leadId: z.uuid({ error: "A saved lead is required before chatting." }),
  messages: z.array(uiMessageSchema).min(1, "Send at least one message."),
  coverageTypes: z.array(coverageTypeSchema).default([]),
  inputMode: z.enum(["typed", "voice"]).default("typed"),
});
