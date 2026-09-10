import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./env.js";
import { adminRoute } from "./routes/admin.js";
import { chatRoute } from "./routes/chat.js";
import { leadsRoute } from "./routes/leads.js";
import { rateLimit } from "./lib/rate-limit.js";
import { quotesRoute } from "./routes/quotes.js";

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

// Lead capture is the bot-facing surface; /chat costs money on every call.
app.use(
  "/leads",
  rateLimit({
    limit: 5,
    windowMs: 10 * 60 * 1000,
    message: "Too many attempts. Please wait a few minutes and try again.",
  }),
);
app.use(
  "/chat",
  rateLimit({
    limit: 30,
    windowMs: 5 * 60 * 1000,
    message: "You're sending messages very quickly. Give it a moment and try again.",
  }),
);

// A password is the real defence; this just makes guessing it slow.
app.use(
  "/admin/auth/login",
  rateLimit({
    limit: 10,
    windowMs: 15 * 60 * 1000,
    message: "Too many sign-in attempts. Please wait a few minutes and try again.",
  }),
);

app.route("/leads", leadsRoute);
app.route("/chat", chatRoute);
app.route("/quotes", quotesRoute);
app.route("/admin", adminRoute);

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`swiftbroker-backend listening on http://localhost:${info.port}`);
});
