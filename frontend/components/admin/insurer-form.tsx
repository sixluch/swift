"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { KnowledgeTextarea } from "@/components/admin/knowledge-textarea";
import { PdfPicker } from "@/components/admin/pdf-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api-client";

export const KNOWLEDGE_PLACEHOLDER = `## About the company
Who they are, where they're licensed, who the plans are for.

## What the plans cover
Inpatient, outpatient, dental, maternity — limits, deductibles, co-pays.

## Exclusions and waiting periods
Pre-existing conditions, waiting periods, age limits.

## Claims and network
How to claim, direct billing, hospital network.`;

/**
 * Creates an insurance company and, if one was chosen, uploads its rate-card
 * PDF in the same submit. Two requests, because the file needs the insurer's id.
 */
export function InsurerForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [knowledgeBase, setKnowledgeBase] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  /** Set when the company saved but its file didn't — the company is not lost. */
  const [partial, setPartial] = useState<{ id: string; reason: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setErrors({});
    setFormError(null);
    setPartial(null);
    setSubmitting(true);

    let insurerId: string;
    try {
      const { insurer } = await api.admin.createInsurer(name.trim(), knowledgeBase);
      insurerId = insurer.id;
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields ?? {});
        if (!err.fields) setFormError(err.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
      setSubmitting(false);
      return;
    }

    if (file) {
      try {
        await api.admin.uploadInsurerDocument(insurerId, file);
      } catch (err) {
        // The insurer exists now. Say so and point at it rather than pretending
        // the whole submit failed and inviting a duplicate.
        setPartial({
          id: insurerId,
          reason: err instanceof ApiError ? err.message : "The upload failed.",
        });
        setSubmitting(false);
        return;
      }
    }

    router.replace(`/admin/insurers/${insurerId}`);
  }

  if (partial) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="font-heading text-lg font-semibold">Company saved, file didn&apos;t upload</h1>
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <strong className="font-medium">{name.trim()}</strong> was created, but the PDF
          didn&apos;t upload: {partial.reason}
        </p>
        <Link
          href={`/admin/insurers/${partial.id}`}
          className="inline-flex h-9 items-center rounded-lg bg-brand px-3 text-sm font-medium text-navy-950 transition hover:bg-brand/85"
        >
          Open {name.trim()} and try again
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <Link href="/admin/insurers" className="text-sm text-brand hover:underline">
          ← Insurance companies
        </Link>
        <h1 className="mt-2 font-heading text-lg font-semibold">New insurance company</h1>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-5 rounded-xl border border-white/10 bg-navy-900 p-6"
      >
        <div className="space-y-2">
          <Label htmlFor="insurer-name">Insurance company name</Label>
          <Input
            id="insurer-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VUMI"
            autoComplete="off"
            required
            className="border-white/10 bg-navy-850"
          />
          {errors.name ? (
            <p role="alert" className="text-sm text-red-400">
              {errors.name}
            </p>
          ) : null}
        </div>

        <div className="border-t border-white/10 pt-5">
          <KnowledgeTextarea
            value={knowledgeBase}
            onChange={setKnowledgeBase}
            error={errors.knowledgeBase}
            disabled={submitting}
            rows={12}
            placeholder={KNOWLEDGE_PLACEHOLDER}
            hint="Optional — what the assistant knows about this company when one of its plans is on a visitor's screen. Plain text or markdown; headings help. You can edit it any time from the company's page."
          />
        </div>

        <div className="border-t border-white/10 pt-5">
          <PdfPicker
            file={file}
            onChange={setFile}
            error={errors.file}
            disabled={submitting}
            hint="Optional — you can add it later. Nothing is parsed yet; the file is stored as-is."
          />
        </div>

        {formError ? (
          <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {formError}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <Button
            type="submit"
            disabled={submitting || name.trim().length < 2}
            className="h-9 bg-brand px-4 text-navy-950 hover:bg-brand/85"
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            {submitting ? "Saving…" : "Create company"}
          </Button>
          <Link href="/admin/insurers" className="text-sm text-slate-400 hover:text-white">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
