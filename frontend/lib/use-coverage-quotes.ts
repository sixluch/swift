"use client";

import { useEffect, useState } from "react";
import { ApiError, api } from "./api-client";
import type { CoverageType } from "./coverage";
import type { Quote } from "./types";

/** Rapid chip toggling shouldn't fire a request per click. */
const DEBOUNCE_MS = 250;

interface UseCoverageQuotesArgs {
  coverageTypes: CoverageType[];
  /** Once the AI has quoted, its age re-prices the preview to match. */
  age?: number;
}

/**
 * Quotes driven by the coverage chips alone, so the results panel fills in as
 * soon as one is clicked instead of waiting for the conversation to get there.
 */
export function useCoverageQuotes({ coverageTypes, age }: UseCoverageQuotesArgs) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A stable key, so re-rendering with an equal-but-new array doesn't refetch.
  const key = [...coverageTypes].sort().join(",");

  useEffect(() => {
    const selected = key ? (key.split(",") as CoverageType[]) : [];

    if (selected.length === 0) {
      setQuotes([]);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const result = await api.previewQuotes({ coverageTypes: selected, age }, controller.signal);
        if (controller.signal.aborted) return;
        setQuotes(result.quotes);
        setError(null);
      } catch (err) {
        if (controller.signal.aborted) return;
        setQuotes([]);
        setError(
          err instanceof ApiError ? err.message : "Could not load quotations. Please try again.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, age]);

  return { quotes, loading, error };
}
