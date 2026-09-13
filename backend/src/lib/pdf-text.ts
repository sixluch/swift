import { inflateRawSync, inflateSync } from "node:zlib";

/**
 * Dependency-free PDF text extraction: inflate every FlateDecode stream, then
 * read the text-showing operators (Tj, TJ, ', ") and treat each text-positioning
 * operator as a line break.
 *
 * This exists instead of a PDF library because insurer rate cards are typeset
 * tables whose text layer is intact — `pdftoppm`/OCR is not needed, and adding a
 * native PDF dependency to a Vercel deployment is a cost with no benefit here.
 * A scanned rate card would produce no text at all, which the caller detects as
 * an empty result rather than silently mis-parsing.
 */
export function extractPdfText(bytes: Uint8Array): string[] {
  const buf = Buffer.from(bytes);
  const blocks: string[] = [];

  for (const raw of collectStreams(buf)) {
    const data = inflate(raw);
    if (!data) continue;

    const text = data.toString("latin1");
    if (!/(Tj|TJ)\s/.test(text)) continue;

    const block = readContentStream(text);
    if (block.trim()) blocks.push(block);
  }

  return blocks;
}

/**
 * Every extracted line, in content-stream order. Useful for inspection, but
 * NOT for attributing values to a section: content streams are emitted in
 * drawing order, which in this rate card puts a page's heading sometimes before
 * and sometimes after its own tables. Use `extractPdfPages` for anything where
 * "which area does this belong to" matters.
 */
export function extractPdfLines(bytes: Uint8Array): string[] {
  return extractPdfText(bytes)
    .join("\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Lines grouped by real PDF page, in page order, resolved through the document's
 * page tree (`/Type /Pages` → `/Kids` → each page's `/Contents`).
 *
 * This matters more than it sounds: a rate card's area heading and its premium
 * table are only reliably connected by being on the same sheet of paper. Pairing
 * them by position in the content stream happens to work on some pages of this
 * PDF and silently mispairs others, and a mispaired area is a wrong price.
 *
 * Returns an empty array when the page tree can't be read, so the caller can
 * refuse rather than guess.
 *
 * Known limitation: only a page's own `/Contents` is followed, not text drawn
 * from a form XObject. On this rate card that means the sidebar with the product
 * name is not in the per-page output — cosmetic, and `extractPdfText` still sees
 * it — while every table that carries a price is.
 */
export function extractPdfPages(bytes: Uint8Array): string[][] {
  const buf = Buffer.from(bytes);
  const objects = indexObjects(buf);
  const pageNumbers = readPageOrder(buf, objects);
  if (pageNumbers.length === 0) return [];

  const pages: string[][] = [];

  for (const pageNumber of pageNumbers) {
    const body = objects.get(pageNumber);
    if (!body) continue;

    const header = buf.subarray(body.start, body.end).toString("latin1");
    let text = "";

    for (const contentsNumber of readContentsRefs(header)) {
      const contents = objects.get(contentsNumber);
      if (!contents) continue;

      const raw = readStream(buf, contents);
      if (!raw) continue;

      const data = inflate(raw);
      if (!data) continue;

      const chunk = data.toString("latin1");
      if (!/(Tj|TJ)\s/.test(chunk)) continue;

      text += readContentStream(chunk);
    }

    pages.push(
      text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    );
  }

  return pages;
}

interface ObjectSpan {
  start: number;
  end: number;
}

/** Byte spans of every `N 0 obj … endobj`, scanned rather than regexed so a binary stream can't confuse it. */
function indexObjects(buf: Buffer): Map<number, ObjectSpan> {
  const objects = new Map<number, ObjectSpan>();
  const text = buf.toString("latin1");
  const header = /(\d+)\s+(\d+)\s+obj\b/g;

  const starts: Array<{ number: number; at: number; after: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = header.exec(text)) !== null) {
    starts.push({ number: Number(match[1]), at: match.index, after: match.index + match[0].length });
  }

  for (let i = 0; i < starts.length; i++) {
    const next = starts[i + 1]?.at ?? buf.byteLength;
    const endobj = text.lastIndexOf("endobj", next);
    objects.set(starts[i].number, {
      start: starts[i].after,
      end: endobj > starts[i].after ? endobj : next,
    });
  }

  return objects;
}

/** Page object numbers in reading order, from the page tree's `/Kids`. */
function readPageOrder(buf: Buffer, objects: Map<number, ObjectSpan>): number[] {
  for (const [, span] of objects) {
    const body = buf.subarray(span.start, span.end).toString("latin1");
    if (!/\/Type\s*\/Pages\b/.test(body)) continue;

    const kids = /\/Kids\s*\[([^\]]*)\]/.exec(body);
    if (!kids) continue;

    const numbers = [...kids[1].matchAll(/(\d+)\s+\d+\s+R/g)].map((m) => Number(m[1]));
    // Only a flat, single-level page tree is trusted. A nested one would need
    // recursion, and mis-ordering pages is exactly the failure to avoid.
    const allPages = numbers.every((n) => {
      const child = objects.get(n);
      if (!child) return false;
      return /\/Type\s*\/Page\b/.test(buf.subarray(child.start, child.end).toString("latin1"));
    });

    if (numbers.length > 0 && allPages) return numbers;
  }

  return [];
}

function readContentsRefs(pageBody: string): number[] {
  const single = /\/Contents\s+(\d+)\s+\d+\s+R/.exec(pageBody);
  if (single) return [Number(single[1])];

  const array = /\/Contents\s*\[([^\]]*)\]/.exec(pageBody);
  if (array) return [...array[1].matchAll(/(\d+)\s+\d+\s+R/g)].map((m) => Number(m[1]));

  return [];
}

