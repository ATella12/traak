"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { SearchEventRow, SearchMarketResult } from "@/src/lib/gammaSearch";
import { sortMarketsForEvent } from "@/src/lib/gammaSearch";
import { addTransaction } from "@/src/lib/storage";

type Side = "BUY" | "SELL";
type Outcome = "YES" | "NO";

type EventResponse = {
  stale: boolean;
  error?: string;
  event?: SearchEventRow;
  markets: SearchMarketResult[];
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

export default function AddTransactionFromEventPage() {
  const router = useRouter();
  const params = useParams<{ eventSlug: string }>();
  const searchParams = useSearchParams();

  const eventSlug = params.eventSlug;
  const fallbackCategory = (searchParams.get("cat") ?? "").trim();

  const [eventData, setEventData] = useState<SearchEventRow | null>(null);
  const [markets, setMarkets] = useState<SearchMarketResult[]>([]);
  const [selectedMarketId, setSelectedMarketId] = useState<string>("");
  const [loadingEvent, setLoadingEvent] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);

  const [side, setSide] = useState<Side>("BUY");
  const [outcome, setOutcome] = useState<Outcome>("YES");
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("0");
  const [dateTime, setDateTime] = useState(getDefaultDateTimeLocal());
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
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
        setSelectedMarketId(sorted[0]?.marketId ?? "");
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
  }, [eventSlug]);

  const selectedMarket = useMemo(
    () => markets.find((market) => market.marketId === selectedMarketId) ?? markets[0] ?? null,
    [markets, selectedMarketId],
  );

  const category = eventData?.primaryCategoryLine || eventData?.eventTitle || fallbackCategory || "Other";
  const question = selectedMarket?.question || eventData?.eventTitle || "Add transaction";

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedMarket) {
      setErrors(["Please select a market option first."]);
      return;
    }

    const nextErrors: string[] = [];
    const parsedShares = Number(shares);
    const parsedPrice = Number(price);
    const parsedFee = Number(fee);
    const parsedDate = new Date(dateTime);

    if (!question.trim()) nextErrors.push("Market question is required.");
    if (!Number.isFinite(parsedShares) || parsedShares <= 0) nextErrors.push("Shares must be greater than 0.");
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0 || parsedPrice > 1) nextErrors.push("Price per share must be between 0 and 1.");
    if (!Number.isFinite(parsedFee) || parsedFee < 0) nextErrors.push("Fee paid must be 0 or more.");
    if (!dateTime || Number.isNaN(parsedDate.getTime())) nextErrors.push("Please choose a valid date and time.");

    if (nextErrors.length > 0) {
      setErrors(nextErrors);
      return;
    }

    addTransaction({
      market: {
        slug: selectedMarket.slug,
        question: selectedMarket.question,
        category,
      },
      side,
      outcome,
      shares: parsedShares,
      price: parsedPrice,
      fee: parsedFee,
      timestamp: parsedDate.toISOString(),
      notes: notes.trim() || undefined,
    });

    router.push("/portfolio");
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-2xl shadow-black/30 sm:p-8">
        <p className="text-xs uppercase tracking-wide text-slate-400">{category}</p>
        {eventData?.eventTitle ? <p className="mt-1 text-sm text-slate-300">{eventData.eventTitle}</p> : null}
        <h1 className="mt-2 text-xl font-semibold leading-tight text-slate-50">{question}</h1>

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

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-slate-300 sm:col-span-2">
              Market question
              <input
                type="text"
                value={question}
                readOnly
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/40 px-4 py-3 text-slate-100 outline-none"
              />
            </label>

            <label className="text-sm text-slate-300 sm:col-span-2">
              Category
              <input
                type="text"
                value={category}
                readOnly
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/40 px-4 py-3 text-slate-100 outline-none"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-sm text-slate-300">Side</p>
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-1">
                <button type="button" onClick={() => setSide("BUY")} className={`rounded-lg px-3 py-2 text-sm font-medium transition ${side === "BUY" ? "bg-cyan-500 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>BUY</button>
                <button type="button" onClick={() => setSide("SELL")} className={`rounded-lg px-3 py-2 text-sm font-medium transition ${side === "SELL" ? "bg-cyan-500 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>SELL</button>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm text-slate-300">Outcome</p>
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-1">
                <button type="button" onClick={() => setOutcome("YES")} className={`rounded-lg px-3 py-2 text-sm font-medium transition ${outcome === "YES" ? "bg-cyan-500 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>YES</button>
                <button type="button" onClick={() => setOutcome("NO")} className={`rounded-lg px-3 py-2 text-sm font-medium transition ${outcome === "NO" ? "bg-cyan-500 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>NO</button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-slate-300">Shares
              <input type="number" min="0.000001" step="any" value={shares} onChange={(e) => setShares(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none focus:border-cyan-500" placeholder="0" />
            </label>
            <label className="text-sm text-slate-300">Price per share
              <input type="number" min="0" max="1" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none focus:border-cyan-500" placeholder="0.50" />
            </label>
            <label className="text-sm text-slate-300">Fee paid
              <input type="number" min="0" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none focus:border-cyan-500" placeholder="0.00" />
            </label>
            <label className="text-sm text-slate-300">Date and time
              <input type="datetime-local" value={dateTime} onChange={(e) => setDateTime(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none focus:border-cyan-500" />
            </label>
          </div>

          <label className="block text-sm text-slate-300">Notes (optional)
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-500" placeholder="Any context for this trade..." />
          </label>

          {errors.length > 0 ? (
            <div className="rounded-xl border border-rose-600/40 bg-rose-900/20 p-3 text-sm text-rose-200">
              <ul className="space-y-1">{errors.map((error) => <li key={error}>{error}</li>)}</ul>
            </div>
          ) : null}

          <div className="flex items-center gap-3">
            <button type="submit" className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">Add Transaction</button>
            <Link href="/portfolio/manual" className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-900">Back</Link>
          </div>
        </form>
      </section>
    </main>
  );
}
