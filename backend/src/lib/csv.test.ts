/**
 * Run with: cd backend && node src/lib/csv.test.ts
 * Guards the export a broker opens in Excel — formula injection above all.
 */
import assert from "node:assert/strict";
import { csvCell, toCsv } from "./csv.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

test("neutralises leading characters Excel treats as a formula", () => {
  // Every phone number in the export starts with "+".
  assert.equal(csvCell("+9613000001"), "'+9613000001");
  assert.equal(csvCell("=SUM(A1:A9)"), "'=SUM(A1:A9)");
  assert.equal(csvCell("-1+1"), "'-1+1");
  assert.equal(csvCell("@import"), "'@import");
});

test("leaves ordinary values alone", () => {
  assert.equal(csvCell("nabil@example.com"), "nabil@example.com");
  assert.equal(csvCell(34), "34");
  assert.equal(csvCell("Beirut"), "Beirut");
});

test("quotes commas, quotes and newlines", () => {
  // family_ages is free text and reliably contains commas.
  assert.equal(csvCell("partner 42, kids 10 and 7"), '"partner 42, kids 10 and 7"');
  assert.equal(csvCell('he said "hi"'), '"he said ""hi"""');
  assert.equal(csvCell("line one\nline two"), '"line one\nline two"');
});

test("a dangerous value that also needs quoting gets both treatments", () => {
  assert.equal(csvCell('=cmd|"/c calc"'), `"'=cmd|""/c calc"""`);
});

test("empty for null and undefined, not the word 'null'", () => {
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(undefined), "");
});

test("dates serialise as ISO and arrays join readably", () => {
  assert.equal(csvCell(new Date("2026-09-09T10:00:00Z")), "2026-09-09T10:00:00.000Z");
  assert.equal(csvCell(["inpatient", "outpatient"]), "inpatient | outpatient");
});

test("toCsv writes a BOM and CRLF line endings", () => {
  const csv = toCsv(["Email", "Phone"], [["a@b.com", "+9611"]]);
  assert.equal(csv.charCodeAt(0), 0xfeff, "missing BOM — Excel would mis-decode");
  assert.equal(csv, "﻿Email,Phone\r\na@b.com,'+9611\r\n");
});

console.log(`\n${passed} passed`);
