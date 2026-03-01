"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import type { SearchEventRow, SearchEventsStatus, SearchSort } from "@/src/lib/gammaSearch";

type SearchResponse = {
  q: string;
  page: number;
  stale: boolean;
  error?: string;
  hasMore: boolean;
  totalResults?: number;
  results: SearchEventRow[];
};

type GlobalMarketSearchProps = {
  title?: string;
  description?: string;
  placeholder?: string;
  className?: string;
  showHeader?: boolean;
};

const DEBOUNCE_MS = 300;
const DEFAULT_LIMIT_PER_TYPE = 20;

const SORT_OPTIONS: Array<{ label: string; value: SearchSort | ""; enabled: boolean }> = [
  { label: "Trending / Volume", value: "volume_24hr", enabled: true },
  { label: "Liquidity", value: "liquidity", enabled: true },
  // TODO: enable once Gamma search-v2 sort support is confirmed stable.
  { label: "Newest", value: "newest", enabled: false },
  // TODO: enable once Gamma search-v2 sort support is confirmed stable.
  { label: "Ending Soon", value: "ending_soon", enabled: false },
];

const STATUS_OPTIONS: Array<{ label: string; value: SearchEventsStatus }> = [
  { label: "Active", value: "active" },
  { label: "Resolved", value: "resolved" },
  { label: "All", value: "all" },
];

const formatCompactMoney = (value?: number, suffix = ""): string | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const base = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
  return `$${base}${suffix}`;
};

const formatProbability = (probability?: number): string | null => {
  if (typeof probability !== "number" || !Number.isFinite(probability)) return null;
  const pct = Math.round(Math.max(0, Math.min(1, probability)) * 100);
  return `${pct}%`;
};

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
  const [results, setResults] = useState<SearchEventRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [totalResults, setTotalResults] = useState<number | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SearchSort | "">("volume_24hr");
  const [status, setStatus] = useState<SearchEventsStatus>("active");
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

  const fetchSearch = async (params: { queryToSearch: string; pageToFetch: number; append: boolean }) => {
    if (params.queryToSearch.length < 2) return;

    const requestId = ++requestIdRef.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams({
        q: params.queryToSearch,
        page: String(params.pageToFetch),
        limit_per_type: String(DEFAULT_LIMIT_PER_TYPE),
        events_status: status,
        optimized: "false",
      });
      const selectedSort = SORT_OPTIONS.find((option) => option.value === sort);
      if (sort && selectedSort?.enabled) queryParams.set("sort", sort);

      const response = await fetch(`/api/markets/search?${queryParams.toString()}`, { signal: controller.signal });
      const data = (await response.json()) as SearchResponse;
      if (requestId !== requestIdRef.current) return;

      setResults((current) => (params.append ? [...current, ...data.results] : data.results));
      setHasMore(data.hasMore);
      setTotalResults(data.totalResults);
      setStale(Boolean(data.stale));
      setError(data.error ?? null);
      setPage(params.pageToFetch);
    } catch (caughtError) {
      if (requestId !== requestIdRef.current) return;
      if (controller.signal.aborted) return;

      if (!params.append) {
        setResults([]);
        setHasMore(false);
      }
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
      setHasMore(false);
      setTotalResults(undefined);
      setPage(1);
      setStale(false);
      setError(null);
      return;
    }

    void fetchSearch({ queryToSearch: debouncedQuery, pageToFetch: 1, append: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, sort, status]);

  const showResults = useMemo(
    () => canSearch || loading || results.length > 0 || Boolean(error),
    [canSearch, error, loading, results.length],
  );

  const handleSelect = (item: SearchEventRow) => {
    const params = new URLSearchParams({
      q: item.eventTitle,
      cat: item.primaryCategoryLine || "Other",
      eid: item.eventId,
    });
    router.push(`/portfolio/manual/event/${item.eventSlug}?${params.toString()}`);
  };

  return (
    <div className={className}>
      {showHeader ? (
        <>
          <h2 className="text-xl font-semibold text-slate-100">{title}</h2>
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        </>
      ) : null}

      <div className={showHeader ? "mt-4 space-y-3" : "space-y-3"}>
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-500"
        />

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="text-xs text-slate-400">
            Sort
            <select
              aria-label="Sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as SearchSort | "")}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.label} value={option.value} disabled={!option.enabled}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-slate-400">
            Status
            <select
              aria-label="Status"
              value={status}
              onChange={(event) => setStatus(event.target.value as SearchEventsStatus)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
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
                onClick={() => void fetchSearch({ queryToSearch: debouncedQuery, pageToFetch: 1, append: false })}
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
            <p className="px-4 pt-3 text-xs text-slate-500">
              Showing {results.length} events{typeof totalResults === "number" ? ` of ${totalResults}` : ""}
            </p>
          ) : null}

          <div className="max-h-96 overflow-y-auto">
            {results.map((item) => {
              const probability = formatProbability(item.displayMarket.probabilityYes);
              const volume = formatCompactMoney(item.volume24hr ?? item.volume, " Vol.");
              const liquidity = formatCompactMoney(item.liquidity, " Liq.");
              const categoryLine = item.primaryCategoryLine || "Other";
              const iconUrl = item.icon || item.image;

              return (
                <button
                  type="button"
                  key={`${item.eventId}-${item.displayMarket.marketId}`}
                  onClick={() => handleSelect(item)}
                  className="grid w-full grid-cols-[40px_1fr_auto] items-start gap-3 border-t border-slate-800 px-4 py-3 text-left transition hover:bg-slate-800/70"
                >
                  <div className="h-10 w-10 overflow-hidden rounded-md bg-slate-800">
                    {iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={iconUrl} alt={item.eventTitle} className="h-full w-full object-cover" />
                    ) : null}
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-100">{item.eventTitle}</p>
                    {categoryLine ? <p className="mt-1 truncate text-xs text-slate-400">{categoryLine}</p> : null}
                    <p className="mt-1 truncate text-[11px] text-slate-500">
                      {volume ? `${volume}  ` : ""}
                      {liquidity ? `${liquidity}  ` : ""}
                      {item.endsInText || ""}
                    </p>
                  </div>

                  <div className="text-right">
                    {probability ? <p className="text-sm font-semibold text-slate-100">{probability}</p> : null}
                    {item.displayMarket.groupItemTitle ? (
                      <p className="mt-1 max-w-28 truncate text-[11px] text-slate-400">{item.displayMarket.groupItemTitle}</p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

          {hasMore ? (
            <div className="border-t border-slate-800 p-3">
              <button
                type="button"
                disabled={loading}
                onClick={() => void fetchSearch({ queryToSearch: debouncedQuery, pageToFetch: page + 1, append: true })}
                className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Loading..." : "Load more"}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-6">
          <p className="text-sm text-slate-400">Start typing to search all markets.</p>
        </div>
      )}
    </div>
  );
}
