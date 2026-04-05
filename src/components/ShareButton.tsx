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
      className="min-h-[44px] rounded-xl bg-gray-900/80 px-3 py-2 text-xs font-semibold text-gray-300 shadow-lg backdrop-blur-md hover:text-white md:min-h-0"
    >
      {copied ? (
        "Copied!"
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-5 w-5"
          aria-label="Share link"
        >
          <path d="M13 4.5a2.5 2.5 0 1 1 .702 1.737L6.97 9.604a2.5 2.5 0 0 1 0 .792l6.733 3.367a2.5 2.5 0 1 1-.671 1.341L6.297 11.737a2.5 2.5 0 1 1 0-3.474l6.734-3.367A2.5 2.5 0 0 1 13 4.5Z" />
        </svg>
      )}
    </button>
  );
}
