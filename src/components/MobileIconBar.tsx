"use client";

import { Calendar, BarChart3, Mountain, ListFilter, Settings, Share2 } from "lucide-react";
import type { ReactNode } from "react";
import type { PanelId } from "./IconBar";

interface MobileIconBarProps {
  readonly activePanel: PanelId | null;
  readonly onPanelChange: (id: PanelId) => void;
  readonly panels: Record<PanelId, ReactNode>;
  readonly onShare: () => void;
  readonly shareLabel: string;
}

const ICONS = [
  { id: "calendar" as const, icon: Calendar, label: "Date selector" },
  { id: "stats" as const, icon: BarChart3, label: "Statistics" },
  { id: "altitude" as const, icon: Mountain, label: "Altitude profile" },
  { id: "filter" as const, icon: ListFilter, label: "Aircraft filter" },
  { id: "share" as const, icon: Share2, label: "Share link" },
  { id: "settings" as const, icon: Settings, label: "Settings" },
] as const;

export function MobileIconBar({ activePanel, onPanelChange, panels, onShare, shareLabel }: MobileIconBarProps) {
  return (
    <div className="safe-bottom flex flex-col">
      {/* Slide-up panel */}
      {activePanel && (
        <div className="max-h-[60dvh] overflow-y-auto rounded-t-2xl bg-gray-900/95 p-4 shadow-2xl backdrop-blur-md">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-600" />
          {panels[activePanel]}
        </div>
      )}

      {/* Horizontal icon strip */}
      <div className="flex items-center justify-around bg-blue-600 px-2 py-2 shadow-lg">
        {ICONS.map(({ id, icon: Icon, label }) => {
          const isShare = id === "share";
          const isActive = !isShare && activePanel === id;

          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                if (isShare) {
                  onShare();
                } else {
                  onPanelChange(id as PanelId);
                }
              }}
              aria-label={isShare && shareLabel === "Copied!" ? "Copied!" : label}
              aria-pressed={isActive}
              className={`flex h-11 w-11 items-center justify-center rounded-lg transition-colors ${
                isActive
                  ? "bg-blue-400/50"
                  : "active:bg-blue-500/40"
              }`}
            >
              <Icon
                className={`h-5 w-5 transition-colors ${
                  isShare && shareLabel === "Copied!" ? "text-green-300" : "text-white"
                }`}
                strokeWidth={2}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
