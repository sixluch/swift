import type { CoverageTier, DeliveryChannel, Dependant, Gender, QuoteProfile } from "./profile";
import type { InputMode } from "./types";

/** Shapes returned by the backend's /admin routes. */

export interface AdminIdentity {
  id: string;
  username: string;
}

/** One row of the lead report: a lead, plus its conversation if it ever started one. */
export interface AdminLeadRow {
  id: string;
  email: string;
  phone: string;
  source: string | null;
  createdAt: string;
  conversationId: string | null;
  fullName: string | null;
  country: string | null;
  nationality: string | null;
  age: number | null;
  gender: Gender | null;
  effectiveDate: string | null;
  dependants: Dependant[] | null;
  coverageTier: CoverageTier | null;
  deliveryChannel: DeliveryChannel | null;
  messageCount: number | null;
  quoteCount: number | null;
}

export interface AdminLeadsResult {
  rows: AdminLeadRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminLeadsFilters {
  q?: string;
  from?: string;
  to?: string;
  country?: string;
  hasQuote?: "yes" | "no";
  page?: number;
  pageSize?: number;
}

export interface AdminMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  inputMode: InputMode | null;
  createdAt: string;
}

export interface AdminQuoteRequest {
  id: string;
  name: string | null;
  age: number | null;
  coverageType: string[];
  quotesReturned: unknown;
  /** Insurer-level messages returned with the quotes, e.g. not available in this country. */
  notices: string[] | null;
  /** The form exactly as submitted for this COMPARE. */
  profile: QuoteProfile | null;
  createdAt: string;
}

export interface AdminLeadDetail {
  lead: {
    id: string;
    email: string;
    phone: string;
    source: string | null;
    createdAt: string;
  };
  conversation:
    | (Omit<AdminLeadRow, "id" | "email" | "phone" | "source" | "createdAt" | "conversationId" | "messageCount" | "quoteCount"> & {
        id: string;
        leadId: string;
        coverageType: string[];
        startedAt: string;
      })
    | null;
  messages: AdminMessage[];
  quoteRequests: AdminQuoteRequest[];
}

/** Serialises filters into the query string both the API and the CSV link use. */
export function adminLeadsQueryString(filters: AdminLeadsFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.country) params.set("country", filters.country);
  if (filters.hasQuote) params.set("hasQuote", filters.hasQuote);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** An insurance company created in the admin console. */
/**
 * Mirrors the backend's cap (`backend/src/lib/knowledge.ts`). Used only for
 * the live counter; the backend refuses anything longer regardless.
 */
export const KNOWLEDGE_BASE_MAX_CHARS = 30_000;

export interface AdminInsurer {
  id: string;
  name: string;
  /** Admin-written text the chat receives when this insurer is quoted. Absent on the list endpoint. */
  knowledgeBase?: string;
  createdAt: string;
  /** Only present on the list endpoint. */
  knowledgeBaseChars?: number;
  documentCount?: number;
}

export interface AdminKnowledgeBase {
  knowledgeBase: string;
  maxChars: number;
}

/** An uploaded rate-card PDF. The file's bytes never travel in JSON. */
export interface AdminInsurerDocument {
  id: string;
  insurerId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  /** 'pending' until the rate-card parser runs (next stage). */
  parseStatus: "pending" | "parsed" | "failed";
  uploadedAt: string;
}

export interface AdminInsurerDetail {
  insurer: AdminInsurer;
  documents: AdminInsurerDocument[];
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** ---- Rate cards ---- */

export interface AdminRateCardSummary {
  id: string;
  productName: string;
  documentId: string | null;
  currency: string;
  premiumBasis: string;
  parsedAt: string;
  warnings: string[];
}

export interface ParseSummary {
  rateCardId: string;
  productId: string;
  productName: string;
  areas: number;
  plans: number;
  premiums: number;
  countries: number;
  unmatchedCountries: string[];
  benefits: number;
  surcharges: number;
  deductibles: number;
  restrictions: number;
  warnings: string[];
  replacedPrevious: boolean;
}

export interface RatePlan {
  id: string;
  code: string;
  label: string;
  sortOrder: number;
}

export interface RateArea {
  id: string;
  areaCode: string;
  sortOrder: number;
}

export interface RatePremium {
  rateAreaId: string;
  ratePlanId: string;
  ageMin: number;
  ageMax: number;
  premium: number;
}

export interface RateBenefit {
  id: string;
  label: string;
  /** Postgres numeric arrives as a string. */
  amount: string;
  unit: "currency" | "percent";
  excludedPlans: string[];
  onlyPlans: string[];
  available: boolean;
  sortOrder: number;
}

export interface RateSurcharge {
  id: string;
  label: string;
  percent: string;
  sortOrder: number;
}

export interface RateDeductible {
  id: string;
  kind: "deductible" | "outpatient_excess" | "outpatient_coinsurance";
  label: string;
  reductionPercent: string;
  excludedPlans: string[];
  available: boolean;
  sortOrder: number;
}

export interface RateRestriction {
  id: string;
  rateAreaId: string;
  region: string;
  discountPercent: string;
  available: boolean;
}

export interface RateAreaCountry {
  id: string;
  rateAreaId: string;
  printedName: string;
  countryIso: string | null;
}

export interface AdminRateCardDetail {
  card: {
    id: string;
    currency: string;
    premiumBasis: string;
    sourceFilename: string | null;
    warnings: string[];
    parsedAt: string;
    documentId: string | null;
    productId: string;
    productName: string;
    insurerId: string;
    insurerName: string;
  };
  plans: RatePlan[];
  areas: RateArea[];
  premiums: RatePremium[];
  countries: RateAreaCountry[];
  restrictions: RateRestriction[];
  benefits: RateBenefit[];
  surcharges: RateSurcharge[];
  deductibles: RateDeductible[];
}

export type SectionEdit =
  | { table: "benefit"; id: string; available?: boolean; amount?: number }
  | { table: "surcharge"; id: string; percent?: number }
  | { table: "deductible"; id: string; available?: boolean; reductionPercent?: number }
  | { table: "restriction"; id: string; available?: boolean; discountPercent?: number };
