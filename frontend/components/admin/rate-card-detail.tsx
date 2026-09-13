"use client";

import { AlertTriangle, Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api-client";
import type { AdminRateCardDetail, SectionEdit } from "@/lib/admin-types";
import { countryNameFor } from "@/lib/country-codes";

const KIND_LABELS: Record<string, string> = {
  deductible: "Deductible (excess per person)",
  outpatient_excess: "Outpatient per-visit excess",
  outpatient_coinsurance: "Outpatient coinsurance",
};

/** Draft values keyed by `${table}:${id}:${field}` so a single Save posts them all. */
type Draft = Record<string, string | boolean>;

function money(value: number, currency: string): string {
  return `${currency === "USD" ? "$" : `${currency} `}${value.toLocaleString()}`;
}

export function RateCardDetail({ rateCardId }: { rateCardId: string }) {
  const [detail, setDetail] = useState<AdminRateCardDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [areaId, setAreaId] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await api.admin.rateCard(rateCardId);
      setDetail(next);
      setAreaId((current) => current ?? next.areas[0]?.id ?? null);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load this rate card.");
    }
  }, [rateCardId]);

  useEffect(() => {
    void load();
  }, [load]);

  const bands = useMemo(() => {
    if (!detail) return [];
    const seen = new Map<number, { ageMin: number; ageMax: number }>();
    for (const p of detail.premiums) {
      if (!seen.has(p.ageMin)) seen.set(p.ageMin, { ageMin: p.ageMin, ageMax: p.ageMax });
    }
    return [...seen.values()].sort((a, b) => a.ageMin - b.ageMin);
  }, [detail]);

  /** area+plan+ageMin → premium, so the table renders without scanning 490 rows per cell. */
  const premiumIndex = useMemo(() => {
    const index = new Map<string, number>();
    for (const p of detail?.premiums ?? []) {
      index.set(`${p.rateAreaId}:${p.ratePlanId}:${p.ageMin}`, p.premium);
    }
    return index;
  }, [detail]);

  function set(key: string, value: string | boolean) {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice(null);
  }

  const edits: SectionEdit[] = useMemo(() => {
    const byRow = new Map<string, SectionEdit>();

    for (const [key, value] of Object.entries(draft)) {
      const [table, id, field] = key.split(":");
      const existing = byRow.get(`${table}:${id}`) ?? ({ table, id } as SectionEdit);
      const next = existing as Record<string, unknown>;

      if (field === "available") next.available = Boolean(value);
      else {
        const numeric = Number(value);
        // A field cleared or mid-typing ("1.") is left out rather than sent as NaN.
        if (Number.isFinite(numeric)) next[field] = numeric;
      }

      byRow.set(`${table}:${id}`, existing);
    }

    return [...byRow.values()].filter(
      (edit) => Object.keys(edit).length > 2, // more than {table, id}
    );
  }, [draft]);

  async function save() {
    if (edits.length === 0 || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await api.admin.saveRateCardSections(rateCardId, edits);
      setDraft({});
      setNotice(`Saved ${result.applied} change${result.applied === 1 ? "" : "s"}.`);
      await load();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Could not save those changes.");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <p role="alert" className="mx-auto max-w-3xl rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
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

  const { card, plans, areas, countries, restrictions, benefits, surcharges, deductibles } = detail;
  const area = areas.find((a) => a.id === areaId) ?? areas[0];
  const areaCountries = countries.filter((c) => c.rateAreaId === area?.id);
  const areaRestrictions = restrictions.filter((r) => r.rateAreaId === area?.id);
  const unmatched = countries.filter((c) => !c.countryIso);

  const value = (key: string, fallback: string | boolean) =>
    key in draft ? draft[key] : fallback;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-24">
      <div>
        <Link href={`/admin/insurers/${card.insurerId}`} className="text-sm text-brand hover:underline">
          ← {card.insurerName}
        </Link>
        <h1 className="mt-2 font-heading text-lg font-semibold">{card.productName}</h1>
        <p className="text-sm text-slate-400">
          {card.currency} · {card.premiumBasis} premiums · {areas.length} areas ·{" "}
          {detail.premiums.length} rates · {countries.length} countries
          {card.sourceFilename ? ` · from ${card.sourceFilename}` : ""}
        </p>
      </div>

      {card.warnings.length > 0 ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-200">
            <AlertTriangle className="size-4" />
            {card.warnings.length} thing{card.warnings.length === 1 ? "" : "s"} the parser
            couldn&apos;t account for
          </p>
          <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-amber-200/90">
            {card.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {unmatched.length > 0 ? (
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-3 text-xs text-amber-200/90">
          {unmatched.length} country name{unmatched.length === 1 ? "" : "s"} could not be matched to
          a country code, so {unmatched.length === 1 ? "it" : "they"} will not price:{" "}
          {unmatched.map((c) => c.printedName).join(", ")}.
        </p>
      ) : null}

      {/* ---- Premiums ---- */}
      <section className="rounded-xl border border-white/10 bg-navy-900">
        <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-5 py-3">
          <h2 className="text-sm font-medium text-slate-300">Premiums</h2>
          <div className="ml-auto flex items-center gap-2">
            <label htmlFor="area-select" className="text-xs text-slate-500">
              Area
            </label>
            <select
              id="area-select"
              value={area?.id ?? ""}
              onChange={(e) => setAreaId(e.target.value)}
              className="h-8 rounded-md border border-white/10 bg-navy-850 px-2 text-sm text-slate-100"
            >
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  Area {a.areaCode}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-2.5 font-medium">Ages</th>
                {plans.map((plan) => (
                  <th key={plan.id} className="px-4 py-2.5 text-right font-medium">
                    {plan.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bands.map((band) => (
                <tr key={band.ageMin} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-2 text-slate-400 tabular-nums">
                    {band.ageMin}–{band.ageMax}
                  </td>
                  {plans.map((plan) => {
                    const premium = premiumIndex.get(`${area?.id}:${plan.id}:${band.ageMin}`);
                    return (
                      <td key={plan.id} className="px-4 py-2 text-right tabular-nums">
                        {premium === undefined ? (
                          <span className="text-slate-600">—</span>
                        ) : (
                          money(premium, card.currency)
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-white/10 px-5 py-3 text-xs text-slate-500">
          Area {area?.areaCode}: {areaCountries.length} countr
          {areaCountries.length === 1 ? "y" : "ies"} —{" "}
          {areaCountries
            .slice(0, 12)
            .map((c) => (c.countryIso ? countryNameFor(c.countryIso) : c.printedName))
            .join(", ")}
          {areaCountries.length > 12 ? ` …and ${areaCountries.length - 12} more` : ""}
        </div>
      </section>

      {/* ---- Optional benefits ---- */}
      <section className="rounded-xl border border-white/10 bg-navy-900">
        <div className="border-b border-white/10 px-5 py-3">
          <h2 className="text-sm font-medium text-slate-300">Optional benefits</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Tick the ones this insurer offers. Amounts are editable.
          </p>
        </div>
        <ul className="divide-y divide-white/5">
          {benefits.map((benefit) => {
            const availableKey = `benefit:${benefit.id}:available`;
            const amountKey = `benefit:${benefit.id}:amount`;
            return (
              <li key={benefit.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <input
                  type="checkbox"
                  id={availableKey}
                  checked={Boolean(value(availableKey, benefit.available))}
                  onChange={(e) => set(availableKey, e.target.checked)}
                  className="size-4 accent-[#4A9FE8]"
                />
                <label htmlFor={availableKey} className="min-w-0 flex-1 text-sm">
                  {benefit.label}
                  {benefit.onlyPlans.length > 0 ? (
                    <span className="ml-2 rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] uppercase text-slate-400">
                      {benefit.onlyPlans.join("/")} only
                    </span>
                  ) : null}
                  {benefit.excludedPlans.length > 0 ? (
                    <span className="ml-2 rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] uppercase text-slate-400">
                      not in {benefit.excludedPlans.join("/")}
                    </span>
                  ) : null}
                </label>
                <div className="flex items-center gap-1.5">
                  {benefit.unit === "currency" ? (
                    <span className="text-sm text-slate-500">{card.currency}</span>
                  ) : null}
                  <Input
                    type="number"
                    step="0.01"
                    aria-label={`${benefit.label} amount`}
                    value={String(value(amountKey, benefit.amount))}
                    onChange={(e) => set(amountKey, e.target.value)}
                    className="h-8 w-24 border-white/10 bg-navy-850 text-right"
                  />
                  {benefit.unit === "percent" ? (
                    <span className="text-sm text-slate-500">%</span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ---- Payment surcharges ---- */}
      <section className="rounded-xl border border-white/10 bg-navy-900">
        <div className="border-b border-white/10 px-5 py-3">
          <h2 className="text-sm font-medium text-slate-300">Payment surcharges</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Added to the premium when paid on that frequency.
          </p>
        </div>
        <ul className="divide-y divide-white/5">
          {surcharges.map((surcharge) => {
            const key = `surcharge:${surcharge.id}:percent`;
            return (
              <li key={surcharge.id} className="flex items-center gap-3 px-5 py-3">
                <span className="flex-1 text-sm">{surcharge.label}</span>
                <Input
                  type="number"
                  step="0.01"
                  aria-label={`${surcharge.label} surcharge`}
                  value={String(value(key, surcharge.percent))}
                  onChange={(e) => set(key, e.target.value)}
                  className="h-8 w-24 border-white/10 bg-navy-850 text-right"
                />
                <span className="text-sm text-slate-500">%</span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ---- Deductibles / excess / coinsurance ---- */}
      <section className="rounded-xl border border-white/10 bg-navy-900">
        <div className="border-b border-white/10 px-5 py-3">
          <h2 className="text-sm font-medium text-slate-300">
            Deductibles, outpatient excess and coinsurance
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Each row reduces the premium by its percentage. A quote uses one row only — these do
            not stack.
          </p>
        </div>

        {(["deductible", "outpatient_excess", "outpatient_coinsurance"] as const).map((kind) => {
          const rows = deductibles.filter((d) => d.kind === kind);
          if (rows.length === 0) return null;
          return (
            <div key={kind}>
              <p className="border-y border-white/5 bg-white/[0.02] px-5 py-1.5 text-xs uppercase tracking-wide text-slate-500">
                {KIND_LABELS[kind]}
              </p>
              <ul className="divide-y divide-white/5">
                {rows.map((row) => {
                  const availableKey = `deductible:${row.id}:available`;
                  const percentKey = `deductible:${row.id}:reductionPercent`;
                  return (
                    <li key={row.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <input
                        type="checkbox"
                        id={availableKey}
                        checked={Boolean(value(availableKey, row.available))}
                        onChange={(e) => set(availableKey, e.target.checked)}
                        className="size-4 accent-[#4A9FE8]"
                      />
                      <label htmlFor={availableKey} className="min-w-0 flex-1 text-sm">
                        {row.label}
                        {row.excludedPlans.length > 0 ? (
                          <span className="ml-2 rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] uppercase text-slate-400">
                            not in {row.excludedPlans.join("/")}
                          </span>
                        ) : null}
                      </label>
                      <span className="text-sm text-slate-500">−</span>
                      <Input
                        type="number"
                        step="0.01"
                        aria-label={`${row.label} reduction`}
                        value={String(value(percentKey, row.reductionPercent))}
                        onChange={(e) => set(percentKey, e.target.value)}
                        className="h-8 w-24 border-white/10 bg-navy-850 text-right"
                      />
                      <span className="text-sm text-slate-500">%</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </section>

      {/* ---- Coverage-restriction discounts (per area) ---- */}
      {areaRestrictions.length > 0 ? (
        <section className="rounded-xl border border-white/10 bg-navy-900">
          <div className="border-b border-white/10 px-5 py-3">
            <h2 className="text-sm font-medium text-slate-300">
              Coverage-restriction discounts — Area {area?.areaCode}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              A discount for limiting cover to one region. This table is printed per area and was
              not in the original brief — check it before it feeds a quote.
            </p>
          </div>
          <ul className="divide-y divide-white/5">
            {areaRestrictions.map((restriction) => {
              const availableKey = `restriction:${restriction.id}:available`;
              const percentKey = `restriction:${restriction.id}:discountPercent`;
              return (
                <li key={restriction.id} className="flex items-center gap-3 px-5 py-3">
                  <input
                    type="checkbox"
                    id={availableKey}
                    checked={Boolean(value(availableKey, restriction.available))}
                    onChange={(e) => set(availableKey, e.target.checked)}
                    className="size-4 accent-[#4A9FE8]"
                  />
                  <label htmlFor={availableKey} className="flex-1 text-sm">
                    Cover restricted to {restriction.region}
                  </label>
                  <span className="text-sm text-slate-500">−</span>
                  <Input
                    type="number"
                    step="0.01"
                    aria-label={`${restriction.region} discount`}
                    value={String(value(percentKey, restriction.discountPercent))}
                    onChange={(e) => set(percentKey, e.target.value)}
                    className="h-8 w-24 border-white/10 bg-navy-850 text-right"
                  />
                  <span className="text-sm text-slate-500">%</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Pinned so a long page never hides unsaved edits. */}
      {edits.length > 0 || saveError || notice ? (
        <div className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-navy-900/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
            {saveError ? (
              <p role="alert" className="text-sm text-red-300">
                {saveError}
              </p>
            ) : notice ? (
              <p className="flex items-center gap-1.5 text-sm text-brand">
                <Check className="size-4" />
                {notice}
              </p>
            ) : (
              <p className="text-sm text-slate-300">
                {edits.length} unsaved change{edits.length === 1 ? "" : "s"}
              </p>
            )}

            {edits.length > 0 ? (
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setDraft({});
                    setSaveError(null);
                  }}
                  disabled={saving}
                  className="h-9 border border-white/10 bg-navy-850 px-3 text-slate-200 hover:bg-navy-800 hover:text-white"
                >
                  Discard
                </Button>
                <Button
                  onClick={save}
                  disabled={saving}
                  className="h-9 bg-brand px-4 text-navy-950 hover:bg-brand/85"
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
