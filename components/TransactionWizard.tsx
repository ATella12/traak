"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";

type Side = "BUY" | "SELL";
type Outcome = "YES" | "NO";

type WizardSubmitPayload = {
  side: Side;
  outcome: Outcome;
  shares: number;
  price: number;
  timestamp: string;
  notes?: string;
};

type TransactionWizardProps = {
  backHref: string;
  marketLabel: string;
  outcomes: string[];
  onSubmit: (payload: WizardSubmitPayload) => Promise<void> | void;
  saving?: boolean;
  submitError?: string | null;
  successMessage?: string | null;
};

const getDefaultDateTimeLocal = (): string => {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
};

const isTestEnvironment = process.env.NODE_ENV === "test";
const stepMotion = {
  initial: { opacity: 0, x: 28 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -28 },
  transition: { duration: isTestEnvironment ? 0 : 0.2 },
};

const stepMotionInTest = {
  initial: false as const,
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 1, x: 0 },
  transition: { duration: 0 },
};

export default function TransactionWizard({
  backHref,
  marketLabel,
  outcomes,
  onSubmit,
  saving = false,
  submitError,
  successMessage,
}: TransactionWizardProps) {
  const [step, setStep] = useState(0);
  const [side, setSide] = useState<Side | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [dateTime, setDateTime] = useState(getDefaultDateTimeLocal());
  const [notes, setNotes] = useState("");

  const parsedShares = Number(shares);
  const parsedPrice = Number(price);
  const parsedDate = new Date(dateTime);

  const sharesValid = Number.isFinite(parsedShares) && parsedShares > 0;
  const priceValid = Number.isFinite(parsedPrice) && parsedPrice > 0 && parsedPrice <= 1;
  const dateValid = Boolean(dateTime) && !Number.isNaN(parsedDate.getTime());

  const isCurrentStepValid = useMemo(() => {
    switch (step) {
      case 0:
        return side !== null;
      case 1:
        return outcome !== null;
      case 2:
        return sharesValid;
      case 3:
        return priceValid;
      case 4:
        return dateValid;
      case 5:
        return true;
      case 6:
        return true;
      default:
        return false;
    }
  }, [dateValid, outcome, priceValid, sharesValid, side, step]);

  const outcomeOptions = useMemo(() => {
    const hasYes = outcomes.some((item) => item.trim().toLowerCase() === "yes");
    const hasNo = outcomes.some((item) => item.trim().toLowerCase() === "no");

    if (hasYes && hasNo) {
      return [
        { label: outcomes.find((item) => item.trim().toLowerCase() === "yes") ?? "Yes", value: "YES" as const },
        { label: outcomes.find((item) => item.trim().toLowerCase() === "no") ?? "No", value: "NO" as const },
      ];
    }

    return [
      { label: "Yes", value: "YES" as const },
      { label: "No", value: "NO" as const },
    ];
  }, [outcomes]);

  const handleNext = () => {
    if (!isCurrentStepValid || step >= 6) return;
    setStep((current) => current + 1);
  };

  const handleBackStep = () => {
    if (step <= 0) return;
    setStep((current) => current - 1);
  };

  const handleConfirm = async () => {
    if (!side || !outcome || !sharesValid || !priceValid || !dateValid) return;

    await onSubmit({
      side,
      outcome,
      shares: parsedShares,
      price: parsedPrice,
      timestamp: parsedDate.toISOString(),
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="mt-6">
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">Selected market</p>
        <p className="mt-1 text-sm text-slate-200">{marketLabel}</p>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 p-5 sm:p-6">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step} {...(isTestEnvironment ? stepMotionInTest : stepMotion)}>
            {step === 0 ? (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-100">Did you buy or sell this market?</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setSide("BUY")}
                    className={`w-full rounded-xl border px-4 py-4 text-left text-base font-semibold transition ${
                      side === "BUY"
                        ? "border-cyan-400 bg-cyan-500 text-slate-950"
                        : "border-slate-700 bg-slate-900 text-slate-200 hover:border-cyan-500"
                    }`}
                  >
                    Buy
                  </button>
                  <button
                    type="button"
                    onClick={() => setSide("SELL")}
                    className={`w-full rounded-xl border px-4 py-4 text-left text-base font-semibold transition ${
                      side === "SELL"
                        ? "border-cyan-400 bg-cyan-500 text-slate-950"
                        : "border-slate-700 bg-slate-900 text-slate-200 hover:border-cyan-500"
                    }`}
                  >
                    Sell
                  </button>
                </div>
              </div>
            ) : null}

            {step === 1 ? (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-100">Which outcome?</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {outcomeOptions.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setOutcome(item.value)}
                      className={`w-full rounded-xl border px-4 py-4 text-left text-base font-semibold transition ${
                        outcome === item.value
                          ? "border-cyan-400 bg-cyan-500 text-slate-950"
                          : "border-slate-700 bg-slate-900 text-slate-200 hover:border-cyan-500"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-100">How many shares?</h2>
                <label className="block text-sm text-slate-300">
                  Shares
                  <input
                    type="number"
                    min="0.000001"
                    step="any"
                    value={shares}
                    onChange={(event) => setShares(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-base text-slate-100 outline-none focus:border-cyan-500"
                    placeholder="e.g. 10"
                  />
                </label>
                {shares && !sharesValid ? <p className="text-sm text-rose-300">Shares must be greater than 0.</p> : null}
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-100">Price per share?</h2>
                <label className="block text-sm text-slate-300">
                  Price per share
                  <input
                    type="number"
                    min="0.000001"
                    max="1"
                    step="0.01"
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-base text-slate-100 outline-none focus:border-cyan-500"
                    placeholder="e.g. 0.55"
                  />
                </label>
                {price && !priceValid ? <p className="text-sm text-rose-300">Price per share must be between 0 and 1.</p> : null}
              </div>
            ) : null}

            {step === 4 ? (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-100">When did this happen?</h2>
                <label className="block text-sm text-slate-300">
                  Date and time
                  <input
                    type="datetime-local"
                    value={dateTime}
                    onChange={(event) => setDateTime(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-base text-slate-100 outline-none focus:border-cyan-500"
                  />
                </label>
                {!dateValid ? <p className="text-sm text-rose-300">Please choose a valid date and time.</p> : null}
              </div>
            ) : null}

            {step === 5 ? (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-100">Add notes for this trade</h2>
                <label className="block text-sm text-slate-300">
                  Trade notes
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={5}
                    className="mt-2 w-full resize-none rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-base leading-7 text-slate-100 outline-none focus:border-cyan-500"
                    placeholder="Why did you take this trade? What was your thesis or plan?"
                  />
                </label>
                <p className="text-sm text-slate-500">Optional. Add context you want to remember when you review this trade later.</p>
              </div>
            ) : null}

            {step === 6 ? (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-100">Review transaction</h2>
                <dl className="grid grid-cols-1 gap-3 text-sm text-slate-300 sm:grid-cols-2">
                  <div>
                    <dt className="text-slate-500">Type</dt>
                    <dd className="mt-1 font-medium text-slate-100">{side}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Outcome</dt>
                    <dd className="mt-1 font-medium text-slate-100">{outcome}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Shares</dt>
                    <dd className="mt-1 font-medium text-slate-100">{shares}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Price per share</dt>
                    <dd className="mt-1 font-medium text-slate-100">{price}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-slate-500">Timestamp</dt>
                    <dd className="mt-1 font-medium text-slate-100">{new Date(dateTime).toLocaleString()}</dd>
                  </div>
                  {notes.trim() ? (
                    <div className="sm:col-span-2">
                      <dt className="text-slate-500">Notes</dt>
                      <dd className="mt-1 whitespace-pre-wrap leading-7 font-medium text-slate-100">{notes.trim()}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      {submitError ? <p className="mt-4 rounded-lg border border-rose-600/40 bg-rose-900/20 px-3 py-2 text-sm text-rose-200">{submitError}</p> : null}
      {successMessage ? (
        <p className="mt-4 rounded-lg border border-emerald-600/40 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-200">{successMessage}</p>
      ) : null}

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        {step > 0 ? (
          <button
            type="button"
            onClick={handleBackStep}
            className="w-full rounded-xl border border-slate-700 px-4 py-3 text-sm text-slate-300 transition hover:bg-slate-900 sm:w-auto"
          >
            Back
          </button>
        ) : (
          <Link
            href={backHref}
            className="w-full rounded-xl border border-slate-700 px-4 py-3 text-center text-sm text-slate-300 transition hover:bg-slate-900 sm:w-auto"
          >
            Back
          </Link>
        )}

        {step < 6 ? (
          <button
            type="button"
            onClick={handleNext}
            disabled={!isCurrentStepValid}
            className="w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={saving}
            className="w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {saving ? "Saving..." : "Confirm & Save"}
          </button>
        )}
      </div>
    </div>
  );
}
