"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { SearchEventRow, SearchMarketResult } from "@/src/lib/gammaSearch";
import { sortMarketsForEvent } from "@/src/lib/gammaSearch";
import { setManualSelectionCache } from "@/src/lib/manualSelectionCache";

type EventResponse = {
  stale: boolean;
  error?: string;
  event?: SearchEventRow;
  markets: SearchMarketResult[];
};

const formatProbability = (probability?: number): string => {
  if (typeof probability !== "number" || !Number.isFinite(probability)) return "--";
  return `${Math.round(Math.max(0, Math.min(1, probability)) * 100)}%`;
};

export default function EventOptionSelectScreen() {
  const router = useRouter();
  const params = useParams<{ eventSlug: string }>();
  const searchParams = useSearchParams();

  const eventSlug = params.eventSlug;
  const fallbackCategory = (searchParams.get("cat") ?? "").trim();
  const requestedMarketId = (searchParams.get("marketId") ?? "").trim();

  const [eventData, setEventData] = useState<SearchEventRow | null>(null);
  const [markets, setMarkets] = useState<SearchMarketResult[]>([]);
  const [selectedMarketId, setSelectedMarketId] = useState<string>("");
  const [loadingEvent, setLoadingEvent] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!eventSlug) {
        setEventError("Missing event reference.");
        return;
      }
      setLoadingEvent(true);
      setEventError(null);
      try {
        const response = await fetch(`/api/markets/event/${encodeURIComponent(eventSlug)}`);
        const data = (await response.json()) as EventResponse;
        if (cancelled) return;

        if (!response.ok || !data.event) {
          setEventError(data.error ?? "Unable to load event.");
          return;
        }

        const sorted = sortMarketsForEvent(data.markets ?? []);
        setEventData(data.event);
        setMarkets(sorted);

        const selected = sorted.find((market) => market.marketId === requestedMarketId)?.marketId ?? sorted[0]?.marketId ?? "";
        setSelectedMarketId(selected);
      } catch {
        if (cancelled) return;
        setEventError("Unable to load event.");
      } finally {
        if (!cancelled) setLoadingEvent(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [eventSlug, requestedMarketId]);

  const selectedMarket = useMemo(
    () => markets.find((market) => market.marketId === selectedMarketId) ?? markets[0] ?? null,
    [markets, selectedMarketId],
  );

  const category = eventData?.primaryCategoryLine || eventData?.eventTitle || fallbackCategory || "Other";

  const handleContinue = () => {
    if (!eventData || !selectedMarket) return;
    setManualSelectionCache(eventSlug, { event: eventData, markets });

    const params = new URLSearchParams({
      eventSlug,
      eventId: eventData.eventId,
      marketId: selectedMarket.marketId,
    });
    router.push(`/portfolio/manual/transaction?${params.toString()}`);
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-2xl shadow-black/30 sm:p-8">
        <p className="text-xs uppercase tracking-wide text-slate-400">{category}</p>
        {eventData?.eventTitle ? <h1 className="mt-2 text-xl font-semibold leading-tight text-slate-50">{eventData.eventTitle}</h1> : null}

        {loadingEvent ? <p className="mt-2 text-sm text-slate-400">Loading event options...</p> : null}
        {eventError ? <p className="mt-2 rounded-lg border border-amber-600/40 bg-amber-900/20 px-3 py-2 text-sm text-amber-200">{eventError}</p> : null}

        {markets.length > 0 ? (
          <div className="mt-4">
            <label className="text-sm text-slate-300">
              Market option
              <select
                value={selectedMarket?.marketId ?? ""}
                onChange={(e) => setSelectedMarketId(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none focus:border-cyan-500"
              >
                {markets.map((market) => (
                  <option key={market.marketId} value={market.marketId}>
                    {(market.groupItemTitle || market.question).trim()} ({formatProbability(market.probabilityYes)})
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={handleContinue}
            disabled={!selectedMarket || loadingEvent}
            className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Continue
          </button>
          <Link href="/portfolio/manual" className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-900">
            Back
          </Link>
        </div>
      </section>
    </main>
  );
}
