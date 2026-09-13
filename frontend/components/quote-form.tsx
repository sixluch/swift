"use client";

import { useState } from "react";
import { Check, Loader2, Pencil, Plus, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { config } from "@/lib/config";
import { COUNTRY_CODES, countryNameFor } from "@/lib/country-codes";
import {
  TIER_LABELS,
  TIER_OPTIONS,
  genderLabel,
  type Gender,
  type QuoteProfile,
  type Relation,
} from "@/lib/profile";
import {
  EMPTY_DRAFT,
  draftFromProfile,
  newDependant,
  readStoredProfile,
  storeProfile,
  todayIso,
  validateQuoteForm,
  type DependantDraft,
  type QuoteFormDraft,
  type QuoteFormErrors,
} from "@/lib/quote-form";
import { cn } from "@/lib/utils";

interface QuoteFormProps {
  /**
   * Null until the lead gate has been passed, which also locks the form. The
   * shell keys the form on it, so the stored draft is only read on the client
   * after hydration — never during server rendering.
   */
  leadId: string | null;
  /** The profile the results panel currently reflects, once COMPARE has run. */
  submitted: QuoteProfile | null;
  loading: boolean;
  error: string | null;
  /** Field messages from the backend — rendered under the matching input. */
  serverErrors: Record<string, string>;
  onSubmit: (profile: QuoteProfile) => void;
}

const FIELD =
  "border-white/10 bg-navy-800 text-white placeholder:text-slate-500 focus-visible:border-brand focus-visible:ring-brand/30";
const SELECT =
  "h-8 w-full rounded-lg border border-white/10 bg-navy-800 px-2.5 text-sm text-white outline-none focus-visible:border-brand disabled:cursor-not-allowed disabled:opacity-50";

/**
 * The quote form — the only way a profile or a set of quotes comes into being.
 * Collapses to a one-line summary once COMPARE has run so the chat beneath
 * gets the room; Edit reopens it prefilled.
 */
export function QuoteForm({
  leadId,
  submitted,
  loading,
  error,
  serverErrors,
  onSubmit,
}: QuoteFormProps) {
  const locked = leadId === null;

  // Prefilled from the last session's submission, if there was one.
  const [draft, setDraft] = useState<QuoteFormDraft>(() => {
    const stored = locked ? null : readStoredProfile();
    return stored ? draftFromProfile(stored) : EMPTY_DRAFT;
  });
  const [clientErrors, setClientErrors] = useState<QuoteFormErrors>({});

  // Expanded while nothing has been submitted, or while the visitor is editing
  // the submission on screen. A new submission is a new object, so it collapses
  // the form by itself; a failed COMPARE leaves `submitted` alone and the form open.
  const [editingSubmission, setEditingSubmission] = useState<QuoteProfile | null>(null);
  const editing = submitted === null || editingSubmission === submitted;

  const errors: QuoteFormErrors = { ...serverErrors, ...clientErrors };
  const disabled = locked || loading;

  function patch(update: Partial<QuoteFormDraft>) {
    setDraft((current) => ({ ...current, ...update }));
  }

  function patchDependant(id: string, update: Partial<DependantDraft>) {
    setDraft((current) => ({
      ...current,
      dependants: current.dependants.map((d) => (d.id === id ? { ...d, ...update } : d)),
    }));
  }

  function addDependant(relation: Relation) {
    setDraft((current) => ({
      ...current,
      dependants: [...current.dependants, newDependant(relation)],
    }));
  }

  function removeDependant(id: string) {
    setDraft((current) => ({
      ...current,
      dependants: current.dependants.filter((d) => d.id !== id),
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;
    const result = validateQuoteForm(draft);
    if (result.errors) {
      setClientErrors(result.errors);
      return;
    }
    setClientErrors({});
    storeProfile(result.profile);
    onSubmit(result.profile);
  }

  if (submitted && !editing) {
    return (
      <Summary
        profile={submitted}
        loading={loading}
        onEdit={() => {
          setDraft(draftFromProfile(submitted));
          setEditingSubmission(submitted);
        }}
      />
    );
  }

  const hasSpouse = draft.dependants.some((d) => d.relation === "spouse");
  const minDate = todayIso();

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="Quote form"
      className={cn("space-y-3.5", locked && "opacity-60")}
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-slate-400">YOUR QUOTE</p>
        {submitted && (
          <button
            type="button"
            onClick={() => setEditingSubmission(null)}
            className="text-[11px] text-slate-400 hover:text-slate-200"
          >
            Cancel
          </button>
        )}
      </div>

      <Field label="Full name" htmlFor="qf-name" error={errors.fullName}>
        <Input
          id="qf-name"
          autoComplete="name"
          placeholder="Your name"
          value={draft.fullName}
          disabled={disabled}
          aria-invalid={Boolean(errors.fullName)}
          onChange={(e) => patch({ fullName: e.target.value })}
          className={FIELD}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Expatriation country" htmlFor="qf-country" error={errors.country}>
          <CountrySelect
            id="qf-country"
            value={draft.country}
            disabled={disabled}
            invalid={Boolean(errors.country)}
            onChange={(iso) => patch({ country: iso })}
          />
        </Field>
        <Field label="Country of nationality" htmlFor="qf-nationality" error={errors.nationality}>
          <CountrySelect
            id="qf-nationality"
            value={draft.nationality}
            disabled={disabled}
            invalid={Boolean(errors.nationality)}
            onChange={(iso) => patch({ nationality: iso })}
          />
        </Field>
      </div>

      <div className="grid grid-cols-[1fr_4.5rem] gap-3">
        <Field label="Effective date" htmlFor="qf-date" error={errors.effectiveDate}>
          <Input
            id="qf-date"
            type="date"
            min={minDate}
            value={draft.effectiveDate}
            disabled={disabled}
            aria-invalid={Boolean(errors.effectiveDate)}
            onChange={(e) => patch({ effectiveDate: e.target.value })}
            className={cn(FIELD, "[color-scheme:dark]")}
          />
        </Field>
        <Field label="Age" htmlFor="qf-age" error={errors.age}>
          <Input
            id="qf-age"
            inputMode="numeric"
            maxLength={3}
            placeholder="34"
            value={draft.age}
            disabled={disabled}
            aria-invalid={Boolean(errors.age)}
            onChange={(e) => patch({ age: e.target.value.replace(/\D/g, "") })}
            className={FIELD}
          />
        </Field>
      </div>

      <Field label="Gender" error={errors.gender}>
        <GenderToggle
          relation="applicant"
          value={draft.gender}
          disabled={disabled}
          onChange={(gender) => patch({ gender })}
        />
      </Field>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-300">Family on the policy</span>
          <div className="flex gap-1.5">
            <AddButton
              label="Add spouse"
              disabled={disabled || hasSpouse}
              onClick={() => addDependant("spouse")}
            />
            <AddButton
              label="Add child"
              disabled={disabled}
              onClick={() => addDependant("child")}
            />
          </div>
        </div>
        {errors.dependants && <p className="text-xs text-red-400">{errors.dependants}</p>}
        {draft.dependants.map((row, index) => (
          <DependantRow
            key={row.id}
            row={row}
            disabled={disabled}
            error={errors[`dependants.${index}`]}
            onChange={(update) => patchDependant(row.id, update)}
            onRemove={() => removeDependant(row.id)}
          />
        ))}
      </div>

      <Field label="Cover level" error={errors.coverageTier}>
        <div className="grid grid-cols-2 gap-1.5">
          {TIER_OPTIONS.map((option) => {
            const active = draft.coverageTier === option.value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                onClick={() => patch({ coverageTier: option.value })}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition-colors disabled:cursor-not-allowed",
                  active
                    ? "border-brand/60 bg-brand/15 text-white"
                    : "border-white/10 bg-navy-800/60 text-slate-300 hover:bg-navy-800",
                )}
              >
                <span aria-hidden>{option.emoji}</span>
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      </Field>

      {error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
      )}

      <Button
        type="submit"
        disabled={disabled}
        className="w-full bg-brand font-semibold tracking-wide text-navy-950 hover:bg-[#69b1ee]"
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" /> Comparing…
          </>
        ) : (
          "COMPARE"
        )}
      </Button>

      <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
        <TrustItem>Compare in 3 clicks</TrustItem>
        <TrustItem>No personal data required</TrustItem>
        <TrustItem>No spam or callback</TrustItem>
      </ul>
      <p className="text-center text-[10px] leading-relaxed text-slate-500">
        For demonstration purposes only. Information and premiums displayed are illustrative,
        non-binding and do not constitute an offer of insurance. The technology and data displayed
        are proprietary to {config.brandName}. Any extraction, copying, reproduction or reuse, in
        whole or in part, is strictly prohibited.
      </p>
    </form>
  );
}

function Summary({
  profile,
  loading,
  onEdit,
}: {
  profile: QuoteProfile;
  loading: boolean;
  onEdit: () => void;
}) {
  const family =
    profile.dependants.length === 0
      ? "Just me"
      : `+${profile.dependants.length} family`;

  return (
    <div className="rounded-xl border border-brand/30 bg-brand/10 px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            {profile.fullName}, {profile.age} · {genderLabel(profile.gender, "applicant")}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-300">
            {countryNameFor(profile.country)} · {TIER_LABELS[profile.coverageTier]} · {family}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            From {formatDate(profile.effectiveDate)}
          </p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          disabled={loading}
          className="flex shrink-0 items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-white/5 disabled:opacity-50"
        >
          {loading ? <Loader2 className="size-3 animate-spin" /> : <Pencil className="size-3" />}
          Edit
        </button>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor} className="text-xs text-slate-300">
        {label}
      </Label>
      {children}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

/**
 * Native select, like the lead gate: on mobile it opens the OS picker rather
 * than a 200-row styled listbox. Options are the same ISO list the backend's
 * rate-card areas resolve against.
 */
function CountrySelect({
  id,
  value,
  disabled,
  invalid,
  onChange,
}: {
  id: string;
  value: string;
  disabled: boolean;
  invalid: boolean;
  onChange: (iso: string) => void;
}) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      aria-invalid={invalid}
      onChange={(e) => onChange(e.target.value)}
      className={cn(SELECT, invalid && "border-red-400/60")}
    >
      <option value="" disabled>
        Select…
      </option>
      {COUNTRY_CODES.map((country) => (
        <option key={country.iso} value={country.iso}>
          {country.name}
        </option>
      ))}
    </select>
  );
}

