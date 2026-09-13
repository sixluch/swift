import { createHash } from "node:crypto";

/**
 * Upload validation for rate-card PDFs. Pure, so it can be run directly:
 * `node src/lib/pdf.test.ts`.
 */

/** 10 MB. VUMI's 15-page rate card is 280 KB; this is generous for a scan. */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

const PDF_MAGIC = "%PDF-";

export interface PdfRejection {
  error: string;
}

/**
 * A browser's `Content-Type` is whatever the client says it is, so the header is
 * never trusted — the first five bytes are checked instead.
 */
export function validatePdf(bytes: Uint8Array): PdfRejection | null {
  if (bytes.byteLength === 0) return { error: "That file is empty." };

  if (bytes.byteLength > MAX_PDF_BYTES) {
    const mb = Math.round(MAX_PDF_BYTES / (1024 * 1024));
    return { error: `That file is too large. The limit is ${mb} MB.` };
  }

  const header = Buffer.from(bytes.subarray(0, PDF_MAGIC.length)).toString("latin1");
  if (header !== PDF_MAGIC) {
    return { error: "That doesn't look like a PDF. Please upload the insurer's rate-card PDF." };
  }

  return null;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Strips any directory part a browser may include and anything that would make
 * the name awkward in a Content-Disposition header or on disk. The name is only
 * ever a label — nothing resolves a path from it — but it is also the key the
 * re-upload-replaces rule matches on, so it must normalise consistently.
 */
export function safeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\x00-\x1f\x7f"]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  return cleaned || "upload.pdf";
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