function readStream(buf: Buffer, span: ObjectSpan): Buffer | null {
  const region = buf.subarray(span.start, span.end);
  const start = region.indexOf("stream");
  if (start === -1) return null;

  let from = start + "stream".length;
  if (region[from] === 0x0d) from++;
  if (region[from] === 0x0a) from++;

  const end = region.indexOf("endstream", from);
  return end === -1 ? null : region.subarray(from, end);
}

function inflate(b: Buffer): Buffer | null {
  try {
    return inflateSync(b);
  } catch {
    /* not a zlib stream */
  }
  try {
    return inflateRawSync(b);
  } catch {
    return null;
  }
}

function collectStreams(buf: Buffer): Buffer[] {
  const streams: Buffer[] = [];
  let index = 0;

  while (true) {
    const start = buf.indexOf("stream", index);
    if (start === -1) break;

    let from = start + "stream".length;
    if (buf[from] === 0x0d) from++;
    if (buf[from] === 0x0a) from++;

    const end = buf.indexOf("endstream", from);
    if (end === -1) break;

    streams.push(buf.subarray(from, end));
    index = end + "endstream".length;
  }

  return streams;
}

function pdfUnescape(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "")
    .replace(/\\t/g, "\t")
    .replace(/\\b/g, "")
    .replace(/\\f/g, "")
    .replace(/\\([0-7]{1,3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)))
    .replace(/\\(.)/g, "$1");
}

const TOKENS =
  /\((?:\\.|[^\\()])*\)|\[(?:[^\][\\]|\\.)*\]|(?:BT|ET|Tj|TJ|Td|TD|T\*|Tm|'|")/g;

const BREAKS = new Set(["Td", "TD", "T*", "Tm", "ET", "BT"]);

function readContentStream(text: string): string {
  let out = "";
  let pending: string[] = [];

  const flush = () => {
    if (pending.length > 0) {
      out += `${pending.join("")}\n`;
      pending = [];
    }
  };

  let match: RegExpExecArray | null;
  TOKENS.lastIndex = 0;
  while ((match = TOKENS.exec(text)) !== null) {
    const token = match[0];

    if (BREAKS.has(token)) {
      flush();
    } else if (token.startsWith("[")) {
      // A TJ array: literal strings interleaved with kerning numbers.
      const parts = token.match(/\((?:\\.|[^\\()])*\)/g) ?? [];
      pending.push(parts.map((p) => pdfUnescape(p.slice(1, -1))).join(""));
    } else if (token.startsWith("(")) {
      pending.push(pdfUnescape(token.slice(1, -1)));
    }
  }

  flush();
  return out;
}
