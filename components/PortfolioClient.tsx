"use client";

import Link from "next/link";
import { useEffect, useMemo, useSyncExternalStore, useState } from "react";

import OptionCard from "@/components/OptionCard";
import PositionDetailModal from "@/components/PositionDetailModal";
import { formatWalletAddress } from "@/src/lib/display";
import { computePerformance, getCurrentPriceForTx } from "@/src/lib/performance";
import type { SearchEventRow, SearchMarketResult } from "@/src/lib/gammaSearch";
import { findMatchingPortfolioMarket, getWalletImportedConditionId, getWalletImportedEventSlug } from "@/src/lib/portfolioLookup";
import { derivePortfolioPositions, getPortfolioPositionDisplayStatus } from "@/src/lib/positions";
import {
  clearTransactions,
  initTransactionsFromStorage,
  listTransactions,
  resolveTransactionTimestamp,
  subscribeTransactions,
  type Transaction,
} from "@/src/lib/storage";

type SearchResponse = {
  results: SearchEventRow[];
};

type EventDetailResponse = {
  event?: SearchEventRow;
  markets: SearchMarketResult[];
};

const EMPTY_TX: Transaction[] = [];

const formatMoney = (value: number): string => `$${value.toFixed(2)}`;
const formatSignedMoney = (value: number): string => `${value >= 0 ? "+" : "-"}$${Math.abs(value).toFixed(2)}`;
const formatPct = (value: number): string => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
const formatDate = (transaction: Transaction): string => {
  const normalized = resolveTransactionTimestamp(transaction);
  if (!normalized) return "Unknown date";
  return new Date(normalized).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};
const formatSourceLabel = (value: Transaction["source"]): string => (value === "wallet" ? "Wallet" : "Manual");
const formatSourceValue = (transaction: Transaction): string => {
  if (transaction.source !== "wallet") return "";
  return formatWalletAddress(transaction.proxyWallet ?? transaction.walletAddress);
};

const getPortfolioLookupKey = (transaction: Transaction): string => {
  if (transaction.source !== "wallet") {
    return transaction.marketId || transaction.marketTitle;
  }

  const conditionId = getWalletImportedConditionId(transaction);
  const eventSlug = getWalletImportedEventSlug(transaction);
  return ["wallet", conditionId ?? transaction.marketId.trim(), transaction.outcome, eventSlug ?? ""].join("|");
};

const resolveCurrentPriceForTransaction = async (tx: Transaction, signal: AbortSignal): Promise<number | null> => {
  if (tx.source === "wallet") {
    const conditionId = getWalletImportedConditionId(tx);
    const eventSlug = getWalletImportedEventSlug(tx);
    if (!conditionId || !eventSlug) return null;

    const detailResponse = await fetch(`/api/markets/event/${encodeURIComponent(eventSlug)}`, { signal });
    const detailData = (await detailResponse.json()) as EventDetailResponse;
    const markets = Array.isArray(detailData.markets) ? detailData.markets : [];
    const matchedMarket = findMatchingPortfolioMarket(tx, markets);
    if (!matchedMarket) return null;

    return getCurrentPriceForTx(tx, matchedMarket);
  }

  const query = tx.marketTitle.trim() || tx.marketId.trim();
  if (!query) return null;

  const searchResponse = await fetch(`/api/markets/search?q=${encodeURIComponent(query)}&limit_per_type=8&events_status=all`, { signal });
  const searchData = (await searchResponse.json()) as SearchResponse;
  const events = Array.isArray(searchData.results) ? searchData.results : [];

  for (const event of events.slice(0, 4)) {
    try {
      const detailResponse = await fetch(`/api/markets/event/${encodeURIComponent(event.eventSlug)}`, { signal });
      const detailData = (await detailResponse.json()) as EventDetailResponse;
      const markets = Array.isArray(detailData.markets) ? detailData.markets : [];
      const matchedMarket = findMatchingPortfolioMarket(tx, markets);
      if (!matchedMarket) continue;

      const resolved = getCurrentPriceForTx(tx, matchedMarket);
      if (resolved !== null) return resolved;
    } catch {
      continue;
    }
  }

  for (const event of events) {
    const resolved = getCurrentPriceForTx(tx, event.displayMarket);
    if (resolved !== null) return resolved;
  }

  return null;
};

