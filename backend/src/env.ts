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
};