function GenderToggle({
  relation,
  value,
  disabled,
  onChange,
  compact = false,
}: {
  relation: Relation | "applicant";
  value: Gender | "";
  disabled: boolean;
  onChange: (gender: Gender) => void;
  compact?: boolean;
}) {
  const options: Gender[] = ["male", "female"];
  return (
    <div
      role="radiogroup"
      className={cn("flex gap-1.5", compact && "shrink-0")}
    >
      {options.map((gender) => {
        const active = value === gender;
        return (
          <button
            key={gender}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(gender)}
            className={cn(
              "flex items-center justify-center gap-1 rounded-lg border text-xs font-medium transition-colors disabled:cursor-not-allowed",
              compact ? "h-8 px-2.5" : "flex-1 py-1.5",
              active
                ? "border-brand/60 bg-brand/15 text-white"
                : "border-white/10 bg-navy-800/60 text-slate-300 hover:bg-navy-800",
            )}
          >
            {active && <Check aria-hidden className="size-3 text-brand" />}
            {genderLabel(gender, relation)}
          </button>
        );
      })}
    </div>
  );
}

function DependantRow({
  row,
  disabled,
  error,
  onChange,
  onRemove,
}: {
  row: DependantDraft;
  disabled: boolean;
  error?: string;
  onChange: (update: Partial<DependantDraft>) => void;
  onRemove: () => void;
}) {
  const label = row.relation === "spouse" ? "Spouse" : "Child";
  return (
    <div className="rounded-lg border border-white/10 bg-navy-800/40 px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span className="w-12 shrink-0 text-xs font-medium text-slate-200">{label}</span>
        <Input
          inputMode="numeric"
          maxLength={3}
          placeholder="Age"
          aria-label={`${label} age`}
          value={row.age}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          onChange={(e) => onChange({ age: e.target.value.replace(/\D/g, "") })}
          className={cn(FIELD, "w-16 shrink-0")}
        />
        <GenderToggle
          compact
          relation={row.relation}
          value={row.gender}
          disabled={disabled}
          onChange={(gender) => onChange({ gender })}
        />
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove ${label.toLowerCase()}`}
          className="ml-auto flex size-7 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-white/5 hover:text-white disabled:opacity-50"
        >
          <X className="size-3.5" />
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

function AddButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Plus className="size-3" />
      {label}
    </button>
  );
}

function TrustItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1">
      <ShieldCheck aria-hidden className="size-3 text-brand" />
      {children}
    </li>
  );
}
