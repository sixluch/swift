"use client";

import { BookOpen, Building2, FileText, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { AdminInsurer } from "@/lib/admin-types";
import { cn } from "@/lib/utils";

export function InsurerList() {
  const [rows, setRows] = useState<AdminInsurer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.admin
      .insurers()
      .then((data) => {
        if (!cancelled) setRows(data.rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not load insurers.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-lg font-semibold">Insurance companies</h1>
          <p className="text-sm text-slate-400">
            Add an insurer and upload its rate-card PDF.
          </p>
        </div>

        <Link
          href="/admin/insurers/new"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-medium text-navy-950 transition hover:bg-brand/85"
        >
          <Plus className="size-4" />
          New insurance company
        </Link>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      {rows === null && !error ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : null}

      {rows?.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 bg-navy-900 px-6 py-14 text-center">
          <Building2 className="mx-auto mb-3 size-8 text-slate-600" />
          <p className="text-sm text-slate-300">No insurance companies yet.</p>
          <p className="mt-1 text-sm text-slate-500">
            Add one, then upload the rate-card PDF they sent you.
          </p>
        </div>
      ) : null}

      {rows && rows.length > 0 ? (
        <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 bg-navy-900">
          {rows.map((insurer) => (
            <li key={insurer.id}>
              <Link
                href={`/admin/insurers/${insurer.id}`}
                className="flex items-center gap-4 px-5 py-4 transition hover:bg-white/[0.03]"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand">
                  <Building2 className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{insurer.name}</span>
                  <span className="block text-xs text-slate-500">
                    Added{" "}
                    {new Date(insurer.createdAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "2-digit",
                    })}
                  </span>
                </span>
                <span
                  title={
                    insurer.knowledgeBaseChars
                      ? `Knowledge base: ${insurer.knowledgeBaseChars.toLocaleString()} characters`
                      : "No knowledge base yet"
                  }
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 text-sm",
                    insurer.knowledgeBaseChars ? "text-slate-400" : "text-slate-600",
                  )}
                >
                  <BookOpen className="size-4" />
                  {insurer.knowledgeBaseChars ? "KB" : "—"}
                </span>
                <span
                  title={`${insurer.documentCount ?? 0} stored document(s)`}
                  className="flex shrink-0 items-center gap-1.5 text-sm text-slate-400"
                >
                  <FileText className="size-4" />
                  {insurer.documentCount ?? 0}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
