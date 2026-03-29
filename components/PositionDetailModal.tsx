"use client";

import { useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatWalletAddress } from "@/src/lib/display";
import { buildFallbackPerformanceSeries, computePerformance } from "@/src/lib/performance";
import type { PortfolioPosition } from "@/src/lib/positions";
import { normalizeTimestamp, resolveTransactionTimestamp, type Transaction, type TransactionUpdate } from "@/src/lib/storage";

type PositionDetailModalProps = {
  transaction: Transaction | PortfolioPosition;
  currentPrice?: number;
  onDelete: (id: string) => void;
  onEdit: (id: string, updates: TransactionUpdate) => void;
  onClose: () => void;
  allowEditing?: boolean;
};

type Range = "1h" | "6h" | "24h" | "3d" | "7d" | "all";

const RANGE_OPTIONS: Range[] = ["1h", "6h", "24h", "3d", "7d", "all"];
const RANGE_MS: Record<Exclude<Range, "all">, number> = {
  "1h": 1 * 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

const formatMoney = (value: number): string => `$${value.toFixed(2)}`;
const formatPct = (value: number): string => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
const formatRangeLabel = (value: Range): string => value.toUpperCase();
const formatChartXAxis = (value: string, range: Range): string => {
  const date = new Date(value);
  if (range === "1h" || range === "6h" || range === "24h") {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};
const formatDateTimeInput = (value: string): string => {
  const normalized = normalizeTimestamp(value);
  if (!normalized) return "";
  const parsed = new Date(normalized);
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

const formatTransactionDateTime = (transaction: Transaction): string => {
  const normalized = resolveTransactionTimestamp(transaction);
  if (!normalized) return "Unknown date";
  return new Date(normalized).toLocaleString();
};
const formatSourceAddress = (value: string | undefined): string => formatWalletAddress(value);

type ChartPoint = {
  timestamp: string;
  price: number;
  kind?: "entry" | "current";
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const getRangeStart = (range: Range, openedAt: number): number | null => {
  if (range === "all") return null;
  return openedAt - RANGE_MS[range];
};

const buildSparseDisplaySeries = (
  points: { timestamp: string; price: number; kind: "entry" | "current" }[],
  range: Range,
  openedAt: number,
): ChartPoint[] => {
  if (points.length === 0) return [];

  const sorted = [...points].sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
  const rangeStart = getRangeStart(range, openedAt);

  if (rangeStart === null) {
    return sorted;
  }

  const filtered = sorted.filter((point) => new Date(point.timestamp).getTime() >= rangeStart);
  const firstVisible = filtered[0];

  if (firstVisible) {
    const output: ChartPoint[] = [];
    if (new Date(firstVisible.timestamp).getTime() > rangeStart) {
      const priorPoint =
        [...sorted].reverse().find((point) => new Date(point.timestamp).getTime() < rangeStart) ?? firstVisible;
      output.push({
        timestamp: new Date(rangeStart).toISOString(),
        price: priorPoint.price,
      });
    }
    return [...output, ...filtered];
  }

  const lastPoint = sorted[sorted.length - 1];
  return [
    {
      timestamp: new Date(rangeStart).toISOString(),
      price: lastPoint.price,
    },
    lastPoint,
  ];
};

const getYAxisDomain = (series: ChartPoint[]): [number, number] => {
  if (series.length === 0) return [0, 1];

  const values = series.map((point) => point.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min;

  if (spread < 0.04) {
    const pad = 0.08;
    return [clamp01(min - pad), clamp01(max + pad)];
  }

  const pad = Math.max(0.03, spread * 0.2);
  return [clamp01(min - pad), clamp01(max + pad)];
};

const getDefaultRange = (transaction: Transaction, currentPrice?: number): Range => {
  if (typeof currentPrice !== "number" || !Number.isFinite(currentPrice)) return "all";

  const series = buildFallbackPerformanceSeries(transaction, currentPrice);
  const cutoff = Date.now() - RANGE_MS["24h"];
  const pointsIn24h = series.filter((point) => new Date(point.timestamp).getTime() >= cutoff);
  return pointsIn24h.length >= 2 ? "24h" : "all";
};

export default function PositionDetailModal({
  transaction,
  currentPrice,
  onDelete,
  onEdit,
  onClose,
  allowEditing = true,
}: PositionDetailModalProps) {
  const [range, setRange] = useState<Range>(() => getDefaultRange(transaction, currentPrice));
  const [openedAt] = useState(() => Date.now());
  const [isEditing, setIsEditing] = useState(false);
  const isWalletTransaction = transaction.source === "wallet";
  const isDerivedPosition = "positionKey" in transaction;
  const tradeCount = "tradeCount" in transaction ? transaction.tradeCount : 1;
  const [editValues, setEditValues] = useState({
    marketTitle: transaction.marketTitle,
    category: transaction.category ?? "",
    side: transaction.side,
    outcome: transaction.outcome,
    shares: String(transaction.shares),
    price: String(transaction.price),
    fee: String(transaction.fee ?? 0),
    timestamp: formatDateTimeInput(transaction.timestamp),
    notes: transaction.notes ?? "",
  });

  const handleSave = () => {
    const shares = Number(editValues.shares);
    const price = Number(editValues.price);
    const fee = Number(editValues.fee);
    const timestamp = new Date(editValues.timestamp);

    if (!Number.isFinite(shares) || shares <= 0) return;
    if (!Number.isFinite(price) || price < 0) return;
    if (!Number.isFinite(fee) || fee < 0) return;
    if (Number.isNaN(timestamp.getTime())) return;

    onEdit(transaction.id, {
      marketTitle: editValues.marketTitle.trim() || transaction.marketTitle,
      category: editValues.category.trim() || undefined,
      side: editValues.side,
      outcome: editValues.outcome,
      shares,
      price,
      fee,
      timestamp: timestamp.toISOString(),
      notes: editValues.notes.trim() || undefined,
    });
    setIsEditing(false);
  };

  const canShowPerformance = typeof currentPrice === "number" && Number.isFinite(currentPrice);
  const perf = canShowPerformance ? computePerformance(transaction, currentPrice) : null;
  const positive = perf ? perf.pnl >= 0 : false;
  const baseSeries = canShowPerformance ? buildFallbackPerformanceSeries(transaction, currentPrice) : [];
  const series = canShowPerformance ? buildSparseDisplaySeries(baseSeries, range, openedAt) : [];
  const isSparseSeries = series.length <= 3;
  const yAxisDomain = getYAxisDomain(series);

  const entryPoint = baseSeries.find((point) => point.kind === "entry");
  const currentPoint = baseSeries.find((point) => point.kind === "current");
  const investedLabel = transaction.side === "SELL" ? "Sale proceeds" : "Invested";
  const currentValueLabel = transaction.side === "SELL" ? "Marked value" : "Current value";

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md">
      <div className="h-full overflow-y-auto">
        <main className="mx-auto min-h-screen w-full max-w-[1100px] px-4 py-5 sm:px-6 lg:px-8">
          <section className="rounded-[36px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,23,42,0.97),rgba(2,6,23,0.99))] p-5 shadow-[0_30px_120px_rgba(2,6,23,0.7)] sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="max-w-3xl">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-2xl border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.18em] text-slate-300 transition hover:bg-white/5"
                >
                  Back
                </button>
                <p className="mt-5 text-[11px] uppercase tracking-[0.3em] text-slate-500">{isDerivedPosition ? "Position Detail" : "Trade Detail"}</p>
                <h1 className="mt-3 text-2xl font-semibold leading-tight text-slate-50 sm:text-4xl">{transaction.marketTitle}</h1>
                <p className="mt-3 text-sm text-slate-400">
                  {transaction.side} {transaction.outcome} - {transaction.shares.toFixed(2)} shares
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 uppercase tracking-[0.18em] text-slate-200">
                    {transaction.source}
                  </span>
                  {transaction.category ? <span>{transaction.category}</span> : null}
                  {transaction.proxyWallet ? (
                    <span className="truncate whitespace-nowrap" title={transaction.proxyWallet}>
                      {formatSourceAddress(transaction.proxyWallet)}
                    </span>
                  ) : transaction.walletAddress ? (
                    <span className="truncate whitespace-nowrap" title={transaction.walletAddress}>
                      {formatSourceAddress(transaction.walletAddress)}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-100">Price history</h2>
                  <p className="mt-1 text-sm text-slate-500">Entry and current quote markers over a prediction-market price scale.</p>
                </div>
                <div className="flex flex-wrap gap-1.5 rounded-full border border-white/8 bg-white/[0.03] p-1">
                  {RANGE_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setRange(option)}
                      className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition ${
                        range === option
                          ? "bg-cyan-400 text-slate-950 shadow-[0_8px_24px_rgba(34,211,238,0.28)]"
                          : "text-slate-300 hover:bg-white/6"
                      }`}
                    >
                      {formatRangeLabel(option)}
                    </button>
                  ))}
                </div>
              </div>

              <div
                className={`mt-4 w-full rounded-[28px] bg-[linear-gradient(180deg,rgba(15,23,42,0.72),rgba(2,6,23,0.92))] p-2 sm:p-3 ${
                  isSparseSeries ? "h-[360px] sm:h-[460px]" : "h-[420px] sm:h-[560px]"
                }`}
              >
                {canShowPerformance ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={series} margin={{ left: 0, right: 10, top: 12, bottom: 0 }}>
                      <defs>
                        <linearGradient id="tradeChartFillPositive" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#34d399" stopOpacity={0.34} />
                          <stop offset="65%" stopColor="#34d399" stopOpacity={0.08} />
                          <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="tradeChartFillNegative" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#fb7185" stopOpacity={0.34} />
                          <stop offset="65%" stopColor="#fb7185" stopOpacity={0.08} />
                          <stop offset="100%" stopColor="#fb7185" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#172033" vertical={false} />
                      <XAxis
                        dataKey="timestamp"
                        tickFormatter={(value: string) => formatChartXAxis(value, range)}
                        axisLine={false}
                        tickLine={false}
                        dy={10}
                        stroke="#6b7b93"
                        fontSize={11}
                      />
                      <YAxis
                        domain={yAxisDomain}
                        axisLine={false}
                        tickLine={false}
                        dx={-4}
                        stroke="#6b7b93"
                        fontSize={11}
                        tickFormatter={(value: number) => value.toFixed(2)}
                      />
                      <Tooltip
                        contentStyle={{ background: "#0b1120", border: "1px solid #243247", borderRadius: 14 }}
                        labelFormatter={(value) => new Date(String(value ?? "")).toLocaleString()}
                        formatter={(value) => [typeof value === "number" ? value.toFixed(3) : String(value ?? ""), "Price"]}
                      />
                      <Area
                        type="stepAfter"
                        dataKey="price"
                        stroke="none"
                        fill={positive ? "url(#tradeChartFillPositive)" : "url(#tradeChartFillNegative)"}
                        isAnimationActive={false}
                      />
                      <Line
                        type="stepAfter"
                        dataKey="price"
                        stroke={positive ? "#34d399" : "#fb7185"}
                        strokeWidth={3.5}
                        dot={{ r: 2.5, fill: positive ? "#34d399" : "#fb7185", strokeWidth: 0 }}
                        activeDot={{ r: 5, stroke: "#020617", strokeWidth: 2, fill: positive ? "#34d399" : "#fb7185" }}
                        isAnimationActive={false}
                      />
                      {entryPoint ? (
                        <ReferenceDot x={entryPoint.timestamp} y={entryPoint.price} r={6} fill="#22d3ee" stroke="#020617" strokeWidth={2} />
                      ) : null}
                      {currentPoint ? (
                        <ReferenceDot x={currentPoint.timestamp} y={currentPoint.price} r={6} fill="#f8fafc" stroke="#020617" strokeWidth={2} />
                      ) : null}
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">
                    Current pricing is unavailable for this transaction right now.
                  </div>
                )}
              </div>
            </div>

            <section className="mt-8 rounded-[30px] border border-white/8 bg-white/[0.03] p-5">
              <h2 className="text-lg font-semibold text-slate-100">Key stats</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  { label: investedLabel, value: perf ? formatMoney(perf.invested) : "--" },
                  { label: currentValueLabel, value: perf ? formatMoney(perf.currentValue) : "--" },
                  {
                    label: "PnL",
                    value: perf ? `${formatMoney(perf.pnl)} (${formatPct(perf.pnlPct)})` : "--",
                    tone: perf ? (perf.pnl >= 0 ? "text-emerald-300" : "text-rose-300") : "text-slate-100",
                  },
                  { label: "Avg entry", value: formatMoney(transaction.price) },
                  ...(transaction.side === "SELL" ? [{ label: "Cost to close", value: perf ? formatMoney(perf.closeCost ?? 0) : "--" }] : []),
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-white/8 bg-slate-950/40 p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                    <p className={`mt-2 text-sm font-medium ${item.tone ?? "text-slate-100"}`}>{item.value}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-4 rounded-[30px] border border-white/8 bg-white/[0.03] p-5">
              <h2 className="text-lg font-semibold text-slate-100">Transaction history</h2>
              <p className="mt-1 text-sm text-slate-500">
                {isDerivedPosition ? `This position currently aggregates ${tradeCount} recorded fill${tradeCount === 1 ? "" : "s"}.` : "This position currently contains a single recorded fill."}
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/8 bg-slate-950/40 p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Date</p>
                  <p className="mt-2 text-sm text-slate-100">{formatTransactionDateTime(transaction)}</p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-slate-950/40 p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Source</p>
                  <p className="mt-2 text-sm text-slate-100">{transaction.source === "wallet" ? "Wallet sync" : "Manual entry"}</p>
                </div>
                {transaction.connectedWalletAddress ? (
                  <div className="rounded-2xl border border-white/8 bg-slate-950/40 p-4 sm:col-span-2">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Connected wallet</p>
                    <p className="mt-2 truncate whitespace-nowrap text-sm text-slate-100" title={transaction.connectedWalletAddress}>
                      {formatSourceAddress(transaction.connectedWalletAddress)}
                    </p>
                  </div>
                ) : null}
                {transaction.proxyWallet ? (
                  <div className="rounded-2xl border border-white/8 bg-slate-950/40 p-4 sm:col-span-2">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Polymarket proxy wallet</p>
                    <p className="mt-2 truncate whitespace-nowrap text-sm text-slate-100" title={transaction.proxyWallet}>
                      {formatSourceAddress(transaction.proxyWallet)}
                    </p>
                  </div>
                ) : null}
                <div className="rounded-2xl border border-white/8 bg-slate-950/40 p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Shares</p>
                  <p className="mt-2 text-sm text-slate-100">{transaction.shares.toFixed(2)}</p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-slate-950/40 p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Fee</p>
                  <p className="mt-2 text-sm text-slate-100">{formatMoney(transaction.fee ?? 0)}</p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-slate-950/40 p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Position summary</p>
                  <p className="mt-2 text-sm text-slate-100">
                    {transaction.side} {transaction.outcome} at {formatMoney(transaction.price)}
                  </p>
                </div>
                {transaction.externalTradeId ? (
                  <div className="rounded-2xl border border-white/8 bg-slate-950/40 p-4 sm:col-span-2">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">External trade ID</p>
                    <p className="mt-2 break-all text-sm text-slate-100">{transaction.externalTradeId}</p>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 rounded-2xl border border-white/8 bg-slate-950/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Notes</p>
                  {!transaction.notes?.trim() && !isEditing && allowEditing ? (
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className="text-xs font-medium text-cyan-300 transition hover:text-cyan-200"
                    >
                      Add note
                    </button>
                  ) : null}
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-200">{transaction.notes?.trim() || "No notes added yet"}</p>
              </div>

              {isEditing && allowEditing ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm text-slate-300 sm:col-span-2">
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Market title</span>
                    <input
                      type="text"
                      value={editValues.marketTitle}
                      disabled={isWalletTransaction}
                      onChange={(event) => setEditValues((current) => ({ ...current, marketTitle: event.target.value }))}
                      className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-slate-100 outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300 sm:col-span-2">
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Category</span>
                    <input
                      type="text"
                      value={editValues.category}
                      disabled={isWalletTransaction}
                      onChange={(event) => setEditValues((current) => ({ ...current, category: event.target.value }))}
                      className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-slate-100 outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300">
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Side</span>
                    <select
                      value={editValues.side}
                      disabled={isWalletTransaction}
                      onChange={(event) => setEditValues((current) => ({ ...current, side: event.target.value as Transaction["side"] }))}
                      className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-slate-100 outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="BUY">BUY</option>
                      <option value="SELL">SELL</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300">
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Outcome</span>
                    <select
                      value={editValues.outcome}
                      disabled={isWalletTransaction}
                      onChange={(event) => setEditValues((current) => ({ ...current, outcome: event.target.value as Transaction["outcome"] }))}
                      className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-slate-100 outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="YES">YES</option>
                      <option value="NO">NO</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300">
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Shares</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editValues.shares}
                      disabled={isWalletTransaction}
                      onChange={(event) => setEditValues((current) => ({ ...current, shares: event.target.value }))}
                      className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-slate-100 outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300">
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Entry price</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editValues.price}
                      disabled={isWalletTransaction}
                      onChange={(event) => setEditValues((current) => ({ ...current, price: event.target.value }))}
                      className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-slate-100 outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300">
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Fee</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editValues.fee}
                      disabled={isWalletTransaction}
                      onChange={(event) => setEditValues((current) => ({ ...current, fee: event.target.value }))}
                      className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-slate-100 outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300 sm:col-span-2">
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Date</span>
                    <input
                      type="datetime-local"
                      value={editValues.timestamp}
                      disabled={isWalletTransaction}
                      onChange={(event) => setEditValues((current) => ({ ...current, timestamp: event.target.value }))}
                      className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-slate-100 outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300 sm:col-span-2">
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Trade notes</span>
                    <textarea
                      value={editValues.notes}
                      onChange={(event) => setEditValues((current) => ({ ...current, notes: event.target.value }))}
                      rows={5}
                      className="resize-none rounded-xl border border-white/10 bg-slate-950/80 px-3 py-3 leading-7 text-slate-100 outline-none"
                      placeholder="Why did you take this trade? What was your thesis or plan?"
                    />
                  </label>
                  {isWalletTransaction ? (
                    <p className="text-xs text-slate-500 sm:col-span-2">Wallet-synced trade fields are locked. Notes remain editable.</p>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-white/8 pt-5">
                {allowEditing && isEditing ? (
                  <>
                    <button
                      type="button"
                      onClick={handleSave}
                      className="rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                    >
                      Save changes
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-slate-300 transition hover:bg-white/5"
                    >
                      Cancel
                    </button>
                  </>
                ) : allowEditing ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-slate-200 transition hover:bg-white/5"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onDelete(transaction.id);
                        onClose();
                      }}
                      className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 transition hover:bg-rose-500/15"
                    >
                      Delete
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-slate-300 transition hover:bg-white/5"
                  >
                    Close
                  </button>
                )}
              </div>
            </section>
          </section>
        </main>
      </div>
    </div>
  );
}
