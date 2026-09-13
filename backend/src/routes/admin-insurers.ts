import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db/client.js";
import type { AdminEnv } from "../lib/admin-auth.js";
import { fieldErrors } from "../lib/http.js";
import { extractPdfLines, extractPdfPages } from "../lib/pdf-text.js";
import { MAX_PDF_BYTES, safeFilename, sha256Hex, validatePdf } from "../lib/pdf.js";
import {
  productNameFromFilename,
  productNameFromText,
} from "../lib/rate-cards/product-name.js";
import { listRateCardsForInsurer, saveRateCard } from "../lib/rate-cards/store.js";
import { parseVumiRateCard } from "../lib/rate-cards/vumi-parser.js";
import {
  insurerInputSchema,
  insurerUpdateSchema,
  parseDocumentSchema,
} from "../lib/validation.js";

/**
 * Insurer management. Mounted under `/admin/insurers`, behind `requireAdmin`.
 *
 * This stage covers creating a company and uploading its rate-card PDF. Parsing
 * that PDF into products and rate cards is the next stage — hence
 * `parse_status: 'pending'` on every row written here.
 */
export const adminInsurersRoute = new Hono<AdminEnv>();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Postgres unique-violation. Drizzle wraps driver errors in a
 * `DrizzleQueryError`, so the SQLSTATE is on `.cause` rather than the error
 * itself — the chain is walked instead of assuming a depth.
 */
function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (typeof current === "object" && (current as { code?: string }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** Never selects `content` — a list must not drag every PDF's bytes with it. */
const documentColumns = {
  id: schema.insurerDocuments.id,
  insurerId: schema.insurerDocuments.insurerId,
  filename: schema.insurerDocuments.filename,
  mimeType: schema.insurerDocuments.mimeType,
  byteSize: schema.insurerDocuments.byteSize,
  sha256: schema.insurerDocuments.sha256,
  parseStatus: schema.insurerDocuments.parseStatus,
  uploadedAt: schema.insurerDocuments.uploadedAt,
};

adminInsurersRoute.get("/", async (c) => {
  // Counted with a join and an aggregate rather than a correlated subquery:
  // inside a raw `sql` template drizzle only qualifies columns of tables that
  // are in the query's FROM/JOIN set, so a subquery over an unjoined table
  // emits `where "insurer_id" = "id"` and silently matches nothing.
  const rows = await db
    .select({
      id: schema.insurers.id,
      name: schema.insurers.name,
      createdAt: schema.insurers.createdAt,
      // Length only: the list must not carry every company's knowledge base.
      knowledgeBaseChars: sql<number>`length(${schema.insurers.knowledgeBase})::int`.as(
        "knowledge_base_chars",
      ),
      documentCount: sql<number>`count(${schema.insurerDocuments.id})::int`.as("document_count"),
    })
    .from(schema.insurers)
    .leftJoin(
      schema.insurerDocuments,
      eq(schema.insurerDocuments.insurerId, schema.insurers.id),
    )
    .groupBy(
      schema.insurers.id,
      schema.insurers.name,
      schema.insurers.createdAt,
      schema.insurers.knowledgeBase,
    )
    .orderBy(desc(schema.insurers.createdAt));

  return c.json({ rows });
});

adminInsurersRoute.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body." }, 400);
  }

  const parsed = insurerInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed.", fields: fieldErrors(parsed.error) }, 400);
  }

  try {
    const [insurer] = await db
      .insert(schema.insurers)
      .values({ name: parsed.data.name, knowledgeBase: parsed.data.knowledgeBase })
      .returning();
    return c.json({ insurer }, 201);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return c.json(
        {
          error: "An insurance company with that name already exists.",
          fields: { name: "An insurance company with that name already exists." },
        },
        409,
      );
    }
    console.error("[POST /admin/insurers] insert failed:", err);
    return c.json({ error: "Could not save that insurance company. Please try again." }, 500);
  }
});

adminInsurersRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return c.json({ error: "Unknown insurance company." }, 400);

  const [insurer] = await db
    .select()
    .from(schema.insurers)
    .where(eq(schema.insurers.id, id))
    .limit(1);

  if (!insurer) return c.json({ error: "Unknown insurance company." }, 404);

  const [documents, rateCards] = await Promise.all([
    db
      .select(documentColumns)
      .from(schema.insurerDocuments)
      .where(eq(schema.insurerDocuments.insurerId, insurer.id))
      .orderBy(desc(schema.insurerDocuments.uploadedAt)),
    listRateCardsForInsurer(insurer.id),
  ]);

  return c.json({ insurer, documents, rateCards });
});

adminInsurersRoute.patch("/:id", async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return c.json({ error: "Unknown insurance company." }, 400);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body." }, 400);
  }

  const parsed = insurerUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed.", fields: fieldErrors(parsed.error) }, 400);
  }

  try {
    const [insurer] = await db
      .update(schema.insurers)
      .set(parsed.data)
      .where(eq(schema.insurers.id, id))
      .returning();
    if (!insurer) return c.json({ error: "Unknown insurance company." }, 404);
    return c.json({ insurer });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return c.json(
        {
          error: "An insurance company with that name already exists.",
          fields: { name: "An insurance company with that name already exists." },
        },
        409,
      );
    }
    console.error("[PATCH /admin/insurers/:id] update failed:", err);
    return c.json({ error: "Could not save that change. Please try again." }, 500);
  }
});

adminInsurersRoute.post("/:id/documents", async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return c.json({ error: "Unknown insurance company." }, 400);

  const [insurer] = await db
    .select({ id: schema.insurers.id })
    .from(schema.insurers)
    .where(eq(schema.insurers.id, id))
    .limit(1);

  if (!insurer) return c.json({ error: "Unknown insurance company." }, 404);

  // parseBody() buffers the whole body, so an oversized upload is refused from
  // the header before it is read rather than after.
  const declaredLength = Number(c.req.header("content-length") ?? 0);
  if (declaredLength > MAX_PDF_BYTES * 1.1) {
    const mb = Math.round(MAX_PDF_BYTES / (1024 * 1024));
    const message = `That file is too large. The limit is ${mb} MB.`;
    return c.json({ error: message, fields: { file: message } }, 413);
  }

  let form: Awaited<ReturnType<typeof c.req.parseBody>>;
  try {
    form = await c.req.parseBody();
  } catch {
    return c.json({ error: "Could not read the upload. Please try again." }, 400);
  }

  const file = form.file;
  if (!(file instanceof File)) {
    return c.json({ error: "Choose a PDF to upload.", fields: { file: "Choose a PDF to upload." } }, 400);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const rejection = validatePdf(bytes);
  if (rejection) {
    return c.json({ error: rejection.error, fields: { file: rejection.error } }, 400);
  }

  const filename = safeFilename(file.name);
  const values = {
    insurerId: insurer.id,
    filename,
    mimeType: "application/pdf",
    byteSize: bytes.byteLength,
    sha256: sha256Hex(bytes),
    content: Buffer.from(bytes),
    // Re-uploading resets this: the new bytes have not been parsed either.
    parseStatus: "pending",
  };

  try {
    // Same filename for the same insurer replaces the row rather than piling up
    // copies — the admin re-uploading a corrected rate card is the normal case.
    const [saved] = await db
      .insert(schema.insurerDocuments)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.insurerDocuments.insurerId, schema.insurerDocuments.filename],
        set: {
          mimeType: values.mimeType,
          byteSize: values.byteSize,
          sha256: values.sha256,
          content: values.content,
          parseStatus: values.parseStatus,
          uploadedAt: new Date(),
        },
      })
      .returning(documentColumns);

    return c.json({ document: saved }, 201);
  } catch (err) {
    console.error("[POST /admin/insurers/:id/documents] upload failed:", err);
    return c.json({ error: "Could not store that file. Please try again." }, 500);
  }
});

