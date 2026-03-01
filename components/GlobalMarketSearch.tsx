"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import type { SearchMarketResult } from "@/src/lib/gammaSearch";

type SearchResponse = {
  q: string;
  stale: boolean;
  error?: string;
  results: SearchMarketResult[];
};

type GlobalMarketSearchProps = {
  title?: string;
  description?: string;
  placeholder?: string;
  className?: string;
  showHeader?: boolean;
};

const DEBOUNCE_MS = 300;

export default function GlobalMarketSearch({
  title = "Search all markets",
  description = "Search globally across Polymarket and jump straight to Add Transaction.",
  placeholder = "Search all markets...",
  className = "",
  showHeader = true,
}: GlobalMarketSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<SearchMarketResult[]>([]);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  const canSearch = debouncedQuery.length >= 2;

  const fetchSearch = async (queryToSearch: string) => {
    if (queryToSearch.length < 2) return;

    const requestId = ++requestIdRef.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        q: queryToSearch,
        limit_per_type: "10",
        keep_closed_markets: "1",
      });
      const response = await fetch(`/api/markets/search?${params.toString()}`, {
        signal: controller.signal,
      });
      const data = (await response.json()) as SearchResponse;

      if (requestId !== requestIdRef.current) return;

      setResults(data.results ?? []);
      setStale(Boolean(data.stale));
      setError(data.error ?? null);
    } catch (caughtError) {
      if (requestId !== requestIdRef.current) return;
      if (controller.signal.aborted) return;

      setResults([]);
      setStale(false);
      setError(
        caughtError instanceof Error && caughtError.name === "AbortError"
          ? null
          : "Live search is unavailable. Please retry.",
      );
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!canSearch) {
      setResults([]);
      setStale(false);
      setError(null);
      return;
    }

    void fetchSearch(debouncedQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  const showResults = useMemo(() => canSearch || loading || results.length > 0 || Boolean(error), [canSearch, error, loading, results.length]);

  const handleSelect = (item: SearchMarketResult) => {
    const params = new URLSearchParams({
      q: item.question,
      cat: item.eventTitle || "Other",
    });
    params.set("mid", item.marketId);
    router.push(`/portfolio/manual/all/${item.slug}?${params.toString()}`);
  };

  return (
    <div className={className}>
      {showHeader ? (
        <>
          <h2 className="text-xl font-semibold text-slate-100">{title}</h2>
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        </>
      ) : null}

      <div className={showHeader ? "mt-4" : ""}>
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-500"
        />
      </div>
      <p className="mt-2 text-xs text-slate-500">Type at least 2 characters to search Polymarket markets.</p>

      {showResults ? (
        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/60">
          {loading && results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-400">Searching markets...</p>
          ) : null}

          {!loading && canSearch && results.length === 0 && !error ? (
            <p className="px-4 py-3 text-sm text-slate-400">No matches yet. Try a longer query or different spelling.</p>
          ) : null}

          {error ? (
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <p className="text-sm text-amber-300">{error}</p>
              <button
                type="button"
                onClick={() => void fetchSearch(debouncedQuery)}
                disabled={loading || !canSearch}
                className="rounded-lg border border-amber-500/50 px-2 py-1 text-xs text-amber-200 transition hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Retry
              </button>
            </div>
          ) : null}

          {stale && results.length > 0 ? (
            <p className="px-4 pb-1 text-[11px] text-amber-300">Showing cached results while live search recovers.</p>
          ) : null}

          {results.length > 0 ? (
            <p className="px-4 pt-3 text-xs text-slate-500">Showing {results.length} results</p>
          ) : null}

          <div className="max-h-80 overflow-y-auto">
            {results.map((item) => (
              <button
                type="button"
                key={`${item.marketId}-${item.slug}`}
                onClick={() => handleSelect(item)}
                className="block w-full border-t border-slate-800 px-4 py-3 text-left transition hover:bg-slate-800/70"
              >
                <p className="text-sm font-medium text-slate-100">{item.question}</p>
                <p className="mt-1 text-xs text-slate-400">{item.eventTitle || "Other"}</p>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-6">
          <p className="text-sm text-slate-400">Start typing to search all markets.</p>
        </div>
      )}
    </div>
  );
}
