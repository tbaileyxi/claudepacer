"use client";

import { formatTokens, formatCost } from "@/lib/utils";

interface MemorySaveResult {
  action: "update" | "fresh";
  filePath: string;
  tokensBefore: number;
  tokensAfter: number;
  tokensSaved: number;
  pctSaved: number;
  costSavedUsd: number;
  lifetimeTotals: {
    tokensSaved: number;
    costSavedUsd: number;
    saveCount: number;
  };
}

interface SuccessModalProps {
  result: MemorySaveResult;
  onClose: () => void;
}

export default function SuccessModal({ result, onClose }: SuccessModalProps) {
  const {
    tokensBefore,
    tokensAfter,
    tokensSaved,
    pctSaved,
    costSavedUsd,
    lifetimeTotals,
    action,
    filePath,
  } = result;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Card */}
      <div
        className="relative w-full max-w-md bg-surface-800 border border-gauge-green/30 rounded-2xl shadow-glow-green p-6 success-pop"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/30 hover:text-white/70 text-xl leading-none"
          aria-label="Close"
        >
          ×
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-full bg-gauge-green/20 flex items-center justify-center text-2xl">
            ✅
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">
              {action === "fresh" ? "Saved & Fresh Start!" : "Memory Updated!"}
            </h2>
            <p className="text-xs text-white/40 mt-0.5">{filePath}</p>
          </div>
        </div>

        {/* Big savings number */}
        <div className="bg-gauge-green/10 border border-gauge-green/20 rounded-xl p-4 mb-4 text-center">
          <p className="text-4xl font-extrabold text-gauge-green">
            {formatTokens(tokensSaved)}
          </p>
          <p className="text-sm text-gauge-green/70 mt-1">
            tokens saved — {pctSaved}% smaller context
          </p>
          <p className="text-xs text-white/40 mt-1">
            ≈ {formatCost(costSavedUsd)} in API costs per run
          </p>
        </div>

        {/* Before / After breakdown */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-surface-700 rounded-xl p-3 text-center">
            <p className="stat-label mb-1">Before</p>
            <p className="text-xl font-bold text-white/70">
              {formatTokens(tokensBefore)}
            </p>
            <p className="text-xs text-white/30">tokens</p>
          </div>
          <div className="bg-surface-700 rounded-xl p-3 text-center">
            <p className="stat-label mb-1">After</p>
            <p className="text-xl font-bold text-gauge-green">
              {formatTokens(tokensAfter)}
            </p>
            <p className="text-xs text-white/30">tokens</p>
          </div>
        </div>

        {/* Arrow between before/after */}
        <div className="flex items-center gap-2 text-xs text-white/30 mb-4 -mt-2 px-1">
          <div className="flex-1 h-px bg-white/10" />
          <span>
            {formatTokens(tokensBefore)} → {formatTokens(tokensAfter)} (
            {pctSaved}% reduction)
          </span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Lifetime totals */}
        <div className="bg-surface-700 rounded-xl p-3 mb-5">
          <p className="stat-label mb-2">Your lifetime savings</p>
          <div className="flex justify-between">
            <div>
              <p className="text-base font-bold text-brand-400">
                {formatTokens(lifetimeTotals.tokensSaved)}
              </p>
              <p className="text-xs text-white/30">total tokens saved</p>
            </div>
            <div className="text-right">
              <p className="text-base font-bold text-brand-400">
                {formatCost(lifetimeTotals.costSavedUsd)}
              </p>
              <p className="text-xs text-white/30">
                across {lifetimeTotals.saveCount} saves
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={onClose}
          className="w-full btn-success text-center text-sm"
        >
          {action === "fresh"
            ? "Go to fresh chat →"
            : "Nice — back to dashboard"}
        </button>
      </div>
    </div>
  );
}
