import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Bell, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TIER_STYLES: Record<string, string> = {
  legendary: "bg-yellow-400 text-yellow-900 font-bold",
  epic:      "bg-purple-600 text-white",
  rare:      "bg-blue-600 text-white",
  uncommon:  "bg-green-700 text-white",
  common:    "bg-gray-500 text-white",
};

const REC_STYLES: Record<string, string> = {
  BUY:   "bg-green-900/60 text-green-300 border border-green-700 font-bold",
  WATCH: "bg-yellow-900/60 text-yellow-300 border border-yellow-700",
  SKIP:  "bg-muted text-muted-foreground border border-border",
};

const NICHE_ICONS: Record<string, string> = {
  tech: "💻", finance: "💰", health: "❤️", ecommerce: "🛒",
  media: "📺", legal: "⚖️", realestate: "🏠", general: "🌐",
};

const SOURCE_LABELS: Record<string, string> = {
  brandable: "AI Generated",
  expired_domains: "Expired",
  dropcatch: "DropCatch",
  godaddy: "GoDaddy",
  namejet: "NameJet",
  icann: "ICANN",
  sample: "Sample",
};

const DEFAULT_FILTERS = {
  q: "",
  minScore: 0,
  minBrandScore: 0,
  minDA: 0,
  minAge: 0,
  minBacklinks: 0,
  tlds: [] as string[],
  niche: "",
  recommendation: "",
  tier: "",
  source: "",
  since: "",
  sortBy: "rarityScore",
  sortDir: "desc",
};

const LIMIT = 50;

async function watchDomain(domainName: string): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch("/api/alerts/watch-domain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domainName }),
  });
  const data = await res.json() as { ok?: boolean; message?: string; error?: string };
  if (!res.ok) return { ok: false, message: data.error };
  return { ok: true, message: data.message };
}