adminInsurersRoute.get("/:id/documents/:documentId/file", async (c) => {
  const { id, documentId } = c.req.param();
  if (!UUID_RE.test(id) || !UUID_RE.test(documentId)) {
    return c.json({ error: "Unknown document." }, 400);
  }

  const [document] = await db
    .select()
    .from(schema.insurerDocuments)
    .where(eq(schema.insurerDocuments.id, documentId))
    .limit(1);

  if (!document || document.insurerId !== id) {
    return c.json({ error: "Unknown document." }, 404);
  }

  c.header("Content-Type", document.mimeType);
  // `inline` so the browser's PDF viewer opens it — the admin wants to read the
  // rate card, not collect another copy of it.
  c.header("Content-Disposition", `inline; filename="${document.filename}"`);
  return c.body(new Uint8Array(document.content));
});

adminInsurersRoute.delete("/:id/documents/:documentId", async (c) => {
  const { id, documentId } = c.req.param();
  if (!UUID_RE.test(id) || !UUID_RE.test(documentId)) {
    return c.json({ error: "Unknown document." }, 400);
  }

  // Both ids are in the WHERE clause, so a mismatched pair deletes nothing
  // rather than deleting first and complaining afterwards.
  const [deleted] = await db
    .delete(schema.insurerDocuments)
    .where(
      and(
        eq(schema.insurerDocuments.id, documentId),
        eq(schema.insurerDocuments.insurerId, id),
      ),
    )
    .returning({ id: schema.insurerDocuments.id });

  if (!deleted) return c.json({ error: "Unknown document." }, 404);

  return c.json({ ok: true });
});

adminInsurersRoute.post("/:id/documents/:documentId/parse", async (c) => {
  const { id, documentId } = c.req.param();
  if (!UUID_RE.test(id) || !UUID_RE.test(documentId)) {
    return c.json({ error: "Unknown document." }, 400);
  }

  let body: unknown = {};
  try {
    body = await c.req.json();
  } catch {
    // An empty body is fine — the product name is optional.
  }

  const input = parseDocumentSchema.safeParse(body);
  if (!input.success) {
    return c.json({ error: "Validation failed.", fields: fieldErrors(input.error) }, 400);
  }

  const [document] = await db
    .select()
    .from(schema.insurerDocuments)
    .where(eq(schema.insurerDocuments.id, documentId))
    .limit(1);

  if (!document || document.insurerId !== id) {
    return c.json({ error: "Unknown document." }, 404);
  }

  const markFailed = () =>
    db
      .update(schema.insurerDocuments)
      .set({ parseStatus: "failed" })
      .where(eq(schema.insurerDocuments.id, documentId));

  const pages = extractPdfPages(new Uint8Array(document.content));
  if (pages.length === 0) {
    await markFailed();
    return c.json(
      {
        error:
          "No text could be read from this PDF. If it is a scan rather than a typeset document it needs a different import route.",
      },
      422,
    );
  }

  const productName =
    input.data.productName ??
    productNameFromText(pages.flat()) ??
    // The product name is drawn from a form XObject, which per-page extraction
    // does not follow, so fall back to the whole document and then the filename.
    productNameFromText(extractPdfLines(new Uint8Array(document.content))) ??
    productNameFromFilename(document.filename) ??
    "Rate card";
  const parsed = parseVumiRateCard(pages, productName);

  const totalPremiums = parsed.areas.reduce(
    (n, area) => n + area.premiums.length * parsed.plans.length,
    0,
  );

  // A card with no premiums is not a card. Refusing here stops a half-read PDF
  // from becoming a product the quote engine would later draw prices from.
  if (totalPremiums === 0) {
    await markFailed();
    return c.json(
      {
        error:
          "This PDF's layout wasn't recognised — no premium tables were found. Only VUMI's Premium Rate Tables layout is supported so far.",
        warnings: parsed.warnings,
      },
      422,
    );
  }

  try {
    const summary = await saveRateCard({
      insurerId: id,
      documentId,
      sourceFilename: document.filename,
      parsed,
    });
    console.log(
      `[admin] parsed "${document.filename}": ${summary.areas} areas, ${summary.premiums} premiums, ${summary.countries} countries, ${summary.warnings.length} warning(s)`,
    );
    return c.json({ summary }, 201);
  } catch (err) {
    console.error("[POST /admin/insurers/:id/documents/:documentId/parse] failed:", err);
    await markFailed();
    return c.json({ error: "Could not save the parsed rate card. Please try again." }, 500);
  }
});
