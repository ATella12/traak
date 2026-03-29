"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";

import GlobalMarketSearch from "@/components/GlobalMarketSearch";
import { fromCategorySlug, getMarketsByCategory, toCategorySlug } from "@/src/data/markets.seed";

export default function CategoryMarketsPage() {
  const params = useParams<{ category: string }>();
  const [query, setQuery] = useState("");
  const categorySlug = params.category;
  const category = fromCategorySlug(categorySlug);

  const filteredMarkets = useMemo(() => {
    if (!category) return [];
    const categoryMarkets = getMarketsByCategory(category);
    const normalized = query.trim().toLowerCase();
    if (!normalized) return categoryMarkets;
    return categoryMarkets.filter((market) => market.question.toLowerCase().includes(normalized));
  }, [category, query]);

  if (!category) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 sm:p-8">
          <h1 className="text-2xl font-semibold text-slate-50">Category not found</h1>
          <p className="mt-2 text-sm text-slate-400">This category does not exist in the current seed list.</p>
          <Link
            href="/portfolio/manual"
            className="mt-6 inline-flex rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-900"
          >
            Back to search
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-2xl shadow-black/30 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-slate-50">{category}</h1>
          <Link href="/portfolio/manual" className="text-sm text-slate-400 hover:text-slate-200">
            Back to search
          </Link>
        </div>
        <p className="mt-2 text-sm text-slate-400">Pick the market you want to add a transaction for.</p>

        <div className="mt-6">
          <GlobalMarketSearch
            title="Search all markets"
            description="Global search is not restricted to this category."
            placeholder="Search all markets..."
          />
        </div>

        <div className="mt-6">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search markets..."
            className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-500"
          />
        </div>

        <div className="mt-6 max-h-[58vh] space-y-3 overflow-y-auto pr-1">
          {filteredMarkets.map((market) => (
            <Link
              key={market.slug}
              href={`/portfolio/manual/${toCategorySlug(category)}/${market.slug}`}
              className="block rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-200 transition hover:border-slate-600 hover:bg-slate-900"
            >
              {market.question}
            </Link>
          ))}
          {filteredMarkets.length === 0 ? (
            <p className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-6 text-sm text-slate-400">
              No markets match that search.
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
