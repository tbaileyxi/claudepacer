"use client";

import { useState } from "react";
import SuccessModal from "./SuccessModal";

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

interface MemoryButtonsProps {
  isPaid: boolean;
  userId: string;
  onUpgradeClick: () => void;
  onSuccess?: () => void; // called after a successful save (e.g. to refresh stats)
}

export default function MemoryButtons({
  isPaid,
  userId,
  onUpgradeClick,
  onSuccess,
}: MemoryButtonsProps) {
  const [loading, setLoading] = useState<"update" | "fresh" | null>(null);
  const [result, setResult] = useState<MemorySaveResult | null>(null);

  async function handleAction(action: "update" | "fresh") {
    if (!isPaid) {
      onUpgradeClick();
      return;
    }

    setLoading(action);
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Memory update failed");
      }

      const data: MemorySaveResult = await res.json();
      setResult(data);
      onSuccess?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      <div className="w-full">
        {/* Section header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white/70 uppercase tracking-widest">
            Memory Tools
          </h3>
          {isPaid ? (
            <span className="badge-paid">PRO</span>
          ) : (
            <span className="badge-free">FREE</span>
          )}
        </div>

        {/* Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Auto-Update Memory File */}
          <button
            onClick={() => handleAction("update")}
            disabled={loading !== null}
            className={`
              relative flex flex-col items-start gap-2 p-4 rounded-2xl border
              transition-all duration-200 text-left group
              ${isPaid
                ? "bg-surface-700 border-surface-500 hover:border-brand-500/60 hover:bg-surface-600 active:scale-95"
                : "bg-surface-800 border-surface-600 cursor-pointer opacity-70 hover:opacity-90"
              }
            `}
          >
            {/* Lock badge for free users */}
            {!isPaid && (
              <div className="absolute top-3 right-3 text-xs bg-surface-600 border border-surface-500 px-2 py-0.5 rounded-full text-white/50">
                🔒 Pro
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className="text-2xl">🧠</span>
              <span className="font-semibold text-white text-sm leading-tight">
                Auto-Update<br />Memory File
              </span>
            </div>

            <p className="text-xs text-white/40 leading-relaxed">
              Summarize recent chats & compress your CLAUDE.md. Smaller context
              = faster responses & fewer rate-limit hits.
            </p>

            {loading === "update" ? (
              <div className="flex items-center gap-2 text-xs text-brand-400 font-medium mt-1">
                <span className="inline-block w-3 h-3 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                Analyzing context...
              </div>
            ) : (
              <span className="text-xs font-semibold text-brand-400 group-hover:text-brand-300 mt-1">
                {isPaid ? "Tap to save tokens →" : "Upgrade to unlock →"}
              </span>
            )}
          </button>

          {/* Start Fresh + Save */}
          <button
            onClick={() => handleAction("fresh")}
            disabled={loading !== null}
            className={`
              relative flex flex-col items-start gap-2 p-4 rounded-2xl border
              transition-all duration-200 text-left group
              ${isPaid
                ? "bg-surface-700 border-surface-500 hover:border-gauge-green/60 hover:bg-surface-600 active:scale-95"
                : "bg-surface-800 border-surface-600 cursor-pointer opacity-70 hover:opacity-90"
              }
            `}
          >
            {!isPaid && (
              <div className="absolute top-3 right-3 text-xs bg-surface-600 border border-surface-500 px-2 py-0.5 rounded-full text-white/50">
                🔒 Pro
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className="text-2xl">✨</span>
              <span className="font-semibold text-white text-sm leading-tight">
                Start Fresh<br />+ Save
              </span>
            </div>

            <p className="text-xs text-white/40 leading-relaxed">
              Save a summary of this thread to memory, then open a clean chat.
              Zero context baggage, full knowledge retained.
            </p>

            {loading === "fresh" ? (
              <div className="flex items-center gap-2 text-xs text-gauge-green font-medium mt-1">
                <span className="inline-block w-3 h-3 border-2 border-gauge-green border-t-transparent rounded-full animate-spin" />
                Saving & resetting...
              </div>
            ) : (
              <span className="text-xs font-semibold text-gauge-green group-hover:opacity-80 mt-1">
                {isPaid ? "Tap to reset clean →" : "Upgrade to unlock →"}
              </span>
            )}
          </button>
        </div>

        {/* Upgrade CTA (free tier) */}
        {!isPaid && (
          <button
            onClick={onUpgradeClick}
            className="mt-3 w-full btn-primary text-sm py-3"
          >
            Unlock Memory Tools — $29 lifetime
          </button>
        )}
      </div>

      {/* Success modal */}
      {result && (
        <SuccessModal
          result={result}
          onClose={() => setResult(null)}
        />
      )}
    </>
  );
}
