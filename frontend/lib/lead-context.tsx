"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "swiftbroker.leadId";

interface LeadContextValue {
  leadId: string | null;
  /** The chat input stays locked until a lead record exists. */
  isUnlocked: boolean;
  setLeadId: (id: string) => void;
  /** Drops the stored lead so the capture gate comes back. */
  clearLead: () => void;
  /** UTM/source param carried over from the marketing site button. */
  source: string;
}

const LeadContext = createContext<LeadContextValue | null>(null);

export function LeadProvider({ children }: { children: React.ReactNode }) {
  const [leadId, setLeadIdState] = useState<string | null>(null);
  const [source, setSource] = useState("existing-site-button");

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) setLeadIdState(stored);

    const src = new URLSearchParams(window.location.search).get("src");
    if (src) setSource(src);
  }, []);

  const setLeadId = useCallback((id: string) => {
    sessionStorage.setItem(STORAGE_KEY, id);
    setLeadIdState(id);
  }, []);

  const clearLead = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setLeadIdState(null);
  }, []);

  const value = useMemo(
    () => ({ leadId, isUnlocked: leadId !== null, setLeadId, clearLead, source }),
    [leadId, setLeadId, clearLead, source],
  );

  return <LeadContext.Provider value={value}>{children}</LeadContext.Provider>;
}

export function useLead() {
  const ctx = useContext(LeadContext);
  if (!ctx) throw new Error("useLead must be used inside a LeadProvider");
  return ctx;
}
