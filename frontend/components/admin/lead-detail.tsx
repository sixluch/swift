"use client";

import { Keyboard, Loader2, Mic } from "lucide-react";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { AdminLeadDetail } from "@/lib/admin-types";
import { config } from "@/lib/config";
import { countryNameFor } from "@/lib/country-codes";
import { TIER_OPTIONS, describeDependants, genderLabel } from "@/lib/profile";
import type { Quote } from "@/lib/types";

const TIER_LABELS = Object.fromEntries(TIER_OPTIONS.map((o) => [o.value, o.label]));

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/**
 * The provider snapshot is stored as JSONB, so it's `unknown` until checked.
 *
 * Snapshots taken before rate cards landed carry `monthlyPremium` and no basis;
 * they are normalised here rather than migrated, because a stored quote is a
 * record of what the visitor was actually shown and shouldn't be rewritten.
 */
function asQuotes(value: unknown): Quote[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((q): q is Record<string, unknown> => Boolean(q) && typeof q === "object")
    .filter((q) => "insurer" in q)
    .map((q) => {
      const legacy = q as { monthlyPremium?: number };
      return {
        ...q,
        premium: typeof q.premium === "number" ? q.premium : (legacy.monthlyPremium ?? 0),
        premiumBasis: q.premiumBasis === "annual" ? "annual" : "monthly",
      } as Quote;
    });
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-100">
        {value === null || value === undefined || value === "" ? (
          <span className="text-slate-600">—</span>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

export function LeadDetail({ leadId }: { leadId: string }) {
  const [detail, setDetail] = useState<AdminLeadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.admin
      .lead(leadId)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not load this lead.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  if (error) {
    return (
      <p role="alert" className="mx-auto max-w-3xl rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
        {error}
      </p>
    );
  }

  if (!detail) {
    return (
      <div className="flex justify-center py-16 text-slate-400">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  const { lead, conversation, messages, quoteRequests } = detail;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-heading text-lg font-semibold">{conversation?.fullName ?? lead.email}</h1>
        <p className="text-sm text-slate-400">Lead created {formatDateTime(lead.createdAt)}</p>
      </div>

      <section className="rounded-xl border border-white/10 bg-navy-900 p-5">
        <h2 className="mb-4 text-sm font-medium text-slate-300">Details</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
          <Field label="Email" value={lead.email} />
          <Field label="Phone" value={lead.phone} />
          <Field label="Source" value={lead.source} />
          <Field label="Name" value={conversation?.fullName} />
          <Field label="Lives in" value={conversation?.country ? countryNameFor(conversation.country) : null} />
          <Field
            label="Nationality"
            value={conversation?.nationality ? countryNameFor(conversation.nationality) : null}
          />
          <Field label="Age" value={conversation?.age} />
          <Field
            label="Gender"
            value={conversation?.gender ? genderLabel(conversation.gender, "applicant") : null}
          />
          <Field label="Start date" value={conversation?.effectiveDate} />
          <Field
            label="Family on the policy"
            value={
              conversation
                ? conversation.dependants?.length
                  ? describeDependants(conversation.dependants)
                  : "Just me"
                : null
            }
          />
          <Field
            label="Cover level"
            value={conversation?.coverageTier ? TIER_LABELS[conversation.coverageTier] : null}
          />
          <Field label="Send comparison by" value={conversation?.deliveryChannel} />
          <Field label="Chat started" value={conversation ? formatDateTime(conversation.startedAt) : null} />
        </dl>
      </section>

      <section className="rounded-xl border border-white/10 bg-navy-900">
        <h2 className="border-b border-white/10 px-5 py-3 text-sm font-medium text-slate-300">
          Transcript{" "}
          <span className="text-slate-500">
            ({messages.length} {messages.length === 1 ? "message" : "messages"})
          </span>
        </h2>

        {messages.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">
            This lead submitted the form but never sent a message.
          </p>
        ) : (
          <ol className="space-y-4 p-5">
            {messages.map((message) => {
              const fromUser = message.role === "user";
              return (
                <li
                  key={message.id}
                  className={`flex flex-col gap-1 ${fromUser ? "items-end" : "items-start"}`}
                >
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span>{fromUser ? "Visitor" : config.assistantName}</span>
                    <span>{formatTime(message.createdAt)}</span>
                    {/* input_mode is why this column exists — voice vs typed conversion. */}
                    {fromUser && message.inputMode ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-1.5 py-0.5">
                        {message.inputMode === "voice" ? (
                          <Mic className="size-3" />
                        ) : (
                          <Keyboard className="size-3" />
                        )}
                        {message.inputMode}
                      </span>
                    ) : null}
                  </div>
                  <p
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
                      fromUser
                        ? "rounded-br-sm bg-brand/15 text-slate-100"
                        : "rounded-bl-sm bg-navy-850 text-slate-200"
                    }`}
                  >
                    {message.content}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="rounded-xl border border-white/10 bg-navy-900">
        <h2 className="border-b border-white/10 px-5 py-3 text-sm font-medium text-slate-300">
          Quotations shown{" "}
          <span className="text-slate-500">({quoteRequests.length})</span>
        </h2>

        {quoteRequests.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">
            No quotations were generated in this conversation.
          </p>
        ) : (
          <div className="space-y-5 p-5">
            {quoteRequests.map((request) => {
              const quotes = asQuotes(request.quotesReturned);
              return (
                <div key={request.id}>
                  <p className="mb-2 text-xs text-slate-500">
                    {formatDateTime(request.createdAt)} · {request.name ?? "—"}, age{" "}
                    {request.age ?? "—"} · {request.coverageType.join(", ") || "—"}
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-white/10">
                    <table className="w-full min-w-[600px] text-left text-sm">
                      <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Insurer</th>
                          <th className="px-3 py-2 font-medium">Plan</th>
                          <th className="px-3 py-2 font-medium">Covers</th>
                          <th className="px-3 py-2 text-right font-medium">Premium</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quotes.map((quote) => (
                          <tr key={quote.id} className="border-b border-white/5 last:border-0">
                            <td className="px-3 py-2">{quote.insurer}</td>
                            <td className="px-3 py-2 text-slate-300">{quote.planName}</td>
                            <td className="px-3 py-2 text-slate-400">{quote.coverageSummary}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                              {quote.currency} {quote.premium.toLocaleString()}
                              <span className="ml-1 text-slate-500">
                                {quote.premiumBasis === "annual" ? "/yr" : "/mo"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
