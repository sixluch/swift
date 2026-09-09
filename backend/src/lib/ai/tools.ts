import { tool } from "ai";
import { z } from "zod";
import { db, schema } from "../../db/client.js";
import { getQuotes } from "../quotes-api/index.js";
import { coverageTypeSchema } from "../validation.js";
import type { CoverageType } from "../quotes-api/types.js";

/**
 * The assistant's only route to prices. Calls the same quotes-api module that
 * POST /quotes exposes — no HTTP hop, since it runs in this process.
 */
export function buildTools(conversationId: string, uiCoverageTypes: CoverageType[]) {
  return {
    getQuotes: tool({
      description:
        "Fetch health insurance quotations once you know the applicant's name, age and coverage type(s). Never quote prices without calling this.",
      inputSchema: z.object({
        name: z.string().describe("The applicant's first name."),
        age: z.number().int().min(0).max(120).describe("The applicant's age in years."),
        coverageTypes: z
          .array(coverageTypeSchema)
          .min(1)
          .describe("Coverage types requested: inpatient, outpatient, dental, maternity."),
      }),
      execute: async ({ name, age, coverageTypes }) => {
        // Trust the UI selection when the model passes nothing useful.
        const requested = coverageTypes.length > 0 ? coverageTypes : uiCoverageTypes;

        let quotes;
        try {
          ({ quotes } = await getQuotes({ name, age, coverageTypes: requested }));
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
            name,
            age,
            coverageType: requested,
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
