"use client";

import { FileText, Upload, X } from "lucide-react";
import { useId, useRef, useState, type DragEvent } from "react";
import { formatBytes } from "@/lib/admin-types";

/** Mirrors MAX_PDF_BYTES in backend/src/lib/pdf.ts — the backend still enforces it. */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

/**
 * Picks one PDF. Validation here is only for instant feedback; the backend
 * re-checks the magic bytes, because a `type` from the browser is just a claim.
 */
export function PdfPicker({
  file,
  onChange,
  error,
  disabled,
  label = "Rate-card PDF",
  hint,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  error?: string | null;
  disabled?: boolean;
  label?: string;
  hint?: string;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function accept(candidate: File | undefined) {
    setLocalError(null);
    if (!candidate) return;

    if (candidate.size > MAX_PDF_BYTES) {
      setLocalError(`That file is too large. The limit is ${formatBytes(MAX_PDF_BYTES)}.`);
      return;
    }
    if (candidate.type && candidate.type !== "application/pdf") {
      setLocalError("That isn't a PDF. Upload the rate-card PDF the insurer sent.");
      return;
    }
    onChange(candidate);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    accept(event.dataTransfer.files?.[0]);
  }

  const shown = error ?? localError;

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-200">
        {label}
      </label>

      {file ? (
        <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-navy-850 px-4 py-3">
          <FileText className="size-5 shrink-0 text-brand" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{file.name}</span>
            <span className="block text-xs text-slate-500">{formatBytes(file.size)}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setLocalError(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            disabled={disabled}
            aria-label={`Remove ${file.name}`}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`rounded-lg border border-dashed px-4 py-8 text-center transition ${
            dragging ? "border-brand bg-brand/5" : "border-white/15 bg-navy-850/50"
          } ${disabled ? "opacity-50" : ""}`}
        >
          <Upload className="mx-auto mb-2 size-6 text-slate-500" />
          <label
            htmlFor={inputId}
            className={`text-sm text-brand ${disabled ? "" : "cursor-pointer hover:underline"}`}
          >
            Choose a PDF
          </label>
          <span className="text-sm text-slate-500"> or drag it here</span>
          <p className="mt-1 text-xs text-slate-600">
            PDF only, up to {formatBytes(MAX_PDF_BYTES)}
          </p>
        </div>
      )}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="application/pdf,.pdf"
        disabled={disabled}
        className="sr-only"
        onChange={(e) => accept(e.target.files?.[0])}
      />

      {shown ? (
        <p role="alert" className="text-sm text-red-400">
          {shown}
        </p>
      ) : null}

      {hint && !shown ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
