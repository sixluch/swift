import { tool } from "ai";
import { z } from "zod";
import { db, schema } from "../../db/client.js";
import { parseFamilyAges, updateProfile } from "../conversations.js";
import {
  COVERAGE_TIERS,
  DELIVERY_CHANNELS,
  PLAN_TYPES,
  SLOT_QUESTIONS,
  coverageForTier,
  isReadyForQuotes,
  missingForQuotes,
  type Profile,
} from "../profile.js";
import { getQuotes } from "../quotes-api/index.js";

const isoSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "Use the ISO 3166-1 alpha-2 code, e.g. LB, AE, GB.");

/**
 * Tools for the guided flow.
 *
 * `saveProfile` is how a *typed or spoken* answer reaches the database — card
 * and dropdown answers bypass the model entirely and are applied by the route,
 * so the model can never mis-map them. `getQuotes` takes no arguments on
 * purpose: it reads what was actually stored, which makes it impossible for the
 * model to quote against details it invented or misremembered.
 */
export function buildTools(conversationId: string, profileRef: { current: Profile }) {
  return {
    saveProfile: tool({
      description:
        "Record answers the user gave in their own words. Call this the moment the user supplies any of these details, then continue the conversation. Only pass fields the user actually stated.",
      inputSchema: z.object({
        fullName: z.string().trim().min(1).max(100).optional().describe("The user's name."),
        country: isoSchema.optional().describe("ISO code of the country they LIVE in."),
        nationality: isoSchema.optional().describe("ISO code of their nationality."),
        age: z.number().int().min(0).max(120).optional().describe("The user's own age."),
        planType: z
          .enum(PLAN_TYPES)
          .optional()
          .describe("'individual' for just them, 'family' if adding partner/children."),
        familyAges: z
          .string()
          .trim()
          .max(300)
          .optional()
          .describe("Ages of other family members, exactly as the user phrased them."),
        coverageTier: z
          .enum(COVERAGE_TIERS)
          .optional()
          .describe(
            "Cumulative cover level: 'inpatient', 'inpatient_outpatient', 'dental' (adds dental), 'maternity' (adds maternity).",
          ),
        deliveryChannel: z
          .enum(DELIVERY_CHANNELS)
          .optional()
          .describe("Where to send the comparison: 'email' or 'whatsapp'."),
      }),
      execute: async (patch) => {
        try {
          profileRef.current = await updateProfile(conversationId, patch);
        } catch (err) {
          console.error("[saveProfile] could not persist:", err);
          return { error: "Could not save that. Ask the user to repeat it." };
        }

        const missing = missingForQuotes(profileRef.current);
        return {
          saved: true,
          profile: profileRef.current,
          nextQuestion: missing.length > 0 ? SLOT_QUESTIONS[missing[0]] : null,
          readyForQuotes: isReadyForQuotes(profileRef.current),
        };
      },
    }),

    getQuotes: tool({
      description:
        "Fetch quotations using the details already collected. Takes no arguments — it reads the saved profile. Only call it once every required detail has been collected. Never quote a price without calling this.",
      inputSchema: z.object({}),
      execute: async () => {
        const profile = profileRef.current;

        if (!isReadyForQuotes(profile)) {
          const missing = missingForQuotes(profile);
          return {
            error: `Not ready for quotes yet. Still missing: ${missing.join(", ")}. ${SLOT_QUESTIONS[missing[0]]}`,
          };
        }

        const coverageTypes = coverageForTier(profile.coverageTier);
        const additionalAges =
          profile.planType === "family" ? parseFamilyAges(profile.familyAges) : [];

        let quotes;
        try {
          ({ quotes } = await getQuotes({
            name: profile.fullName ?? "Guest",
            age: profile.age ?? 30,
            coverageTypes,
            country: profile.country ?? undefined,
            additionalAges,
          }));
        } catch (err) {
          // Returning the failure lets the model apologise in-conversation
          // instead of the whole stream erroring out under the user.
          console.error("[getQuotes] provider failed:", err);
          return {
            error:
              "The quotation service is unavailable right now. Apologise briefly and offer to try again in a moment.",
          };
        }

        try {
          await db.insert(schema.quoteRequests).values({
            conversationId,
            name: profile.fullName,
            age: profile.age,
            coverageType: coverageTypes,
            quotesReturned: quotes,
          });
        } catch (err) {
          // A logging failure must not cost the user their quotes.
          console.error("[getQuotes] could not snapshot the quote request:", err);
        }

        return { quotes };
      },
    }),
  };
}
