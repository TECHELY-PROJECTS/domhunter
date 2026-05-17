import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useLocation } from "wouter";

interface SearchResult {
  id: string;
  name: string;
  sld: string;
  tld: string;
  status: string;
  rarityScore: number | null;
  brandScore: number | null;
  estimatedValue: number | null;
  recommendation: string | null;
  rarityTier: string | null;
}

const TIER_COLORS: Record<string, string> = {
  legendary: "text-yellow-400",
  epic: "text-purple-400",
  rare: "text-blue-400",
  uncommon: "text-green-400",
  common: "text-gray-400",
};

export function DomainSearch() {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = (value: string) => {
    setQuery(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/domains/search?q=${encodeURIComponent(value.trim())}`);
        const data = await res.json() as { results: SearchResult[] };
        setResults(data.results ?? []);
        setIsOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250); // 250ms debounce
  };

  const handleSelect = (name: string) => {
    setIsOpen(false);
    setQuery("");
    navigate(`/domain/${name}`);
  };

  const formatValue = (v: number | null) => {
    if (!v) return "";
    if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
    return `$${v}`;
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search domains..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => { if (results.length > 0) setIsOpen(true); }}
          className="pl-9 h-9 bg-background border-border"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-card border border-border rounded-lg shadow-xl overflow-hidden max-h-80 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => handleSelect(r.name)}
              className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-accent/10 transition-colors border-b border-border/50 last:border-0 text-left"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono font-semibold text-sm text-primary">{r.name}</span>
                {r.rarityTier && (
                  <span className={`text-[10px] uppercase font-bold ${TIER_COLORS[r.rarityTier] ?? "text-muted-foreground"}`}>
                    {r.rarityTier}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {r.recommendation && (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    r.recommendation === "BUY" ? "bg-green-900/50 text-green-300" :
                    r.recommendation === "WATCH" ? "bg-yellow-900/50 text-yellow-300" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {r.recommendation}
                  </span>
                )}
                {r.rarityScore != null && <span>Score: {Math.round(r.rarityScore)}</span>}
                {r.estimatedValue != null && <span className="font-semibold text-foreground">{formatValue(r.estimatedValue)}</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {isOpen && query.length >= 2 && results.length === 0 && !loading && (
        <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-card border border-border rounded-lg shadow-xl p-4 text-center text-sm text-muted-foreground">
          No domains found matching "{query}"
        </div>
      )}
    </div>
  );
}
