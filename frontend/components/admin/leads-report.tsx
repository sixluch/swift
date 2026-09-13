"use client";

import { Download, Info, Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api-client";
import type { AdminLeadRow, AdminLeadsFilters, AdminLeadsResult } from "@/lib/admin-types";
import { countryNameFor } from "@/lib/country-codes";
import { TIER_OPTIONS, describeDependants } from "@/lib/profile";

const PAGE_SIZE = 25;

/** shadcn's secondary/ghost tokens are light-theme and disappear on navy. */
const NEUTRAL_BUTTON =
  "h-9 border border-white/10 bg-navy-850 px-3 text-slate-200 hover:bg-navy-800 hover:text-white";

const TIER_LABELS = Object.fromEntries(TIER_OPTIONS.map((o) => [o.value, o.label]));

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Distinguishes "never chatted" from "chatted but didn't reach this answer". */
function cell(row: AdminLeadRow, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return row.conversationId ? "—" : "";
  }
  return String(value);
}

export function LeadsReport() {
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [hasQuote, setHasQuote] = useState<"" | "yes" | "no">("");
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<AdminLeadsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Typing in the search box shouldn't fire a query per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const filters: AdminLeadsFilters = useMemo(
    () => ({
      q: debouncedSearch || undefined,
      from: from || undefined,
      to: to || undefined,
      hasQuote: hasQuote || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [debouncedSearch, from, to, hasQuote, page],
  );

  // Any change to the filters invalidates the page number.
  const filterKey = `${debouncedSearch}|${from}|${to}|${hasQuote}`;
  const previousKey = useRef(filterKey);
  useEffect(() => {
    if (previousKey.current !== filterKey) {
      previousKey.current = filterKey;
      setPage(1);
    }
  }, [filterKey]);

  const load = useCallback(
    (signal: AbortSignal) => {
      setLoading(true);
      api.admin
        .leads(filters, signal)
        .then((data) => {
          setResult(data);
          setError(null);
        })
        .catch((err: unknown) => {
          if ((err as Error | undefined)?.name === "AbortError") return;
          setError(err instanceof ApiError ? err.message : "Could not load leads.");
        })
        .finally(() => {
          if (!signal.aborted) setLoading(false);
        });
    },
    [filters],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const total = result?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = result?.rows ?? [];

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-lg font-semibold">Leads</h1>
          <p className="text-sm text-slate-400">
            {loading && !result
              ? "Loading…"
              : `${total} ${total === 1 ? "lead" : "leads"} matching these filters`}
          </p>
        </div>

        {/* A link, not a fetch: the browser downloads it and still sends the cookie. */}
        <a
          href={api.admin.leadsCsvUrl(filters)}
          download
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-medium text-navy-950 transition hover:bg-brand/85"
        >
          <Download className="size-4" />
          Export CSV
        </a>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-navy-900 p-4">
        <div className="min-w-56 flex-1 space-y-1.5">
          <label htmlFor="lead-search" className="text-xs text-slate-400">
            Search email, phone or name
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
            <Input
              id="lead-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="nabil@example.com"
              className="border-white/10 bg-navy-850 pl-9"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="lead-from" className="text-xs text-slate-400">
            From
          </label>
          <Input
            id="lead-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border-white/10 bg-navy-850"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="lead-to" className="text-xs text-slate-400">
            To
          </label>
          <Input
            id="lead-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border-white/10 bg-navy-850"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="lead-quoted" className="text-xs text-slate-400">
            Quoted
          </label>
          <select
            id="lead-quoted"
            value={hasQuote}
            onChange={(e) => setHasQuote(e.target.value as "" | "yes" | "no")}
            className="h-9 rounded-md border border-white/10 bg-navy-850 px-3 text-sm text-slate-100"
          >
            <option value="">Any</option>
            <option value="yes">Got quotes</option>
            <option value="no">No quotes</option>
          </select>
        </div>

        {search || from || to || hasQuote ? (
          <Button
            variant="ghost"
            className={NEUTRAL_BUTTON}
            onClick={() => {
              setSearch("");
              setFrom("");
              setTo("");
              setHasQuote("");
            }}
          >
            Clear
          </Button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-white/10 bg-navy-900">
        <table className="w-full min-w-[1140px] text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="w-10 px-3 py-3 font-medium">
                <span className="sr-only">Details</span>
              </th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Lives in</th>
              <th className="px-4 py-3 font-medium">Nationality</th>
              <th className="px-4 py-3 font-medium">Age</th>
              <th className="px-4 py-3 font-medium">Family</th>
              <th className="px-4 py-3 font-medium">Cover</th>
              <th className="px-4 py-3 font-medium">Send by</th>
              <th className="px-4 py-3 text-right font-medium">Msgs</th>
              <th className="px-4 py-3 text-right font-medium">Quotes</th>
              <th className="px-4 py-3 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                <td className="px-3 py-3">
                  <Link
                    href={`/admin/leads/${row.id}`}
                    title={`Show details for ${row.email}`}
                    aria-label={`Show details for ${row.email}`}
                    className="inline-flex size-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-brand/15 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    <Info className="size-4" />
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                  <Link href={`/admin/leads/${row.id}`} className="hover:text-brand hover:underline">
                    {formatDate(row.createdAt)}
                  </Link>
                </td>
                <td className="px-4 py-3">{row.email}</td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums">{row.phone}</td>
                <td className="px-4 py-3">{cell(row, row.fullName)}</td>
                <td className="px-4 py-3">{row.country ? countryNameFor(row.country) : cell(row, null)}</td>
                <td className="px-4 py-3">
                  {row.nationality ? countryNameFor(row.nationality) : cell(row, null)}
                </td>
                <td className="px-4 py-3 tabular-nums">{cell(row, row.age)}</td>
                <td className="px-4 py-3" title={row.dependants?.length ? describeDependants(row.dependants) : undefined}>
                  {cell(row, row.dependants ? (row.dependants.length > 0 ? `+${row.dependants.length}` : "Just me") : null)}
                </td>
                <td className="px-4 py-3">
                  {cell(row, row.coverageTier ? TIER_LABELS[row.coverageTier] : null)}
                </td>
                <td className="px-4 py-3 capitalize">{cell(row, row.deliveryChannel)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-400">
                  {row.messageCount ?? 0}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {row.quoteCount ? (
                    <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs text-brand">
                      {row.quoteCount}
                    </span>
                  ) : (
                    <span className="text-slate-600">0</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-400">{row.source ?? "—"}</td>
              </tr>
            ))}

            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={14} className="px-4 py-10 text-center text-slate-400">
                  No leads match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        {loading ? (
          <div className="flex items-center justify-center gap-2 border-t border-white/10 py-3 text-sm text-slate-400">
            <Loader2 className="size-4 animate-spin" />
            Loading
          </div>
        ) : null}
      </div>

      {pageCount > 1 ? (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>
            Page {page} of {pageCount}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className={NEUTRAL_BUTTON}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              className={NEUTRAL_BUTTON}
              disabled={page >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
