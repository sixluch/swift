import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./env.js";
import { leadsRoute } from "./routes/leads.js";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: env.CORS_ALLOWED_ORIGINS,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    credentials: true,
  }),
);

app.get("/health", (c) => c.json({ ok: true, service: "swiftbroker-backend" }));

app.route("/leads", leadsRoute);

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`swiftbroker-backend listening on http://localhost:${info.port}`);
});
