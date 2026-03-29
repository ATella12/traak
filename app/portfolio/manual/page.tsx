"use client";

import GlobalMarketSearch from "@/components/GlobalMarketSearch";

export default function ManualPositionsPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-65px)] w-full max-w-5xl items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <section className="w-full max-w-3xl rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-2xl shadow-black/30 sm:min-h-[440px] sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-50">Add Transaction</h1>
        <p className="mt-2 text-sm text-slate-400">Find a market and add your manual Polymarket transaction.</p>

        <GlobalMarketSearch className="mt-6" showHeader={false} />
      </section>
    </main>
  );
}
