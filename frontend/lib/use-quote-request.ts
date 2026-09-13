"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "./analytics";
import { ApiError, api } from "./api-client";
import { TIER_COVERAGE, type QuoteProfile } from "./profile";
import type { Quote } from "./types";

interface UseQuoteRequestArgs {
  leadId: string | null;
  /** Called when the backend reports the lead no longer exists. */
  onSessionExpired: () => void;
}

/**
 * The quote form's COMPARE, as state: the profile last submitted, the quotes
 * it produced, and the in-flight/error state. A re-submit supersedes any call
 * still running, so the panel can never show quotes for an older form.
 */
export function useQuoteRequest({ leadId, onSessionExpired }: UseQuoteRequestArgs) {
  const [submitted, setSubmitted] = useState<QuoteProfile | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [notices, setNotices] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const inFlight = useRef<AbortController | null>(null);

  const submit = useCallback(
    async (profile: QuoteProfile) => {
      if (!leadId) return;

      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;

      setLoading(true);
      setError(null);
      setFieldErrors({});
      track({ name: "coverage_selected", coverageTypes: TIER_COVERAGE[profile.coverageTier] });
      track({ name: "quote_requested", dependants: profile.dependants.length });

      try {
        const result = await api.requestQuotes(leadId, profile, controller.signal);
        if (controller.signal.aborted) return;
        setSubmitted(profile);
        setQuotes(result.quotes);
        setNotices(result.notices ?? []);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError) {
          if (err.status === 404 && /session expired/i.test(err.message)) onSessionExpired();
          // Field-level problems belong under the inputs, not in the results panel.
          if (err.fields) setFieldErrors(err.fields);
          else setError(err.message);
        } else {
          setError("Could not load quotations. Please try again.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [leadId, onSessionExpired],
  );

  useEffect(() => () => inFlight.current?.abort(), []);

  return { submitted, quotes, notices, loading, error, fieldErrors, submit };
}
