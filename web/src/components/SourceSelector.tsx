interface SourceSelectorProps {
  source: string;
  onChange: (source: string) => void;
  region: string;
  onRegionChange: (region: string) => void;
}

const SOURCES = [
  { value: "bga", label: "BGA Ladder" },
  { value: "weglide", label: "WeGlide" },
] as const;

const REGIONS = [
  { value: "", label: "All regions" },
  { value: "GB", label: "United Kingdom" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "AT", label: "Austria" },
  { value: "AU", label: "Australia" },
  { value: "ZA", label: "South Africa" },
  { value: "US", label: "United States" },
] as const;

export function SourceSelector({
  source,
  onChange,
  region,
  onRegionChange,
}: SourceSelectorProps) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-gray-900/80 px-3 py-2 text-white shadow-lg backdrop-blur-md">
      <div className="flex rounded-lg bg-gray-800/80">
        {SOURCES.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => onChange(s.value)}
            className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
              source === s.value
                ? "bg-blue-500 text-white"
                : "text-gray-300 hover:bg-white/10"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {source === "weglide" && (
        <select
          value={region}
          onChange={(e) => onRegionChange(e.target.value)}
          className="rounded-lg bg-gray-800/80 px-2 py-1 text-xs text-gray-300 outline-none focus:ring-1 focus:ring-blue-500"
        >
          {REGIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
