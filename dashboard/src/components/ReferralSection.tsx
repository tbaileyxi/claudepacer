"use client";

import { useState } from "react";

interface ReferralSectionProps {
  referralCode: string;
  referralUrl: string;
  creditsCents: number;
}

export default function ReferralSection({
  referralCode,
  referralUrl,
  creditsCents,
}: ReferralSectionProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback for older browsers
      const el = document.createElement("textarea");
      el.value = referralUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  const creditsDisplay =
    creditsCents > 0 ? `$${(creditsCents / 100).toFixed(2)}` : null;

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🎁</span>
          <h3 className="font-semibold text-white">Refer Friends & Save $5</h3>
        </div>
        {creditsDisplay && (
          <div className="bg-gauge-green/15 border border-gauge-green/30 text-gauge-green text-xs font-bold px-3 py-1 rounded-full">
            {creditsDisplay} earned
          </div>
        )}
      </div>

      {/* How it works */}
      <p className="text-sm text-white/50 mb-4 leading-relaxed">
        Share your link. When a friend buys the lifetime upgrade using it,
        they pay <strong className="text-white/70">$24</strong> (save $5) and
        you get a <strong className="text-white/70">$5 credit</strong>.
        Unlimited referrals — only paid conversions count.
      </p>

      {/* Steps */}
      <div className="flex items-start gap-6 mb-4 text-xs text-white/40">
        {[
          ["1", "Share your link"],
          ["2", "Friend buys at $24"],
          ["3", "You both save $5"],
        ].map(([num, text]) => (
          <div key={num} className="flex flex-col items-center gap-1 flex-1 text-center">
            <div className="w-6 h-6 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-400 font-bold text-xs">
              {num}
            </div>
            <span>{text}</span>
          </div>
        ))}
      </div>

      {/* Referral link */}
      <div className="flex gap-2">
        <div className="flex-1 bg-surface-700 border border-surface-500 rounded-xl px-3 py-2.5 flex items-center min-w-0">
          <span className="text-xs text-brand-400 font-mono truncate">
            {referralUrl}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className={`
            flex-shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200
            ${copied
              ? "bg-gauge-green/20 border border-gauge-green/40 text-gauge-green"
              : "bg-brand-500/20 border border-brand-500/30 text-brand-400 hover:bg-brand-500/30"
            }
          `}
        >
          {copied ? "✓ Copied!" : "Copy"}
        </button>
      </div>

      {/* Code */}
      <p className="text-xs text-white/30 mt-2 text-center">
        Your code:{" "}
        <span className="font-mono font-bold text-white/50">{referralCode}</span>
      </p>
    </div>
  );
}
