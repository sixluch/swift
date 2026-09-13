import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  PORT: Number(process.env.PORT ?? 3001),
  CORS_ALLOWED_ORIGINS: (process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY ?? "",
  AI_MODEL: process.env.AI_MODEL ?? "anthropic/claude-sonnet-5",
  BRAND_NAME: process.env.BRAND_NAME ?? "SwiftBrokers",
  ASSISTANT_NAME: process.env.ASSISTANT_NAME ?? "Nomi",
  QUOTE_CURRENCY: process.env.QUOTE_CURRENCY ?? "USD",

  /**
   * Bearer key for the machine-facing `/api/*` routes (voice AI, Postman).
   * Empty means those routes answer 503 — closed, never open.
   */
  KNOWLEDGE_API_KEY: process.env.KNOWLEDGE_API_KEY ?? "",

  /** How long an admin stays signed in. Short by design — this is a bulk PII surface. */
  ADMIN_SESSION_HOURS: Number(process.env.ADMIN_SESSION_HOURS ?? 8),
  /**
   * Set to the shared registrable domain in production (e.g. ".swiftbrokers.com")
   * so the session cookie set by api.* is sent by app.*. Left empty locally,
   * where both servers are on `localhost` and ports don't affect SameSite.
   */
  ADMIN_COOKIE_DOMAIN: process.env.ADMIN_COOKIE_DOMAIN ?? "",
  ADMIN_COOKIE_SECURE: (process.env.ADMIN_COOKIE_SECURE ?? "").toLowerCase() === "true"
    ? true
    : process.env.NODE_ENV === "production",
};
