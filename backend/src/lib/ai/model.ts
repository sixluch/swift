import { env } from "../../env.js";

/**
 * Model routing is env-driven so providers can be swapped without code changes.
 * A bare "provider/model" string resolves through the Vercel AI Gateway,
 * which reads AI_GATEWAY_API_KEY from the environment.
 */
export function chatModel(): string {
  if (!env.AI_GATEWAY_API_KEY) {
    throw new Error(
      "AI_GATEWAY_API_KEY is not set — add your Vercel AI Gateway key to backend/.env",
    );
  }
  return env.AI_MODEL;
}
