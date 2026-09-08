import { z } from "zod";

/** Strips spaces, dashes, dots and parentheses so "+961 3 123 456" validates. */
export function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-().]/g, "");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9]{7,15}$/;

const EMAIL_MESSAGE = "Enter a valid email address.";
const PHONE_MESSAGE = "Enter a valid phone number.";

// Messages are user-facing (the form renders them inline), so missing/wrong-type
// cases get the same wording as a badly formatted value rather than Zod's default.
export const leadInputSchema = z.object({
  email: z
    .string({ error: EMAIL_MESSAGE })
    .trim()
    .toLowerCase()
    .refine((v) => EMAIL_RE.test(v), EMAIL_MESSAGE),
  phone: z
    .string({ error: PHONE_MESSAGE })
    .trim()
    .transform(normalizePhone)
    .refine((v) => PHONE_RE.test(v), PHONE_MESSAGE),
  source: z.string().trim().max(200).optional(),
});

export type LeadInput = z.infer<typeof leadInputSchema>;
