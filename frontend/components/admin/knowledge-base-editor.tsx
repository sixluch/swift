"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { KnowledgeTextarea } from "@/components/admin/knowledge-textarea";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api-client";
import { config } from "@/lib/config";

const PLACEHOLDER = `## What the cover levels mean
Inpatient: hospital stays, surgery… Outpatient: GP visits, specialists, diagnostics…

## How ${config.brandName} works
Compare, choose, an adviser finalises the application…

## Frequently asked
Can I add my family later? What happens at renewal? …`;

/**
 * The general knowledge base — not tied to any insurer, sent to the assistant
 * on every message. Per-insurer text lives on each company's page.
 */
export function KnowledgeBaseEditor() {
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.admin
      .knowledgeBase()
      .then((result) => {
        if (!cancelled) setSaved(result.knowledgeBase);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : "Could not load the knowledge base.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (draft === null || saving) return;
    setSaving(true);
    setSaveError(null);
    setJustSaved(false);
    try {
      const result = await api.admin.saveKnowledgeBase(draft);
      setSaved(result.knowledgeBase);
      setDraft(null);
      setJustSaved(true);
    } catch (err) {
      setSaveError(
        err instanceof ApiError
          ? (err.fields?.knowledgeBase ?? err.message)
          : "Could not save the knowledge base.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <p role="alert" className="mx-auto max-w-2xl rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
        {loadError}
      </p>
    );
  }

  if (saved === null) {
    return (
      <div className="flex justify-center py-16 text-slate-400">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  const value = draft ?? saved;
  const dirty = draft !== null && draft !== saved;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="font-heading text-lg font-semibold">General knowledge base</h1>
        <p className="mt-1 text-sm text-slate-400">
          What {config.assistantName} knows on every conversation, before and after a visitor
          compares: what the cover types mean, how {config.brandName} works, common questions.
          Company-specific details go on each insurer&apos;s page and are only shown to{" "}
          {config.assistantName} when that company is quoted.
        </p>
      </div>

      <section className="rounded-xl border border-white/10 bg-navy-900 p-6">
        <KnowledgeTextarea
          value={value}
          onChange={(next) => {
            setDraft(next);
            setJustSaved(false);
            setSaveError(null);
          }}
          error={saveError ?? undefined}
          disabled={saving}
          rows={22}
          placeholder={PLACEHOLDER}
          hint={`Plain text or markdown; headings help. ${config.assistantName} answers from this and says it doesn't know when something isn't here. Saved text takes effect on the next message.`}
        />

        <div className="mt-4 flex items-center gap-3">
          <Button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="h-9 bg-brand px-4 text-navy-950 hover:bg-brand/85"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {saving ? "Saving…" : "Save"}
          </Button>
          {dirty ? (
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setSaveError(null);
              }}
              className="text-sm text-slate-400 hover:text-white"
            >
              Discard changes
            </button>
          ) : justSaved ? (
            <span className="text-sm text-brand">Saved.</span>
          ) : null}
        </div>
      </section>
    </div>
  );
}