export default function Explore() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [domains, setDomains] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [watchingDomain, setWatchingDomain] = useState<string | null>(null);
  const [watchlistIds, setWatchlistIds] = useState<Set<string>>(new Set());
  const [togglingWatchlist, setTogglingWatchlist] = useState<string | null>(null);

  const fetchDomains = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (filters.q) params.set("search", filters.q);
      if (filters.minScore > 0) params.set("minScore", String(filters.minScore));
      if (filters.minBrandScore > 0) params.set("minBrandScore", String(filters.minBrandScore));
      if (filters.minDA > 0) params.set("minDA", String(filters.minDA));
      if (filters.minAge > 0) params.set("minAge", String(filters.minAge));
      if (filters.minBacklinks > 0) params.set("minBacklinks", String(filters.minBacklinks));
      if (filters.tlds.length > 0) params.set("tlds", filters.tlds.join(","));
      if (filters.niche) params.set("niche", filters.niche);
      if (filters.recommendation) params.set("recommendation", filters.recommendation);
      if (filters.tier) params.set("tier", filters.tier);
      if (filters.source) params.set("source", filters.source);
      if (filters.since) params.set("since", filters.since);
      params.set("sortBy", filters.sortBy);
      params.set("sortDir", filters.sortDir);

      const res = await fetch(`/api/domains?${params}`);
      const data = await res.json();
      setDomains(data.domains || []);
      setTotal(data.total || 0);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    fetch("/api/watchlist")
      .then(r => r.json())
      .then((data: any[]) => {
        setWatchlistIds(new Set(data.map((w: any) => w.domainId)));
      })
      .catch(() => {});
  }, []);

  useEffect(() => { fetchDomains(); }, [fetchDomains]);

  const handleToggleWatchlist = async (e: React.MouseEvent, domainId: string, domainName: string) => {
    e.stopPropagation();
    setTogglingWatchlist(domainId);
    try {
      const isWatched = watchlistIds.has(domainId);
      if (isWatched) {
        const res = await fetch(`/api/watchlist/${encodeURIComponent(domainId)}`, {
          method: "DELETE",
        });
        if (res.ok) {
          setWatchlistIds(prev => { const s = new Set(prev); s.delete(domainId); return s; });
          toast({ title: `Removed ${domainName} from watchlist` });
        }
      } else {
        const res = await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domainId }),
        });
        if (res.ok) {
          setWatchlistIds(prev => new Set([...prev, domainId]));
          toast({ title: `⭐ Added ${domainName} to watchlist` });
        }
      }
    } finally {
      setTogglingWatchlist(null);
    }
  };

  const handleWatchDrop = async (e: React.MouseEvent, domainName: string) => {
    e.stopPropagation();
    setWatchingDomain(domainName);
    try {
      const result = await watchDomain(domainName);
      if (!result.ok) {
        toast({ title: "Could not set alert", description: result.message, variant: "destructive" });
      } else if (result.message === "Already watching") {
        toast({ title: `Already watching ${domainName}`, description: "You'll be alerted when it drops." });
      } else {
        toast({ title: `🔔 Alert set for ${domainName}`, description: "You'll get a Telegram alert when it drops." });
      }
    } finally {
      setWatchingDomain(null);
    }
  };

  const setFilter = (key: string, value: any) => {
    setPage(1);
    setFilters(f => ({ ...f, [key]: value }));
  };

  const toggleTLD = (tld: string) => {
    setFilter("tlds", filters.tlds.includes(tld)
      ? filters.tlds.filter(t => t !== tld)
      : [...filters.tlds, tld]);
  };

  const formatNumber = (n?: number | null) => {
    if (!n) return "—";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  const formatValue = (v?: number | null) => {
    if (!v) return "—";
    if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
    return `$${v}`;
  };

  const formatExpiry = (date?: string | null) => {
    if (!date) return "—";
    const ms = new Date(date).getTime() - Date.now();
    const hours = Math.round(ms / 3_600_000);
    if (hours < 0) return <span className="text-muted-foreground">Ended</span>;
    if (hours < 24) return <span className="text-red-400 font-bold">{hours}h left</span>;
    if (hours < 72) return <span className="text-orange-400">{Math.round(hours / 24)}d left</span>;
    return new Date(date).toLocaleDateString();
  };

  const totalPages = Math.ceil(total / LIMIT);
  const startItem = (page - 1) * LIMIT + 1;
  const endItem = Math.min(page * LIMIT, total);

  return (
    <div className="flex h-full bg-background overflow-hidden">

      {/* ── FILTER SIDEBAR ── */}
      <aside className="w-56 bg-card border-r border-border flex flex-col overflow-y-auto shrink-0">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-semibold text-foreground text-xs uppercase tracking-widest">Filters</h2>
        </div>

        <div className="p-4 space-y-5 flex-1">

          {/* Search */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Search</label>
            <Input
              className="mt-1 h-8 text-sm bg-background"
              placeholder="keyword in domain..."
              value={filters.q}
              onChange={e => setFilter("q", e.target.value)}
            />
          </div>

          {/* Signal */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Signal</label>
            <div className="mt-1 flex gap-1">
              {(["BUY", "WATCH", "SKIP"] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setFilter("recommendation", filters.recommendation === r ? "" : r)}
                  className={`flex-1 py-1.5 text-xs rounded font-medium transition-all ${
                    filters.recommendation === r
                      ? REC_STYLES[r]
                      : "bg-muted text-muted-foreground border border-border hover:border-primary/50"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Rarity Tier */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Rarity Tier</label>
            <div className="mt-1 flex flex-wrap gap-1">
              {(["legendary", "epic", "rare", "uncommon", "common"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setFilter("tier", filters.tier === t ? "" : t)}
                  className={`px-2 py-1 text-xs rounded capitalize transition-all ${
                    filters.tier === t
                      ? TIER_STYLES[t]
                      : "bg-muted text-muted-foreground border border-border hover:border-primary/50"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* TLD */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">TLD</label>
            <div className="mt-1 flex flex-wrap gap-1">
              {["com", "io", "ai", "co", "net", "org"].map(t => (
                <button
                  key={t}
                  onClick={() => toggleTLD(t)}
                  className={`px-2 py-1 text-xs rounded font-mono transition-all ${
                    filters.tlds.includes(t)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground border border-border hover:border-primary/50"
                  }`}
                >
                  .{t}
                </button>
              ))}
            </div>
          </div>

          {/* Source */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Source</label>
            <div className="mt-1 flex flex-wrap gap-1">
              {Object.entries(SOURCE_LABELS).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setFilter("source", filters.source === val ? "" : val)}
                  className={`px-2 py-1 text-xs rounded transition-all ${
                    filters.source === val
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground border border-border hover:border-primary/50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Added */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Added</label>
            <div className="mt-1 flex gap-1">
              {([
                { label: "Today", value: new Date(Date.now() - 24 * 3600 * 1000).toISOString() },
                { label: "Week",  value: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString() },
              ] as const).map(({ label, value }) => (
                <button
                  key={label}
                  onClick={() => setFilter("since", filters.since === value ? "" : value)}
                  className={`flex-1 py-1.5 text-xs rounded font-medium transition-all ${
                    filters.since === value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground border border-border hover:border-primary/50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Niche */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Niche</label>
            <Select value={filters.niche} onValueChange={v => setFilter("niche", v === "__all__" ? "" : v)}>
              <SelectTrigger className="mt-1 h-8 text-sm bg-background">
                <SelectValue placeholder="All niches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All niches</SelectItem>
                {Object.entries(NICHE_ICONS).map(([n, icon]) => (
                  <SelectItem key={n} value={n}>{icon} {n.charAt(0).toUpperCase() + n.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sliders */}
          {[
            { key: "minScore",      label: "Min Rarity Score", max: 100, step: 5 },
            { key: "minBrandScore", label: "Min Brand Score",  max: 100, step: 5 },
            { key: "minDA",         label: "Min Domain Auth",  max: 80,  step: 5 },
            { key: "minAge",        label: "Min Age (yrs)",    max: 20,  step: 1 },
          ].map(({ key, label, max, step }) => (
            <div key={key}>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</label>
                <span className="text-xs font-semibold text-foreground tabular-nums">
                  {filters[key as keyof typeof filters] as number}
                </span>
              </div>
              <Slider
                min={0} max={max} step={step}
                value={[filters[key as keyof typeof filters] as number]}
                onValueChange={([v]) => setFilter(key, v)}
              />
            </div>
          ))}

          {/* Reset */}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => { setPage(1); setFilters(DEFAULT_FILTERS); }}
          >
            Reset Filters
          </Button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Toolbar */}
        <div className="bg-card border-b border-border px-5 py-3 flex items-center justify-between shrink-0">
          <p className="text-sm text-muted-foreground">
            {loading ? "Loading..." : total === 0 ? "No domains found" : (
              <>
                Showing{" "}
                <span className="font-semibold text-foreground">{startItem}–{endItem}</span>
                {" "}of{" "}
                <span className="font-semibold text-foreground">{total.toLocaleString()}</span>
                {" "}domains
              </>
            )}
          </p>
          <Select
            value={`${filters.sortBy}-${filters.sortDir}`}
            onValueChange={v => {
              const idx = v.lastIndexOf("-");
              const f = v.slice(0, idx);
              const d = v.slice(idx + 1);
              setFilters(prev => ({ ...prev, sortBy: f, sortDir: d }));
            }}
          >
            <SelectTrigger className="h-8 w-52 text-sm bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rarityScore-desc">Rarity Score ↓</SelectItem>
              <SelectItem value="brandScore-desc">Brand Score ↓</SelectItem>
              <SelectItem value="estimatedValue-desc">Est. Value ↓</SelectItem>
              <SelectItem value="domainAuthority-desc">DA ↓</SelectItem>
              <SelectItem value="backlinks-desc">Backlinks ↓</SelectItem>
              <SelectItem value="domainAge-desc">Age ↓</SelectItem>
              <SelectItem value="sldLength-asc">Length ↑ (shortest first)</SelectItem>
              <SelectItem value="sldLength-desc">Length ↓ (longest first)</SelectItem>
              <SelectItem value="auctionEndAt-asc">Ending Soon ↑</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-48 text-xs">Domain</TableHead>
                <TableHead className="w-24 text-center text-xs">Tier</TableHead>
                <TableHead className="w-16 text-center text-xs">Score</TableHead>
                <TableHead className="w-16 text-center text-xs">Brand</TableHead>
                <TableHead className="w-14 text-center text-xs">DA</TableHead>
                <TableHead className="w-20 text-center text-xs">Backlinks</TableHead>
                <TableHead className="w-14 text-center text-xs">Age</TableHead>
                <TableHead className="w-20 text-center text-xs">Value</TableHead>
                <TableHead className="w-24 text-center text-xs">Niche</TableHead>
                <TableHead className="w-18 text-center text-xs">Signal</TableHead>
                <TableHead className="w-22 text-center text-xs">Expires</TableHead>
                <TableHead className="w-16 text-center text-xs">Buy</TableHead>
                <TableHead className="w-20 text-center text-xs">Watch</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array(15).fill(0).map((_, i) => (
                    <TableRow key={i} className="border-border">
                      {Array(13).fill(0).map((_, j) => (
                        <TableCell key={j}>
                          <div className="h-4 bg-muted rounded animate-pulse" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : domains.length === 0
                  ? (
                    <TableRow>
                      <TableCell colSpan={13} className="h-48 text-center text-muted-foreground">
                        No domains match your filters. Try adjusting the criteria.
                      </TableCell>
                    </TableRow>
                  )
                  : domains.map((d: any) => (
                    <TableRow
                      key={d.id}
                      className="border-border hover:bg-accent/5 cursor-pointer group"
                      onClick={() => navigate(`/domain/${d.name}`)}
                    >
                      <TableCell className="font-mono font-semibold text-primary group-hover:text-primary/80 py-2.5">
                        {d.name}
                      </TableCell>

                      <TableCell className="text-center py-2.5">
                        {d.metrics?.rarityTier ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${TIER_STYLES[d.metrics.rarityTier] ?? "bg-muted text-muted-foreground"}`}>
                            {d.metrics.rarityTier}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>

                      <TableCell className="text-center py-2.5">
                        <span className={`font-bold text-sm ${
                          (d.metrics?.rarityScore ?? 0) >= 70 ? "text-green-400" :
                          (d.metrics?.rarityScore ?? 0) >= 50 ? "text-primary" : "text-muted-foreground"
                        }`}>
                          {d.metrics?.rarityScore != null ? Math.round(d.metrics.rarityScore) : "—"}
                        </span>
                      </TableCell>

                      <TableCell className="text-center py-2.5 text-sm text-foreground">
                        {d.metrics?.brandScore != null ? Math.round(d.metrics.brandScore) : "—"}
                      </TableCell>

                      <TableCell className="text-center py-2.5">
                        <span className={`text-sm font-medium ${
                          (d.metrics?.domainAuthority ?? 0) >= 50 ? "text-green-400" :
                          (d.metrics?.domainAuthority ?? 0) >= 20 ? "text-yellow-400" : "text-muted-foreground"
                        }`}>
                          {d.metrics?.domainAuthority != null ? Math.round(d.metrics.domainAuthority) : "—"}
                        </span>
                      </TableCell>

                      <TableCell className="text-center py-2.5 text-sm text-muted-foreground">
                        {formatNumber(d.metrics?.backlinks)}
                      </TableCell>

                      <TableCell className="text-center py-2.5 text-sm text-muted-foreground">
                        {d.metrics?.domainAge != null ? `${d.metrics.domainAge}yr` : "—"}
                      </TableCell>

                      <TableCell className="text-center py-2.5 text-sm font-semibold text-foreground">
                        {formatValue(d.metrics?.estimatedValue)}
                      </TableCell>

                      <TableCell className="text-center py-2.5 text-sm">
                        {d.metrics?.niche ? (
                          <span className="flex items-center justify-center gap-1">
                            <span>{NICHE_ICONS[d.metrics.niche] ?? "🌐"}</span>
                            <span className="text-xs text-muted-foreground capitalize hidden xl:inline">{d.metrics.niche}</span>
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>

                      <TableCell className="text-center py-2.5">
                        {d.metrics?.recommendation ? (
                          <span className={`text-xs px-2 py-0.5 rounded ${REC_STYLES[d.metrics.recommendation] ?? ""}`}>
                            {d.metrics.recommendation}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>

                      <TableCell className="text-center py-2.5 text-xs">
                        {formatExpiry(d.auctionEndAt)}
                      </TableCell>

                      <TableCell className="text-center py-2.5" onClick={e => e.stopPropagation()}>
                        <a
                          href={d.auctionUrl ?? `https://www.hostinger.com/domain-name-search?domain=${d.name}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded hover:opacity-90 transition-opacity whitespace-nowrap"
                        >
                          Buy →
                        </a>
                      </TableCell>
                      <TableCell className="text-center py-2.5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={(e) => handleToggleWatchlist(e, d.id, d.name)}
                            disabled={togglingWatchlist === d.id}
                            title={watchlistIds.has(d.id) ? "Remove from watchlist" : "Add to watchlist"}
                            className={`inline-flex items-center justify-center w-7 h-7 rounded transition-colors disabled:opacity-50 ${
                              watchlistIds.has(d.id)
                                ? "text-yellow-400 hover:bg-yellow-400/10"
                                : "text-muted-foreground hover:text-yellow-400 hover:bg-yellow-400/10"
                            }`}
                          >
                            <Star className={`w-3.5 h-3.5 ${watchlistIds.has(d.id) ? "fill-current" : ""}`} />
                          </button>
                          {d.status === "EXPIRING" && (
                            <button
                              onClick={(e) => handleWatchDrop(e, d.name)}
                              disabled={watchingDomain === d.name}
                              title="Get alerted when this domain drops"
                              className="inline-flex items-center justify-center w-7 h-7 rounded text-amber-400 hover:bg-amber-400/10 transition-colors disabled:opacity-50"
                            >
                              <Bell className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
              }
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="bg-card border-t border-border px-5 py-3 flex items-center justify-between shrink-0">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
          >
            ← Previous
          </Button>

          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              const p = page <= 4 ? i + 1 : page - 3 + i;
              if (p < 1 || p > totalPages) return null;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 text-sm rounded transition-colors ${
                    p === page
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent/10 text-muted-foreground"
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>

          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            Next →
          </Button>
        </div>
      </main>
    </div>
  );
}
