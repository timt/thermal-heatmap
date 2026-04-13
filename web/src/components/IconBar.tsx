import { Calendar, BarChart3, Mountain, ListFilter, Settings, Share2 } from "lucide-react";
import type { ReactNode } from "react";

export type PanelId = "calendar" | "stats" | "altitude" | "filter" | "settings";

interface IconBarProps {
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
] as const;

export function IconBar({ activePanel, onPanelChange, panels, onShare, shareLabel }: IconBarProps) {
  return (
    <div className="flex items-start gap-2 p-3">
      {/* Icon strip */}
      <div className="flex w-12 flex-col items-center gap-1 rounded-xl bg-blue-600 py-3 shadow-lg">
        {ICONS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => onPanelChange(id)}
            aria-label={label}
            aria-pressed={activePanel === id}
            className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
              activePanel === id
                ? "bg-blue-400/50"
                : "hover:bg-blue-500/40"
            }`}
          >
            <Icon className="h-5 w-5 text-white" strokeWidth={2} />
          </button>
        ))}

        {/* Divider */}
        <div className="mx-2 my-1 h-px w-6 bg-blue-400/40" />

        {/* Share */}
        <div className="relative">
          <button
            type="button"
            onClick={onShare}
            aria-label="Share link"
            className="flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-blue-500/40"
          >
            <Share2 className={`h-5 w-5 transition-colors ${shareLabel === "Copied!" ? "text-green-300" : "text-white"}`} strokeWidth={2} />
          </button>
          {shareLabel === "Copied!" && (
            <div className="absolute left-12 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-gray-900/95 px-3 py-1.5 text-xs font-medium text-green-300 shadow-lg backdrop-blur-md">
              Link copied!
            </div>
          )}
        </div>

        {/* Settings */}
        <button
          type="button"
          onClick={() => onPanelChange("settings")}
          aria-label="Settings"
          aria-pressed={activePanel === "settings"}
          className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
            activePanel === "settings"
              ? "bg-blue-400/50"
              : "hover:bg-blue-500/40"
          }`}
        >
          <Settings className="h-5 w-5 text-white" strokeWidth={2} />
        </button>
      </div>

      {/* Slide-out panel */}
      <div
        className={`overflow-hidden transition-[width] duration-200 ease-in-out ${
          activePanel ? "w-72" : "w-0"
        }`}
      >
        <div className="w-72 overflow-y-auto rounded-xl bg-gray-900/95 p-3 shadow-xl backdrop-blur-md">
          {activePanel && panels[activePanel]}
        </div>
      </div>
    </div>
  );
}
