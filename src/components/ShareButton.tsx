"use client";

import { useState } from "react";

interface ShareButtonProps {
  readonly buildUrl: () => string;
}

export function ShareButton({ buildUrl }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const url = buildUrl();
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-xl bg-gray-900/80 px-3 py-2 text-xs font-semibold text-gray-300 shadow-lg backdrop-blur-md hover:text-white"
    >
      {copied ? "Copied!" : "Share link"}
    </button>
  );
}
