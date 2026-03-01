"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { addTransaction } from "@/src/lib/storage";
import type { SearchEventRow } from "@/src/lib/gammaSearch";

type Side = "BUY" | "SELL";
type Outcome = "YES" | "NO";

type SearchResponse = {
  q: string;
  stale: boolean;
  error?: string;
  results: SearchEventRow[];
};

const getDefaultDateTimeLocal = (): string => {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
};

const normalizeQueryText = (value: string): string => value.replace(/[-_]+/g, " ").trim();

export default function AddTransactionFromGlobalPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();

  const slug = params.slug;
  const queryQuestion = (searchParams.get("q") ?? "").trim();
  const queryCategory = (searchParams.get("cat") ?? "").trim();
  const queryMarketId = (searchParams.get("mid") ?? "").trim();

  const [question, setQuestion] = useState(queryQuestion || normalizeQueryText(slug));
  const [category, setCategory] = useState(queryCategory || "Other");
  const [resolvedMarketId, setResolvedMarketId] = useState(queryMarketId || "");
  const [marketDetailsWarning, setMarketDetailsWarning] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const [side, setSide] = useState<Side>("BUY");
  const [outcome, setOutcome] = useState<Outcome>("YES");
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("0");
  const [dateTime, setDateTime] = useState(getDefaultDateTimeLocal());
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const needsLookup = useMemo(() => !queryQuestion || !queryCategory, [queryCategory, queryQuestion]);

  useEffect(() => {
    if (!needsLookup) return;

    let isCancelled = false;
    const run = async () => {
      setResolving(true);
      try {
        const lookupQuery = queryQuestion || normalizeQueryText(slug);
        const response = await fetch(`/api/markets/search?q=${encodeURIComponent(lookupQuery)}&limit_per_type=20`);
        const data = (await response.json()) as SearchResponse;
        if (isCancelled) return;

        const exact = data.results.find((item) => item.displayMarket.slug === slug);
        const first = exact ?? data.results[0];

        if (first) {
          setQuestion(first.displayMarket.question);
          setCategory(first.primaryCategoryLine || first.eventTitle || "Other");
          setResolvedMarketId(first.displayMarket.marketId || queryMarketId);
          setMarketDetailsWarning(null);
        } else {
          setCategory((current) => current || "Other");
          setMarketDetailsWarning("Market details unavailable. You can still add a transaction and edit the market fields.");
        }
      } catch {
        if (isCancelled) return;
        setCategory((current) => current || "Other");
        setMarketDetailsWarning("Live lookup is unavailable. You can still add a transaction manually.");
      } finally {
        if (!isCancelled) setResolving(false);
      }
    };

    void run();

    return () => {
      isCancelled = true;
    };
  }, [needsLookup, queryMarketId, queryQuestion, slug]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors: string[] = [];
    const parsedShares = Number(shares);
    const parsedPrice = Number(price);
    const parsedFee = Number(fee);
    const parsedDate = new Date(dateTime);
    const cleanedQuestion = question.trim();
    const cleanedCategory = category.trim() || "Other";

    if (!cleanedQuestion) {
      nextErrors.push("Market question is required.");
    }

    if (!Number.isFinite(parsedShares) || parsedShares <= 0) {
      nextErrors.push("Shares must be greater than 0.");
    }

    if (!Number.isFinite(parsedPrice) || parsedPrice < 0 || parsedPrice > 1) {
      nextErrors.push("Price per share must be between 0 and 1.");
    }

    if (!Number.isFinite(parsedFee) || parsedFee < 0) {
      nextErrors.push("Fee paid must be 0 or more.");
    }

    if (!dateTime || Number.isNaN(parsedDate.getTime())) {
      nextErrors.push("Please choose a valid date and time.");
    }

    if (nextErrors.length > 0) {
      setErrors(nextErrors);
      return;
    }

    addTransaction({
      market: {
        slug,
        question: cleanedQuestion,
        category: cleanedCategory,
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
        <p className="text-xs uppercase tracking-wide text-slate-400">{category || "Other"}</p>
        <h1 className="mt-2 text-xl font-semibold leading-tight text-slate-50">{question || "Add transaction"}</h1>

        {resolvedMarketId ? <p className="mt-1 text-xs text-slate-500">Market resolved from live search.</p> : null}
        {resolving ? <p className="mt-2 text-sm text-slate-400">Loading market details...</p> : null}
        {marketDetailsWarning ? (
          <p className="mt-2 rounded-lg border border-amber-600/40 bg-amber-900/20 px-3 py-2 text-sm text-amber-200">
            {marketDetailsWarning}
          </p>
        ) : null}

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-slate-300 sm:col-span-2">
              Market question
              <input
                type="text"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none focus:border-cyan-500"
                placeholder="Enter market question"
              />
            </label>

            <label className="text-sm text-slate-300 sm:col-span-2">
              Category
              <input
                type="text"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none focus:border-cyan-500"
                placeholder="Other"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-sm text-slate-300">Side</p>
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-1">
                <button
                  type="button"
                  onClick={() => setSide("BUY")}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                    side === "BUY" ? "bg-cyan-500 text-slate-950" : "text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  BUY
                </button>
                <button
                  type="button"
                  onClick={() => setSide("SELL")}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                    side === "SELL" ? "bg-cyan-500 text-slate-950" : "text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  SELL
                </button>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm text-slate-300">Outcome</p>
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-1">
                <button
                  type="button"
                  onClick={() => setOutcome("YES")}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                    outcome === "YES" ? "bg-cyan-500 text-slate-950" : "text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  YES
                </button>
                <button
                  type="button"
                  onClick={() => setOutcome("NO")}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                    outcome === "NO" ? "bg-cyan-500 text-slate-950" : "text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  NO
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-slate-300">
              Shares
              <input
                type="number"
                min="0.000001"
                step="any"
                value={shares}
                onChange={(event) => setShares(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none focus:border-cyan-500"
                placeholder="0"
              />
            </label>

            <label className="text-sm text-slate-300">
              Price per share
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none focus:border-cyan-500"
                placeholder="0.50"
              />
            </label>

            <label className="text-sm text-slate-300">
              Fee paid
              <input
                type="number"
                min="0"
                step="0.01"
                value={fee}
                onChange={(event) => setFee(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none focus:border-cyan-500"
                placeholder="0.00"
              />
            </label>

            <label className="text-sm text-slate-300">
              Date and time
              <input
                type="datetime-local"
                value={dateTime}
                onChange={(event) => setDateTime(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none focus:border-cyan-500"
              />
            </label>
          </div>

          <label className="block text-sm text-slate-300">
            Notes (optional)
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-500"
              placeholder="Any context for this trade..."
            />
          </label>

          {errors.length > 0 ? (
            <div className="rounded-xl border border-rose-600/40 bg-rose-900/20 p-3 text-sm text-rose-200">
              <ul className="space-y-1">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
            >
              Add Transaction
            </button>
            <Link
              href="/portfolio/manual"
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-900"
            >
              Back
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}