export default function PortfolioClient() {
  const transactions = useSyncExternalStore(subscribeTransactions, listTransactions, () => EMPTY_TX);
  const [currentPriceById, setCurrentPriceById] = useState<Record<string, number>>({});
  const [selectedPositionKey, setSelectedPositionKey] = useState<string | null>(null);

  useEffect(() => {
    initTransactionsFromStorage();
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;

    const firstTransaction = transactions[0];
    if (!firstTransaction) return;

    console.debug("[portfolio] rendered transaction", {
      transaction: firstTransaction,
      displayedTimestamp: firstTransaction.timestamp,
      resolvedTimestamp: resolveTransactionTimestamp(firstTransaction) ?? "Unknown date",
    });
  }, [transactions]);

  useEffect(() => {
    if (transactions.length === 0) return;

    let cancelled = false;
    const controller = new AbortController();

    const run = async () => {
      const uniqueMarkets = new Map<string, Transaction>();
      for (const tx of transactions) {
        const key = getPortfolioLookupKey(tx);
        if (!uniqueMarkets.has(key)) uniqueMarkets.set(key, tx);
      }

      const lookups = await Promise.all(
        [...uniqueMarkets.values()].map(async (tx) => {
          try {
            const price = await resolveCurrentPriceForTransaction(tx, controller.signal);
            return { key: getPortfolioLookupKey(tx), price };
          } catch {
            return { key: getPortfolioLookupKey(tx), price: null };
          }
        }),
      );

      if (cancelled) return;

      const priceByMarketKey: Record<string, number> = {};
      for (const lookup of lookups) {
        if (lookup.price !== null && Number.isFinite(lookup.price)) {
          priceByMarketKey[lookup.key] = lookup.price;
        }
      }

      const nextById: Record<string, number> = {};
      for (const tx of transactions) {
        const key = getPortfolioLookupKey(tx);
        const price = priceByMarketKey[key];
        if (typeof price === "number") nextById[tx.id] = price;
      }

      setCurrentPriceById(nextById);
    };

    void run();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [transactions]);

  const { openPositions, closedPositions } = useMemo(() => derivePortfolioPositions(transactions), [transactions]);
  const selectedPosition = useMemo(
    () => openPositions.find((position) => position.positionKey === selectedPositionKey) ?? null,
    [openPositions, selectedPositionKey],
  );

  const positionMetrics = useMemo(
    () =>
      openPositions.map((position) => {
        const currentPrice = currentPriceById[position.latestFillId];
        const performance =
          typeof currentPrice === "number" && Number.isFinite(currentPrice)
            ? computePerformance(position, currentPrice)
            : null;

        return { position, currentPrice, performance };
      }),
    [currentPriceById, openPositions],
  );

  const portfolioSummary = useMemo(() => {
    return positionMetrics.reduce(
      (summary, item) => {
        if (!item.performance) return summary;

        summary.invested += item.performance.invested;
        summary.currentValue += item.performance.currentValue;
        summary.pnl += item.performance.pnl;
        return summary;
      },
      { invested: 0, currentValue: 0, pnl: 0 },
    );
  }, [positionMetrics]);

  const portfolioPnlPct = portfolioSummary.invested > 0 ? portfolioSummary.pnl / portfolioSummary.invested : 0;
  const quotedPositions = positionMetrics.filter((item) => item.performance).length;
  const hasTransactions = transactions.length > 0;
  const selectedCurrentPrice = selectedPosition ? currentPriceById[selectedPosition.latestFillId] : undefined;

  const handleReset = () => {
    if (!window.confirm("Clear all transactions? This cannot be undone.")) return;
    clearTransactions();
    setSelectedPositionKey(null);
  };

  if (!hasTransactions) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-65px)] w-full max-w-6xl items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
        <section className="w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-2xl shadow-black/30 sm:p-8">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-50">Portfolio</h1>
          <p className="mt-3 text-base text-slate-300">Let&apos;s get started with your first portfolio.</p>

          <div className="mt-8 grid gap-4">
            <OptionCard
              href="/portfolio/connect"
              title="Connect a wallet"
              description="Connect your wallet, resolve the Polymarket proxy wallet, and sync trades."
            />
            <OptionCard
              href="/portfolio/manual"
              title="Add positions manually"
              description="Enter your positions at your own pace to track your portfolio."
            />
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[980px] px-4 py-8 sm:px-6 lg:px-8">
      <section className="relative overflow-hidden rounded-[36px] border border-white/8 bg-[radial-gradient(circle_at_top,#1e293b_0%,#0f172a_48%,#020617_100%)] p-6 shadow-[0_30px_120px_rgba(2,6,23,0.85)] sm:p-8">
        <div className="absolute inset-x-0 top-0 h-52 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.14),transparent_58%)]" />

        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-200/70">Traak Portfolio</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">Portfolio Positions</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
                Netted positions only. This page mirrors the manual flow by summarizing remaining exposure per market with simple current or resolved P/L.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="rounded-2xl border border-white/10 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-white/5"
              >
                Reset
              </button>
              <Link
                href="/portfolio/connect"
                className="rounded-2xl border border-white/10 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-white/5"
              >
                Sync Wallet
              </Link>
              <Link
                href="/portfolio/manual"
                className="rounded-2xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
              >
                Add Transaction
              </Link>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-4">
            <div className="rounded-[30px] border border-white/8 bg-white/[0.04] p-6 shadow-[0_20px_50px_rgba(15,23,42,0.35)] md:col-span-2">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Net portfolio value</p>
              <p className="mt-4 text-4xl font-semibold tracking-tight text-slate-50">{formatMoney(portfolioSummary.currentValue)}</p>
              <p className={`mt-3 text-sm font-medium ${portfolioSummary.pnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                {formatSignedMoney(portfolioSummary.pnl)} ({formatPct(portfolioPnlPct)})
              </p>
            </div>
            {[
              { label: "Invested capital", value: formatMoney(portfolioSummary.invested) },
              { label: "Open positions", value: String(openPositions.length) },
              { label: "Closed positions", value: String(closedPositions.length) },
              { label: "Quoted positions", value: `${quotedPositions}/${openPositions.length || 0}` },
            ].map((item) => (
              <div key={item.label} className="rounded-[30px] border border-white/8 bg-white/[0.04] p-6 shadow-[0_20px_50px_rgba(15,23,42,0.28)]">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{item.label}</p>
                <p className="mt-4 text-2xl font-semibold text-slate-100">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-10">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Positions</h2>
              <p className="mt-1 text-sm text-slate-400">No raw fills are rendered here. Each card represents one derived net position.</p>
            </div>

            {positionMetrics.length > 0 ? (
              <div className="mt-5 space-y-4">
                {positionMetrics.map(({ position, currentPrice, performance }) => (
                  (() => {
                    const displayStatus = getPortfolioPositionDisplayStatus(position, currentPrice);
                    const statusClass =
                      displayStatus === "WON"
                        ? "border border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                        : displayStatus === "LOST"
                          ? "border border-rose-400/20 bg-rose-400/10 text-rose-200"
                          : displayStatus === "CLOSED"
                            ? "border border-slate-400/20 bg-slate-400/10 text-slate-200"
                            : "border border-cyan-400/20 bg-cyan-400/10 text-cyan-200";

                    return (
                  <button
                    key={position.positionKey}
                    type="button"
                    onClick={() => setSelectedPositionKey(position.positionKey)}
                    className="w-full cursor-pointer rounded-[30px] border border-white/8 bg-white/[0.03] p-5 text-left shadow-[0_18px_50px_rgba(2,6,23,0.24)] transition hover:border-white/15 hover:bg-white/[0.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <p className="text-base font-semibold leading-6 text-slate-100">{position.marketTitle}</p>
                        <span className="inline-flex w-fit flex-none items-center justify-center self-center whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase leading-none tracking-[0.18em] text-slate-300">
                          {formatSourceLabel(position.source)}
                        </span>
                        <span className={`inline-flex w-fit flex-none items-center justify-center self-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] uppercase leading-none tracking-[0.18em] ${statusClass}`}>
                          {displayStatus}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">{position.category ?? "Uncategorized"}</p>
                    </div>
                      <p className={`text-sm font-semibold ${performance && performance.pnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                        {performance ? formatSignedMoney(performance.pnl) : "--"}
                      </p>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      <div className="rounded-2xl border border-white/8 bg-slate-950/40 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Side</p>
                        <p className="mt-2 text-sm font-medium text-slate-100">
                          {position.side} {position.outcome}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-slate-950/40 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Net shares</p>
                        <p className="mt-2 text-sm font-medium text-slate-100">{position.shares.toFixed(2)}</p>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-slate-950/40 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Avg entry</p>
                        <p className="mt-2 text-sm font-medium text-slate-100">{formatMoney(position.price)}</p>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-slate-950/40 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Current value</p>
                        <p className="mt-2 text-sm font-medium text-slate-100">{performance ? formatMoney(performance.currentValue) : "--"}</p>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-slate-950/40 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Last activity</p>
                        <p className="mt-2 text-sm font-medium text-slate-100">{formatDate(position)}</p>
                        <p className="mt-1 text-xs text-slate-500">Avg entry across {position.tradeCount} fill{position.tradeCount === 1 ? "" : "s"}</p>
                        {position.source === "wallet" && (position.proxyWallet || position.walletAddress) ? (
                          <p
                            className="mt-1 max-w-full truncate whitespace-nowrap text-xs text-slate-500"
                            title={position.proxyWallet ?? position.walletAddress}
                          >
                            {formatSourceValue(position)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </button>
                    );
                  })()
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-[30px] border border-white/8 bg-white/[0.03] p-6 text-sm text-slate-400">
                No open positions remain. Closed positions are summarized above.
              </div>
            )}
          </div>
        </div>
      </section>

      {selectedPosition ? (
        <PositionDetailModal
          key={selectedPosition.positionKey}
          transaction={selectedPosition}
          currentPrice={selectedCurrentPrice}
          onDelete={() => {}}
          onEdit={() => null}
          onClose={() => setSelectedPositionKey(null)}
          allowEditing={false}
        />
      ) : null}
    </main>
  );
}
