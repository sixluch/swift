"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "swiftbroker.leadId";
const CONTACT_KEY = "swiftbroker.contact";

/** What the gate collected, kept client-side so the delivery step can use it. */
export interface LeadContact {
  email: string;
  phone: string;
}

interface LeadContextValue {
  leadId: string | null;
  /** The chat input stays locked until a lead record exists. */
  isUnlocked: boolean;
  setLeadId: (id: string, contact: LeadContact) => void;
  /** Drops the stored lead so the capture gate comes back. */
  clearLead: () => void;
  /** UTM/source param carried over from the marketing site button. */
  source: string;
  /** Email and phone from the gate — never re-asked in the chat. */
  contact: LeadContact | null;
}

const LeadContext = createContext<LeadContextValue | null>(null);

export function LeadProvider({ children }: { children: React.ReactNode }) {
  const [leadId, setLeadIdState] = useState<string | null>(null);
  const [contact, setContact] = useState<LeadContact | null>(null);
  const [source, setSource] = useState("existing-site-button");

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) setLeadIdState(stored);

    try {
      const raw = sessionStorage.getItem(CONTACT_KEY);
      if (raw) setContact(JSON.parse(raw) as LeadContact);
    } catch {
      // Corrupt entry — the gate will collect it again.
    }

    const src = new URLSearchParams(window.location.search).get("src");
    if (src) setSource(src);
  }, []);

  const setLeadId = useCallback((id: string, next: LeadContact) => {
    sessionStorage.setItem(STORAGE_KEY, id);
    sessionStorage.setItem(CONTACT_KEY, JSON.stringify(next));
    setLeadIdState(id);
    setContact(next);
  }, []);

  const clearLead = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(CONTACT_KEY);
    setLeadIdState(null);
    setContact(null);
  }, []);

  const value = useMemo(
    () => ({ leadId, isUnlocked: leadId !== null, setLeadId, clearLead, source, contact }),
    [leadId, setLeadId, clearLead, source, contact],
  );

  return <LeadContext.Provider value={value}>{children}</LeadContext.Provider>;
}

export function useLead() {
  const ctx = useContext(LeadContext);
  if (!ctx) throw new Error("useLead must be used inside a LeadProvider");
  return ctx;
}
