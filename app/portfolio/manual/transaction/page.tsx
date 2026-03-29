"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import TransactionWizard from "@/components/TransactionWizard";
import type { SearchEventRow, SearchMarketResult } from "@/src/lib/gammaSearch";
import { sortMarketsForEvent } from "@/src/lib/gammaSearch";
import { getManualSelectionCache, setManualSelectionCache } from "@/src/lib/manualSelectionCache";
import { addTransaction } from "@/src/lib/storage";

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

export default function TransactionFormScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const eventSlug = (searchParams.get("eventSlug") ?? "").trim();
  const marketIdFromQuery = (searchParams.get("marketId") ?? "").trim();

  const [eventData, setEventData] = useState<SearchEventRow | null>(null);
  const [markets, setMarkets] = useState<SearchMarketResult[]>([]);
  const [selectedMarketId, setSelectedMarketId] = useState(marketIdFromQuery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!eventSlug) {
        setError("Missing event reference.");
        return;
      }

      const cached = getManualSelectionCache(eventSlug);
      if (cached) {
        const sorted = sortMarketsForEvent(cached.markets);
        if (!cancelled) {
          setEventData(cached.event);
          setMarkets(sorted);
          setSelectedMarketId((current) => current || marketIdFromQuery || sorted[0]?.marketId || "");
        }
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/markets/event/${encodeURIComponent(eventSlug)}`);
        const data = (await response.json()) as EventResponse;
        if (cancelled) return;

        if (!response.ok || !data.event) {
          setError(data.error ?? "Unable to load market details.");
          return;
        }

        const sorted = sortMarketsForEvent(data.markets ?? []);
        setEventData(data.event);
        setMarkets(sorted);
        setSelectedMarketId((current) => current || marketIdFromQuery || sorted[0]?.marketId || "");
        setManualSelectionCache(eventSlug, { event: data.event, markets: sorted });
      } catch {
        if (cancelled) return;
        setError("Unable to load market details.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [eventSlug, marketIdFromQuery]);

  const selectedMarket = useMemo(
    () => markets.find((market) => market.marketId === selectedMarketId) ?? null,
    [markets, selectedMarketId],
  );

  const handleSubmitWizard = async (data: {
    side: "BUY" | "SELL";
    outcome: "YES" | "NO";
    shares: number;
    price: number;
    timestamp: string;
    notes?: string;
  }) => {
    if (!selectedMarket || !eventData) {
      setSubmitError("Please select a market option first.");
      return;
    }

    setSaving(true);
    setSubmitError(null);
    setSuccessMessage(null);

    try {
      addTransaction({
        source: "manual",
        marketId: selectedMarket.marketId,
        marketTitle: selectedMarket.question,
        category: eventData.primaryCategoryLine || eventData.eventTitle,
        side: data.side,
        outcome: data.outcome,
        shares: data.shares,
        price: data.price,
        fee: 0,
        timestamp: data.timestamp,
        notes: data.notes,
      });

      setSuccessMessage("Transaction saved. Redirecting...");
      const redirectDelayMs = process.env.NODE_ENV === "test" ? 0 : 450;
      await new Promise((resolve) => {
        setTimeout(resolve, redirectDelayMs);
      });
      router.push("/portfolio");
    } catch {
      setSubmitError("Unable to save transaction.");
    } finally {
      setSaving(false);
    }
  };

  const backHref = `/portfolio/manual/event/${encodeURIComponent(eventSlug)}?marketId=${encodeURIComponent(selectedMarketId || marketIdFromQuery)}`;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-2xl shadow-black/30 sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-50">Add Transaction</h1>

        {loading ? <p className="mt-3 text-sm text-slate-400">Loading market details...</p> : null}
        {error ? (
          <p className="mt-3 rounded-lg border border-amber-600/40 bg-amber-900/20 px-3 py-2 text-sm text-amber-200">{error}</p>
        ) : null}

        {eventData && selectedMarket ? (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-sm font-medium text-slate-100">{eventData.eventTitle}</p>
            <p className="mt-1 text-xs text-slate-400">{selectedMarket.groupItemTitle || selectedMarket.question}</p>
            <p className="mt-1 text-xs text-slate-500">Probability: {formatProbability(selectedMarket.probabilityYes)}</p>
          </div>
        ) : null}

        {eventData && selectedMarket ? (
          <TransactionWizard
            backHref={backHref}
            marketLabel={selectedMarket.groupItemTitle || selectedMarket.question}
            outcomes={selectedMarket.outcomes}
            onSubmit={handleSubmitWizard}
            saving={saving}
            submitError={submitError}
            successMessage={successMessage}
          />
        ) : null}

        {!loading && !error && (!eventData || !selectedMarket) ? (
          <div className="mt-6">
            <p className="rounded-lg border border-amber-600/40 bg-amber-900/20 px-3 py-2 text-sm text-amber-200">
              Market details are unavailable.
            </p>
            <Link
              href={backHref}
              className="mt-4 inline-block rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-900"
            >
              Back
            </Link>
          </div>
        ) : null}
      </section>
    </main>
  );
}
