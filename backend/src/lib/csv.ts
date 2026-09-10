/**
 * CSV serialisation for the admin export. Pure, so it can be run directly:
 * `node src/lib/csv.test.ts`.
 *
 * The output is opened in Excel by a broker, and every value in it was typed by
 * a member of the public — which makes formula injection the default case here,
 * not an edge case: every phone number in the table starts with "+".
 */

const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTING = /[",\n\r]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  let text: string;
  if (value instanceof Date) text = value.toISOString();
  else if (Array.isArray(value)) text = value.join(" | ");
  else text = String(value);

  // A leading =, +, - or @ makes Excel and Sheets evaluate the cell. Prefixing
  // with an apostrophe forces it to stay text; the apostrophe isn't displayed.
  if (FORMULA_START.test(text)) text = `'${text}`;
  if (NEEDS_QUOTING.test(text)) text = `"${text.replace(/"/g, '""')}"`;

  return text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ];
  // CRLF and a UTF-8 BOM: without the BOM Excel decodes the file as the local
  // ANSI codepage and mangles every non-ASCII name.
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
