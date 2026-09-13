/**
 * Run with: cd backend && node src/lib/pdf.test.ts
 * Guards what the admin console will accept as an insurer rate card.
 */
import assert from "node:assert/strict";
import { MAX_PDF_BYTES, formatBytes, safeFilename, sha256Hex, validatePdf } from "./pdf.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const pdf = (extra = 0) =>
  new Uint8Array([...Buffer.from("%PDF-1.7\n"), ...new Uint8Array(extra)]);

test("accepts something that starts with the PDF magic bytes", () => {
  assert.equal(validatePdf(pdf()), null);
});

test("rejects a non-PDF even when the client claims application/pdf", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.match(validatePdf(png)?.error ?? "", /doesn't look like a PDF/);
  assert.match(validatePdf(new Uint8Array(Buffer.from("<html>")))?.error ?? "", /PDF/);
});

test("rejects an empty file", () => {
  assert.match(validatePdf(new Uint8Array(0))?.error ?? "", /empty/);
});

test("rejects a file over the size limit, and reports the limit", () => {
  const tooBig = pdf(MAX_PDF_BYTES);
  assert.match(validatePdf(tooBig)?.error ?? "", /too large.*10 MB/);
});

test("size is checked before contents, so a huge non-PDF isn't read", () => {
  const huge = new Uint8Array(MAX_PDF_BYTES + 1);
  assert.match(validatePdf(huge)?.error ?? "", /too large/);
});

test("hashes content, not the filename — the same bytes hash the same", () => {
  assert.equal(sha256Hex(pdf()), sha256Hex(pdf()));
  assert.notEqual(sha256Hex(pdf()), sha256Hex(pdf(1)));
  assert.equal(sha256Hex(new Uint8Array(0)).length, 64);
});

test("filenames lose any directory part the browser sent", () => {
  assert.equal(safeFilename("C:\\Users\\Nabil\\Downloads\\rates.pdf"), "rates.pdf");
  assert.equal(safeFilename("/tmp/rates.pdf"), "rates.pdf");
  assert.equal(safeFilename("../../etc/passwd"), "passwd");
});

test("filenames lose control characters and quotes that would break a header", () => {
  assert.equal(safeFilename('rate"card.pdf'), "ratecard.pdf");
  assert.equal(safeFilename("rate\ncard.pdf"), "ratecard.pdf");
  // Real spaces survive; only runs of them collapse.
  assert.equal(safeFilename("rate  card.pdf"), "rate card.pdf");
});

test("an unusable filename falls back rather than becoming empty", () => {
  assert.equal(safeFilename(""), "upload.pdf");
  assert.equal(safeFilename("   "), "upload.pdf");
  assert.equal(safeFilename("///"), "upload.pdf");
});

test("the real VUMI filename survives untouched", () => {
  assert.equal(
    safeFilename("Rate-Tables-Global-Flex-VIP-20262.pdf"),
    "Rate-Tables-Global-Flex-VIP-20262.pdf",
  );
});

test("byte sizes read the way a person expects", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(280260), "274 KB");
  assert.equal(formatBytes(5 * 1024 * 1024), "5.0 MB");
});

console.log(`\n${passed} passed`);
