"use client";

import { ChevronRight, ExternalLink, FileText, Loader2, Table2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { KNOWLEDGE_PLACEHOLDER } from "@/components/admin/insurer-form";
import { KnowledgeTextarea } from "@/components/admin/knowledge-textarea";
import { PdfPicker } from "@/components/admin/pdf-picker";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api-client";
import {
  formatBytes,
  type AdminInsurerDetail,
  type AdminRateCardSummary,
  type ParseSummary,
} from "@/lib/admin-types";

const STATUS_LABELS: Record<string, string> = {
  pending: "Not parsed yet",
  parsed: "Parsed",
  parsed_with_warnings: "Parsed, with warnings",
  failed: "Parsing failed",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function InsurerDetail({ insurerId }: { insurerId: string }) {
  const [detail, setDetail] = useState<
    (AdminInsurerDetail & { rateCards?: AdminRateCardSummary[] }) | null
  >(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [parsing, setParsing] = useState<string | null>(null);
  const [summary, setSummary] = useState<ParseSummary | null>(null);

  // null = the admin hasn't touched it; the saved value shows until they do.
  const [knowledgeDraft, setKnowledgeDraft] = useState<string | null>(null);
  const [savingKnowledge, setSavingKnowledge] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null);
  const [knowledgeSaved, setKnowledgeSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      setDetail(await api.admin.insurer(insurerId));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load this company.");
    }
  }, [insurerId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload() {
    if (!file || uploading) return;
    setUploading(true);
    setUploadError(null);
    setNotice(null);

    const replacing = detail?.documents.some((d) => d.filename === file.name);
    try {
      await api.admin.uploadInsurerDocument(insurerId, file);
      setFile(null);
      setNotice(replacing ? `Replaced ${file.name}.` : `Uploaded ${file.name}.`);
      await load();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Could not upload that file.");
    } finally {
      setUploading(false);
    }
  }

  async function parse(documentId: string, filename: string) {
    if (parsing) return;
    setParsing(documentId);
    setUploadError(null);
    setNotice(null);
    setSummary(null);
    try {
      const { summary: result } = await api.admin.parseDocument(insurerId, documentId);
      setSummary(result);
      await load();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : `Could not parse ${filename}.`);
    } finally {
      setParsing(null);
    }
  }

  async function remove(documentId: string, filename: string) {
    if (deleting) return;
    if (!window.confirm(`Remove ${filename}? The stored PDF is deleted.`)) return;

    setDeleting(documentId);
    setNotice(null);
    try {
      await api.admin.deleteInsurerDocument(insurerId, documentId);
      setNotice(`Removed ${filename}.`);
      await load();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Could not remove that file.");
    } finally {
      setDeleting(null);
    }
  }

  async function saveKnowledge() {
    if (knowledgeDraft === null || savingKnowledge) return;
    setSavingKnowledge(true);
    setKnowledgeError(null);
    setKnowledgeSaved(false);
    try {
      const { insurer } = await api.admin.updateInsurer(insurerId, {
        knowledgeBase: knowledgeDraft,
      });
      setDetail((current) => (current ? { ...current, insurer } : current));
      setKnowledgeDraft(null);
      setKnowledgeSaved(true);
    } catch (err) {
      setKnowledgeError(
        err instanceof ApiError
          ? (err.fields?.knowledgeBase ?? err.message)
          : "Could not save the knowledge base.",
      );
    } finally {
      setSavingKnowledge(false);
    }
  }

  if (loadError) {
    return (
      <p role="alert" className="mx-auto max-w-2xl rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
        {loadError}
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

  const { insurer, documents, rateCards } = detail;
  const willReplace = file ? documents.some((d) => d.filename === file.name) : false;
  const savedKnowledge = insurer.knowledgeBase ?? "";
  const knowledgeValue = knowledgeDraft ?? savedKnowledge;
  const knowledgeDirty = knowledgeDraft !== null && knowledgeDraft !== savedKnowledge;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/admin/insurers" className="text-sm text-brand hover:underline">
          ← Insurance companies
        </Link>
        <h1 className="mt-2 font-heading text-lg font-semibold">{insurer.name}</h1>
        <p className="text-sm text-slate-400">Added {formatDateTime(insurer.createdAt)}</p>
      </div>

      <section className="rounded-xl border border-white/10 bg-navy-900 p-6">
        <h2 className="mb-1 text-sm font-medium text-slate-300">Knowledge base</h2>
        <p className="mb-4 text-xs text-slate-500">
          What the assistant knows about {insurer.name}. It reads this only while one of{" "}
          {insurer.name}&apos;s plans is on a visitor&apos;s screen, and answers cover
          questions from it — anything not written here, it says it doesn&apos;t know.
        </p>

        <KnowledgeTextarea
          value={knowledgeValue}
          onChange={(next) => {
            setKnowledgeDraft(next);
            setKnowledgeSaved(false);
            setKnowledgeError(null);
          }}
          error={knowledgeError ?? undefined}
          disabled={savingKnowledge}
          placeholder={KNOWLEDGE_PLACEHOLDER}
          hint="Plain text or markdown; headings help the assistant find things. Saved text takes effect on the visitor's next message."
        />

        <div className="mt-4 flex items-center gap-3">
          <Button
            type="button"
            onClick={saveKnowledge}
            disabled={!knowledgeDirty || savingKnowledge}
            className="h-9 bg-brand px-4 text-navy-950 hover:bg-brand/85"
          >
            {savingKnowledge ? <Loader2 className="size-4 animate-spin" /> : null}
            {savingKnowledge ? "Saving…" : "Save knowledge base"}
          </Button>
          {knowledgeDirty ? (
            <button
              type="button"
              onClick={() => {
                setKnowledgeDraft(null);
                setKnowledgeError(null);
              }}
              className="text-sm text-slate-400 hover:text-white"
            >
              Discard changes
            </button>
          ) : knowledgeSaved ? (
            <span className="text-sm text-brand">Saved.</span>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-navy-900 p-6">
        <h2 className="mb-4 text-sm font-medium text-slate-300">Upload a rate card</h2>

        <PdfPicker
          file={file}
          onChange={(next) => {
            setFile(next);
            setUploadError(null);
            setNotice(null);
          }}
          disabled={uploading}
          label="Rate-card PDF"
          hint={
            willReplace
              ? undefined
              : "Stored as-is for audit, then parse it into rate tables below."
          }
        />

        {willReplace ? (
          <p className="mt-2 text-xs text-amber-300">
            A file called {file?.name} is already stored — uploading replaces it.
          </p>
        ) : null}

        {uploadError ? (
          <p role="alert" className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {uploadError}
          </p>
        ) : null}

        {notice ? (
          <p className="mt-3 rounded-lg border border-brand/30 bg-brand/10 p-3 text-sm text-brand">
            {notice}
          </p>
        ) : null}

        <Button
          type="button"
          onClick={upload}
          disabled={!file || uploading}
          className="mt-4 h-9 bg-brand px-4 text-navy-950 hover:bg-brand/85"
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : null}
          {uploading ? "Uploading…" : willReplace ? "Replace file" : "Upload"}
        </Button>
      </section>

      {summary ? (
        <section className="rounded-xl border border-brand/30 bg-brand/[0.06] p-5">
          <h2 className="mb-3 text-sm font-medium text-brand">
            {summary.replacedPrevious ? "Rate card re-parsed" : "Rate card parsed"} —{" "}
            {summary.productName}
          </h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            {[
              ["Areas", summary.areas],
              ["Plan tiers", summary.plans],
              ["Premiums", summary.premiums],
              ["Countries", summary.countries],
              ["Optional benefits", summary.benefits],
              ["Payment surcharges", summary.surcharges],
              ["Deductible rows", summary.deductibles],
              ["Region discounts", summary.restrictions],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
                <dd className="tabular-nums text-slate-100">{value}</dd>
              </div>
            ))}
          </dl>

          {summary.warnings.length > 0 ? (
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-sm font-medium text-amber-200">
                {summary.warnings.length}{" "}
                {summary.warnings.length === 1 ? "thing needs" : "things need"} a look
              </p>
              <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs text-amber-200/90">
                {summary.warnings.slice(0, 8).map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
              {summary.warnings.length > 8 ? (
                <p className="mt-1 text-xs text-amber-200/70">
                  …and {summary.warnings.length - 8} more.
                </p>
              ) : null}
            </div>
          ) : null}

          <Link
            href={`/admin/rate-cards/${summary.rateCardId}`}
            className="mt-4 inline-flex h-9 items-center rounded-lg bg-brand px-3 text-sm font-medium text-navy-950 transition hover:bg-brand/85"
          >
            Open rate card
          </Link>
        </section>
      ) : null}

      {rateCards && rateCards.length > 0 ? (
        <section className="rounded-xl border border-white/10 bg-navy-900">
          <h2 className="border-b border-white/10 px-5 py-3 text-sm font-medium text-slate-300">
            Rate cards <span className="text-slate-500">({rateCards.length})</span>
          </h2>
          <ul className="divide-y divide-white/5">
            {rateCards.map((rateCard) => (
              <li key={rateCard.id}>
                <Link
                  href={`/admin/rate-cards/${rateCard.id}`}
                  className="flex items-center gap-3 px-5 py-4 transition hover:bg-white/[0.03]"
                >
                  <Table2 className="size-5 shrink-0 text-brand" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{rateCard.productName}</span>
                    <span className="block text-xs text-slate-500">
                      {rateCard.currency} · {rateCard.premiumBasis} premiums · parsed{" "}
                      {formatDateTime(rateCard.parsedAt)}
                      {rateCard.warnings.length > 0
                        ? ` · ${rateCard.warnings.length} warning(s)`
                        : ""}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-slate-500" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl border border-white/10 bg-navy-900">
        <h2 className="border-b border-white/10 px-5 py-3 text-sm font-medium text-slate-300">
          Stored documents <span className="text-slate-500">({documents.length})</span>
        </h2>

        {documents.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">
            No rate card uploaded yet.
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {documents.map((document) => (
              <li key={document.id} className="flex items-center gap-3 px-5 py-4">
                <FileText className="size-5 shrink-0 text-brand" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{document.filename}</p>
                  <p className="text-xs text-slate-500">
                    {formatBytes(document.byteSize)} · uploaded{" "}
                    {formatDateTime(document.uploadedAt)} ·{" "}
                    <span className={document.parseStatus === "pending" ? "text-slate-400" : ""}>
                      {STATUS_LABELS[document.parseStatus] ?? document.parseStatus}
                    </span>
                  </p>
                  {/* The hash is how you prove a stored file is the one the insurer sent. */}
                  <p className="mt-0.5 truncate font-mono text-[10px] text-slate-600">
                    sha256 {document.sha256}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => parse(document.id, document.filename)}
                  disabled={parsing !== null}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-brand/40 bg-brand/10 px-2.5 text-xs font-medium text-brand transition hover:bg-brand/20 disabled:opacity-50"
                >
                  {parsing === document.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Table2 className="size-3.5" />
                  )}
                  {document.parseStatus === "pending" ? "Parse rate card" : "Re-parse"}
                </button>

                <a
                  href={api.admin.insurerDocumentUrl(insurerId, document.id)}
                  target="_blank"
                  rel="noreferrer"
                  title={`Open ${document.filename}`}
                  aria-label={`Open ${document.filename}`}
                  className="rounded-md p-1.5 text-slate-400 transition hover:bg-white/5 hover:text-brand"
                >
                  <ExternalLink className="size-4" />
                </a>
                <button
                  type="button"
                  onClick={() => remove(document.id, document.filename)}
                  disabled={deleting === document.id}
                  title={`Remove ${document.filename}`}
                  aria-label={`Remove ${document.filename}`}
                  className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                >
                  {deleting === document.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
