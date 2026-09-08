import { Hono } from "hono";
import { db, schema } from "../db/client.js";
import { leadInputSchema } from "../lib/validation.js";

export const leadsRoute = new Hono();

leadsRoute.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body." }, 400);
  }

  const parsed = leadInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: "Validation failed.",
        fields: parsed.error.issues.reduce<Record<string, string>>((acc, issue) => {
          acc[String(issue.path[0] ?? "form")] = issue.message;
          return acc;
        }, {}),
      },
      400,
    );
  }

  const { email, phone, source } = parsed.data;

  try {
    const [lead] = await db
      .insert(schema.leads)
      .values({ email, phone, source: source ?? null })
      .returning({ id: schema.leads.id, createdAt: schema.leads.createdAt });

    return c.json({ leadId: lead.id, createdAt: lead.createdAt }, 201);
  } catch (err) {
    console.error("[POST /leads] insert failed:", err);
    return c.json({ error: "Could not save your details. Please try again." }, 500);
  }
});
