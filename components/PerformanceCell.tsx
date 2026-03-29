"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts";

import { buildFallbackPerformanceSeries, computePerformance } from "@/src/lib/performance";
import type { Transaction } from "@/src/lib/storage";

type PerformanceCellProps = {
  transaction: Transaction;
  currentPrice?: number;
};

const formatMoney = (value: number): string => `$${value.toFixed(2)}`;
const formatPct = (value: number): string => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;

export default function PerformanceCell({ transaction, currentPrice }: PerformanceCellProps) {
  if (typeof currentPrice !== "number" || !Number.isFinite(currentPrice)) {
    return <p className="text-xs text-slate-500">Performance unavailable</p>;
  }

  const perf = computePerformance(transaction, currentPrice);
  const positive = perf.pnl >= 0;
  const series = buildFallbackPerformanceSeries(transaction, currentPrice);

  return (
    <div className="min-w-[220px] space-y-1">
      <p className="text-xs text-slate-400">
        Invested <span className="font-medium text-slate-200">{formatMoney(perf.invested)}</span>
      </p>
      <p className="text-xs text-slate-400">
        Current value <span className="font-medium text-slate-200">{formatMoney(perf.currentValue)}</span>
      </p>
      <p className={`text-sm font-semibold ${positive ? "text-emerald-300" : "text-rose-300"}`}>
        {formatMoney(perf.pnl)} ({formatPct(perf.pnlPct)})
      </p>
      <p className="text-[11px] text-slate-500">
        Entry {transaction.price.toFixed(3)} - Current {currentPrice.toFixed(3)}
      </p>
      <div className="h-10 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series}>
            <Tooltip
              contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
              formatter={(value) => (typeof value === "number" ? value.toFixed(3) : String(value ?? ""))}
              labelFormatter={(label) => String(label ?? "")}
            />
            <Line
              dataKey="price"
              stroke={positive ? "#34d399" : "#fb7185"}
              strokeWidth={2}
              dot={false}
              type="monotone"
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
