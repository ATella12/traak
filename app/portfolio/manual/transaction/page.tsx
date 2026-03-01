"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { SearchEventRow, SearchMarketResult } from "@/src/lib/gammaSearch";
import { sortMarketsForEvent } from "@/src/lib/gammaSearch";
import { getManualSelectionCache, setManualSelectionCache } from "@/src/lib/manualSelectionCache";
import { addTransaction } from "@/src/lib/storage";

type Side = "BUY" | "SELL";
type Outcome = "YES" | "NO";

type EventResponse = {
  stale: boolean;
  error?: string;
  event?: SearchEventRow;
  markets: SearchMarketResult[];
};

type FieldErrors = {
  shares?: string;
  price?: string;
  dateTime?: string;
};

const getDefaultDateTimeLocal = (): string => {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
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

  const [type, setType] = useState<Side>("BUY");
  const [outcome, setOutcome] = useState<Outcome>("YES");
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [dateTime, setDateTime] = useState(getDefaultDateTimeLocal());
  const [fee, setFee] = useState("");
  const [notes, setNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

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

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedMarket || !eventData) {
      setError("Please select a market option first.");
      return;
    }

    const nextErrors: FieldErrors = {};
    const parsedShares = Number(shares);
    const parsedPrice = Number(price);
    const parsedDate = new Date(dateTime);
    const parsedFee = fee.trim() ? Number(fee) : 0;

    if (!Number.isFinite(parsedShares) || parsedShares <= 0) nextErrors.shares = "Shares must be greater than 0.";
    if (!price.trim() || !Number.isFinite(parsedPrice) || parsedPrice < 0 || parsedPrice > 1) {
      nextErrors.price = "Price per share must be between 0 and 1.";
    }
    if (!dateTime || Number.isNaN(parsedDate.getTime())) nextErrors.dateTime = "Please choose a valid date and time.";

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      addTransaction({
        market: {
          slug: selectedMarket.slug,
          question: selectedMarket.question,
          category: eventData.primaryCategoryLine || eventData.eventTitle,
        },
        side: type,
        outcome,
        shares: parsedShares,
        price: parsedPrice,
        fee: Number.isFinite(parsedFee) && parsedFee >= 0 ? parsedFee : 0,
        timestamp: parsedDate.toISOString(),
        notes: notes.trim() || undefined,
      });
      router.push("/portfolio");
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
        {error ? <p className="mt-3 rounded-lg border border-amber-600/40 bg-amber-900/20 px-3 py-2 text-sm text-amber-200">{error}</p> : null}

        {eventData && selectedMarket ? (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-sm font-medium text-slate-100">{eventData.eventTitle}</p>
            <p className="mt-1 text-xs text-slate-400">{selectedMarket.groupItemTitle || selectedMarket.question}</p>
            <p className="mt-1 text-xs text-slate-500">Probability: {formatProbability(selectedMarket.probabilityYes)}</p>
          </div>
        ) : null}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm text-slate-300">
            Type
            <select value={type} onChange={(e) => setType(e.target.value as Side)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none focus:border-cyan-500">
              <option value="BUY">Buy</option>
              <option value="SELL">Sell</option>
            </select>
          </label>

          <label className="block text-sm text-slate-300">
            Outcome
            <select value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none focus:border-cyan-500">
              <option value="YES">Yes</option>
              <option value="NO">No</option>
            </select>
          </label>

          <label className="block text-sm text-slate-300">
            Shares
            <input type="number" min="0.000001" step="any" value={shares} onChange={(e) => setShares(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none focus:border-cyan-500" />
            {fieldErrors.shares ? <p className="mt-1 text-xs text-rose-300">{fieldErrors.shares}</p> : null}
          </label>

          <label className="block text-sm text-slate-300">
            Price per share
            <input type="number" min="0" max="1" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none focus:border-cyan-500" />
            {fieldErrors.price ? <p className="mt-1 text-xs text-rose-300">{fieldErrors.price}</p> : null}
          </label>

          <label className="block text-sm text-slate-300">
            Date & time
            <input type="datetime-local" value={dateTime} onChange={(e) => setDateTime(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none focus:border-cyan-500" />
            {fieldErrors.dateTime ? <p className="mt-1 text-xs text-rose-300">{fieldErrors.dateTime}</p> : null}
          </label>

          <label className="block text-sm text-slate-300">
            Fee paid (optional)
            <input type="number" min="0" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none focus:border-cyan-500" />
          </label>

          <label className="block text-sm text-slate-300">
            Notes (optional)
            <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-500" />
          </label>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving || loading || !selectedMarket}
              className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Add transaction"}
            </button>
            <Link href={backHref} className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-900">
              Back
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}
