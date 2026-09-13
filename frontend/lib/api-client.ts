import {
  adminLeadsQueryString,
  type AdminIdentity,
  type AdminInsurer,
  type AdminKnowledgeBase,
  type AdminInsurerDetail,
  type AdminInsurerDocument,
  type AdminRateCardDetail,
  type AdminRateCardSummary,
  type ParseSummary,
  type SectionEdit,
  type AdminLeadDetail,
  type AdminLeadsFilters,
  type AdminLeadsResult,
} from "./admin-types";
import { config } from "./config";
import type { DeliveryChannel, QuoteProfile } from "./profile";
import type { Quote } from "./types";

/** Every backend call in the app goes through this module — nothing else may fetch the API directly. */

export class ApiError extends Error {
  status: number;
  fields?: Record<string, string>;

  constructor(message: string, status: number, fields?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.backendUrl}${path}`, {
      ...init,
      // The admin session is an HttpOnly cookie on a cross-origin API host, so
      // it only rides along when credentials are included. Harmless elsewhere.
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch (err) {
    // An aborted request is the caller superseding itself, not a failure.
    if ((err as Error | undefined)?.name === "AbortError") throw err;
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  }

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      (payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : null) ?? "Something went wrong. Please try again.";
    const fields =
      payload && typeof payload === "object" && "fields" in payload
        ? ((payload as { fields: Record<string, string> }).fields)
        : undefined;
    throw new ApiError(message, res.status, fields);
  }

  return payload as T;
}

export interface CreateLeadInput {
  email: string;
  /** Full E.164 number — the gate assembles it from its country-code select. */
  phone: string;
  source?: string;
}

export interface CreateLeadResult {
  leadId: string;
  createdAt: string;
}

export interface RequestQuotesResult {
  quotes: Quote[];
  /** Insurer-level messages, e.g. a card that does not cover this country. */
  notices?: string[];
}

export const api = {
  health: () => request<{ ok: boolean; service: string }>("/health"),

  createLead: (input: CreateLeadInput) =>
    request<CreateLeadResult>("/leads", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  /**
   * The quote form's COMPARE. One call saves the profile on the lead's
   * conversation, prices it and snapshots the result — the snapshot is also
   * what the support chat reads back.
   */
  requestQuotes: (leadId: string, profile: QuoteProfile, signal?: AbortSignal) =>
    request<RequestQuotesResult>("/quotes/request", {
      method: "POST",
      body: JSON.stringify({ leadId, ...profile }),
      signal,
    }),

  /** Records where the visitor wants the comparison sent. Nothing is sent by the app. */
  chooseDelivery: (leadId: string, channel: DeliveryChannel) =>
    request<{ ok: true; channel: DeliveryChannel }>("/quotes/delivery", {
      method: "POST",
      body: JSON.stringify({ leadId, channel }),
    }),

  admin: {
    login: (username: string, password: string) =>
      request<{ username: string; expiresAt: string }>("/admin/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      }),

    logout: () => request<{ ok: true }>("/admin/auth/logout", { method: "POST" }),

    me: () => request<AdminIdentity>("/admin/auth/me"),

    leads: (filters: AdminLeadsFilters, signal?: AbortSignal) =>
      request<AdminLeadsResult>(`/admin/leads${adminLeadsQueryString(filters)}`, { signal }),

    lead: (id: string) => request<AdminLeadDetail>(`/admin/leads/${id}`),

    insurers: () => request<{ rows: AdminInsurer[] }>("/admin/insurers"),

    createInsurer: (name: string, knowledgeBase = "") =>
      request<{ insurer: AdminInsurer }>("/admin/insurers", {
        method: "POST",
        body: JSON.stringify({ name, knowledgeBase }),
      }),

    updateInsurer: (id: string, changes: { name?: string; knowledgeBase?: string }) =>
      request<{ insurer: AdminInsurer }>(`/admin/insurers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      }),

    /** The general knowledge base the chat receives on every message. */
    knowledgeBase: () => request<AdminKnowledgeBase>("/admin/settings/knowledge-base"),

    saveKnowledgeBase: (knowledgeBase: string) =>
      request<AdminKnowledgeBase>("/admin/settings/knowledge-base", {
        method: "PUT",
        body: JSON.stringify({ knowledgeBase }),
      }),

    insurer: (id: string) =>
      request<AdminInsurerDetail & { rateCards: AdminRateCardSummary[] }>(
        `/admin/insurers/${id}`,
      ),

    /** Parses a stored PDF into a rate card. Re-parsing replaces the previous one. */
    parseDocument: (insurerId: string, documentId: string, productName?: string) =>
      request<{ summary: ParseSummary }>(
        `/admin/insurers/${insurerId}/documents/${documentId}/parse`,
        {
          method: "POST",
          body: JSON.stringify(productName ? { productName } : {}),
        },
      ),

    rateCard: (id: string) => request<AdminRateCardDetail>(`/admin/rate-cards/${id}`),

    saveRateCardSections: (id: string, edits: SectionEdit[]) =>
      request<{ applied: number; requested: number }>(`/admin/rate-cards/${id}/sections`, {
        method: "PATCH",
        body: JSON.stringify({ edits }),
      }),

    /**
     * Multipart, so this is the one call that must NOT set Content-Type — the
     * browser has to add its own boundary. Everything else about it (base URL,
     * credentials, error shape) matches `request()`.
     */
    uploadInsurerDocument: async (insurerId: string, file: File) => {
      const body = new FormData();
      body.append("file", file);

      let res: Response;
      try {
        res = await fetch(`${config.backendUrl}/admin/insurers/${insurerId}/documents`, {
          method: "POST",
          credentials: "include",
          body,
        });
      } catch {
        throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
      }

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const record = payload as { error?: unknown; fields?: Record<string, string> } | null;
        throw new ApiError(
          record?.error ? String(record.error) : "Could not upload that file.",
          res.status,
          record?.fields,
        );
      }
      return payload as { document: AdminInsurerDocument };
    },

    deleteInsurerDocument: (insurerId: string, documentId: string) =>
      request<{ ok: true }>(`/admin/insurers/${insurerId}/documents/${documentId}`, {
        method: "DELETE",
      }),

    /** Opened in a new tab, so the browser's PDF viewer handles it. */
    insurerDocumentUrl: (insurerId: string, documentId: string) =>
      `${config.backendUrl}/admin/insurers/${insurerId}/documents/${documentId}/file`,

    /**
     * The CSV is fetched by navigating to it, not by XHR — a plain <a> lets the
     * browser handle the download and still sends the session cookie.
     */
    leadsCsvUrl: (filters: AdminLeadsFilters) =>
      `${config.backendUrl}/admin/leads.csv${adminLeadsQueryString({
        ...filters,
        page: undefined,
        pageSize: undefined,
      })}`,
  },
};
