import { useState } from "react";
import { useParams } from "wouter";
import {
  useGetDomain,
  useAddToWatchlist,
  useRemoveFromWatchlist,
  useGetWatchlist,
  getGetWatchlistQueryKey,
  getGetDomainQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ExternalLink, Star, Zap, RefreshCw, Archive, Bell, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TrademarkMatch {
  mark: string;
  source: string;
  status?: string;
  registrationNumber?: string;
  owner?: string;
  matchType: "exact" | "contains" | "similar";
}

interface EnrichResult {
  domain: {
    metrics?: {
      rarityScore?: number;
      rarityTier?: string;
      domainAuthority?: number;
      registrar?: string;
      domainAge?: number;
    };
  };
  enriched: {
    rdap: {
      available: boolean;
      registrar?: string;
      ageYears?: number;
      createdDate?: string;
      expiresDate?: string;
    };
    opr: { rank: number; da: number } | null;
    backlinks: { totalLinks: number; referringDomains: number } | null;
    trademark: {
      riskLevel: "HIGH" | "MEDIUM" | "LOW" | "NONE";
      reason: string;
      shouldAvoid: boolean;
      matches: TrademarkMatch[];
    } | null;
    scoring: {
      length: number;
      tld: number;
      pronounceability: number;
      keywordValue: number;
      seoBonus: number;
      trendBonus: number;
      total: number;
    };
  };
}

function useEnrichDomain(fqdn: string) {
  return useMutation({
    mutationFn: async (): Promise<EnrichResult> => {
      const res = await fetch(`/api/domains/${encodeURIComponent(fqdn)}/enrich`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Enrichment failed" }));
        throw new Error((err as { error: string }).error ?? "Enrichment failed");
      }
      return res.json();
    },
  });
}

const TIER_BADGE: Record<string, string> = {
  legendary: "bg-yellow-400 text-yellow-900 border-yellow-500 font-bold",
  epic:      "bg-purple-600 text-white border-purple-700",
  rare:      "bg-blue-600 text-white border-blue-700",
  uncommon:  "bg-green-700 text-white border-green-800",
  common:    "bg-muted text-muted-foreground border-border",
};

const REC_BADGE: Record<string, string> = {
  BUY:   "bg-green-900/60 text-green-300 border-green-700 font-bold",
  WATCH: "bg-yellow-900/60 text-yellow-300 border-yellow-700",
  SKIP:  "bg-muted text-muted-foreground border-border",
};

const REC_EMOJI: Record<string, string> = {
  BUY: "🔥", WATCH: "👀", SKIP: "⏭",
};

const REGISTRAR_LINKS = (name: string) => [
  { label: "Hostinger", url: `https://www.hostinger.com/domain-name-search?domain=${name}`,                 cls: "bg-violet-700 hover:bg-violet-600" },
  { label: "Namecheap", url: `https://www.namecheap.com/domains/registration/results/?domain=${name}`,      cls: "bg-orange-600 hover:bg-orange-500" },
  { label: "GoDaddy",   url: `https://www.godaddy.com/domainsearch/find?checkAvail=1&domainToCheck=${name}`, cls: "bg-green-700 hover:bg-green-600" },
  { label: "Afternic",  url: `https://www.afternic.com/domain/${name}`,                                     cls: "bg-blue-700 hover:bg-blue-600" },
  { label: "Dan.com",   url: `https://dan.com/search?name=${name}`,                                         cls: "bg-purple-700 hover:bg-purple-600" },
  { label: "Sedo",      url: `https://sedo.com/search/?keyword=${name}`,                                    cls: "bg-zinc-700 hover:bg-zinc-600" },
];

function ScoreBar({ label, value, color }: { label: string; value?: number | null; color: string }) {
  const pct = Math.min(100, Math.max(0, value ?? 0));
  return (
    <div className="mb-4">
      <div className="flex justify-between text-sm mb-1.5">
        <span className="text-muted-foreground font-medium">{label}</span>
        <span className="font-bold text-foreground tabular-nums">
          {value != null ? `${Math.round(value)}/100` : "—"}
        </span>
      </div>
      <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center bg-muted/50 rounded-lg px-4 py-3 border border-border min-w-[90px]">
      <div className="text-2xl font-bold text-foreground font-mono">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-border/40 last:border-0">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="font-mono font-medium text-right text-sm capitalize">{value}</span>
    </div>
  );
}

function EnrichRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="font-mono font-medium text-sm">{value}</span>
    </div>
  );
}

function EnrichStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-3 border ${highlight ? "border-primary/40 bg-primary/10" : "border-border bg-card"}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-mono font-bold text-sm mt-0.5 ${highlight ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}

export default function DomainDetail() {
  const { fqdn } = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [enrichResult, setEnrichResult] = useState<EnrichResult | null>(null);

  const { data: domain, isLoading } = useGetDomain(fqdn || "", {
    query: {
      enabled: !!fqdn,
      queryKey: getGetDomainQueryKey(fqdn || ""),
    },
  });

  const { data: watchlist } = useGetWatchlist();
  const isWatched = watchlist?.some((w) => w.domain.name === fqdn);

  const addWatchlist = useAddToWatchlist();
  const removeWatchlist = useRemoveFromWatchlist();
  const enrich = useEnrichDomain(fqdn || "");

  const [watchingAlert, setWatchingAlert] = useState(false);
  const handleWatchDrop = async () => {
    if (!fqdn) return;
    setWatchingAlert(true);
    try {
      const res = await fetch("/api/alerts/watch-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainName: fqdn }),
      });
      const data = await res.json() as { ok?: boolean; message?: string; error?: string };
      if (!res.ok) {
        toast({ title: "Could not set alert", description: data.error, variant: "destructive" });
      } else if (data.message === "Already watching") {
        toast({ title: `Already watching ${fqdn}`, description: "You'll be alerted when it drops." });
      } else {
        toast({ title: `🔔 Alert set for ${fqdn}`, description: "You'll get a Telegram alert when it drops." });
      }
    } finally {
      setWatchingAlert(false);
    }
  };

  const handleToggleWatchlist = () => {
    if (!domain) return;
    if (isWatched) {
      const item = watchlist?.find((w) => w.domain.name === fqdn);
      if (item) {
        removeWatchlist.mutate({ domainId: item.domainId }, {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() });
            toast({ title: "Removed from watchlist" });
          },
        });
      }
    } else {
      addWatchlist.mutate({ data: { domainId: domain.id } }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() });
          toast({ title: "Added to watchlist" });
        },
      });
    }
  };

  const handleEnrich = () => {
    enrich.mutate(undefined, {
      onSuccess: (result) => {
        setEnrichResult(result);
        queryClient.invalidateQueries({ queryKey: getGetDomainQueryKey(fqdn || "") });
        const tmRisk = result.enriched?.trademark?.riskLevel;
        if (tmRisk === "HIGH") {
          toast({ title: "⚠️ UDRP Risk Detected!", description: "This domain infringes a trademark — DO NOT BUY.", variant: "destructive" });
        } else if (tmRisk === "MEDIUM") {
          toast({ title: "Enrichment complete", description: "⚠️ Moderate trademark risk detected. Review carefully." });
        } else {
          toast({ title: "Enrichment complete", description: "RDAP, OPR, backlinks, and trademark check done. No UDRP risk." });
        }
      },
      onError: (err) => {
        toast({ title: "Enrichment failed", description: err.message, variant: "destructive" });
      },
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-36 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!domain) {
    return (
      <div className="text-center p-16 text-muted-foreground">Domain not found.</div>
    );
  }

  const m = domain.metrics;
  const hasAuction = !!(domain.auctionEndAt || domain.currentBid);

  const formatValue = (v?: number | null) => {
    if (!v) return null;
    return v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${v}`;
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── HEADER ── */}
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-start justify-between flex-wrap gap-6">
          <div className="flex-1 min-w-0">
            <h1
              className="text-3xl md:text-4xl font-mono font-bold text-foreground mb-3 break-all"
              data-testid="text-domain-name"
            >
              {domain.name}
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              {m?.rarityTier && (
                <span
                  className={`text-xs px-3 py-1 rounded-full border capitalize font-medium ${TIER_BADGE[m.rarityTier] ?? TIER_BADGE.common}`}
                  data-testid="text-rarity-tier"
                >
                  {m.rarityTier}
                </span>
              )}
              {m?.recommendation && (
                <span
                  className={`text-xs px-3 py-1 rounded-full border font-medium ${REC_BADGE[m.recommendation] ?? ""}`}
                  data-testid="badge-recommendation"
                >
                  {REC_EMOJI[m.recommendation]} {m.recommendation}
                </span>
              )}
              <span className={`text-xs px-3 py-1 rounded-full border ${
                domain.status === "AVAILABLE" ? "bg-green-900/40 text-green-300 border-green-700" :
                domain.status === "EXPIRING"  ? "bg-orange-900/40 text-orange-300 border-orange-700" :
                domain.status === "AUCTION"   ? "bg-yellow-900/40 text-yellow-300 border-yellow-700" :
                domain.status === "EXPIRED"   ? "bg-blue-900/40 text-blue-300 border-blue-700" :
                domain.status === "TAKEN"     ? "bg-red-900/40 text-red-300 border-red-700" :
                "bg-muted text-muted-foreground border-border"
              }`}>
                {domain.status === "EXPIRED" ? "DROPPING" :
                 domain.status === "TAKEN" ? "REGISTERED" :
                 domain.status}
              </span>
              {m?.expiresDate && domain.status !== "TAKEN" && (
                <span className="text-xs text-muted-foreground">
                  {(() => {
                    const ms = new Date(m.expiresDate).getTime() - Date.now();
                    const days = Math.round(ms / 86_400_000);
                    if (days < 0) return "Available now";
                    if (days === 0) return "Available today";
                    if (days === 1) return "Available in 1 day";
                    if (days <= 7) return `Available in ${days} days`;
                    return `Drops ${new Date(m.expiresDate).toLocaleDateString()}`;
                  })()}
                </span>
              )}
            </div>
            {m?.aiReason && (
              <p className="mt-3 text-muted-foreground italic text-sm max-w-xl">
                "{m.aiReason}"
              </p>
            )}
          </div>

          {/* Key stat boxes */}
          <div className="flex gap-3 flex-wrap">
            {m?.rarityScore != null && (
              <StatBox label="Rarity Score" value={`${Math.round(m.rarityScore)}/100`} />
            )}
            {m?.brandScore != null && (
              <StatBox label="Brand Score" value={`${Math.round(m.brandScore)}/100`} />
            )}
            {formatValue(m?.estimatedValue) && (
              <StatBox label="Est. Value" value={formatValue(m?.estimatedValue)!} />
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap mt-5 pt-5 border-t border-border">
          {domain.auctionUrl && (
            <a href={domain.auctionUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-2" data-testid="button-view-auction">
                View Auction <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </a>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleEnrich}
            disabled={enrich.isPending}
            className="gap-2"
            data-testid="button-enrich"
          >
            {enrich.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            {enrich.isPending ? "Enriching..." : "Enrich"}
          </Button>
          <Button
            variant={isWatched ? "default" : "outline"}
            size="sm"
            onClick={handleToggleWatchlist}
            disabled={addWatchlist.isPending || removeWatchlist.isPending}
            className="gap-2"
            data-testid="button-watchlist"
          >
            <Star className={`w-3.5 h-3.5 ${isWatched ? "fill-current" : ""}`} />
            {isWatched ? "Watched" : "Watch"}
          </Button>
          {domain?.status === "EXPIRING" && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleWatchDrop}
              disabled={watchingAlert}
              className="gap-2 border-amber-500/40 text-amber-400 hover:bg-amber-400/10 hover:text-amber-300"
              data-testid="button-watch-drop"
            >
              <Bell className="w-3.5 h-3.5" />
              {watchingAlert ? "Setting..." : "Alert Me When Available"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* ── SCORE BREAKDOWN ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <ScoreBar label="Pronounceability" value={m?.pronounceScore}  color="bg-purple-500" />
            <ScoreBar label="Length"           value={m?.lengthScore}     color="bg-blue-500" />
            <ScoreBar label="TLD Value"        value={m?.tldScore}        color="bg-green-500" />
            <ScoreBar label="Keyword Value"    value={m?.keywordScore}    color="bg-orange-500" />
            <div className="pt-3 border-t border-border/40 flex justify-between text-sm">
              <span className="text-muted-foreground font-medium">Total Rarity Score</span>
              <span className="font-bold text-foreground text-base">
                {m?.rarityScore != null ? `${Math.round(m.rarityScore)}/100` : "—"}
              </span>
            </div>
            {enrichResult && (
              <div className="mt-4 pt-4 border-t border-border/40 grid grid-cols-3 gap-2">
                <EnrichStat label="SEO Bonus"      value={`+${enrichResult.enriched.scoring.seoBonus.toFixed(1)} pts`} />
                <EnrichStat label="Trend Bonus"    value={`+${enrichResult.enriched.scoring.trendBonus.toFixed(1)} pts`} />
                <EnrichStat label="Composite"      value={`${enrichResult.enriched.scoring.total}/100`} highlight />
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── DOMAIN INFO ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Domain Info</CardTitle>
          </CardHeader>
          <CardContent>
            {[
              { label: "Extension",          value: `.${domain.tld}` },
              { label: "Domain Age",         value: m?.domainAge != null ? `${m.domainAge} years` : null },
              { label: "Registrar",          value: m?.registrar },
              { label: "Domain Authority",   value: m?.domainAuthority != null ? `${Math.round(m.domainAuthority)}/100` : null },
              { label: "Backlinks",          value: m?.backlinks != null ? m.backlinks.toLocaleString() : null },
              { label: "Referring Domains",  value: m?.referringDomains != null ? m.referringDomains.toLocaleString() : null },
              { label: "Niche",              value: m?.niche ? m.niche.charAt(0).toUpperCase() + m.niche.slice(1) : null },
              { label: "Target Buyer",       value: m?.targetBuyer },
              { label: "Source",             value: domain.source },
            ].filter(r => r.value).map(r => (
              <DetailRow key={r.label} label={r.label} value={String(r.value)} />
            ))}
          </CardContent>
        </Card>

        {/* ── AUCTION CARD (only when active) ── */}
        {hasAuction && (
          <Card className="border-orange-700/50 bg-orange-900/10">
            <CardHeader>
              <CardTitle className="text-base text-orange-300">⏰ Auction Active</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {domain.currentBid != null && (
                <div className="flex justify-between">
                  <span className="text-orange-300/70">Current Bid</span>
                  <span className="font-bold text-orange-200">${domain.currentBid.toLocaleString()}</span>
                </div>
              )}
              {domain.bidCount != null && (
                <div className="flex justify-between">
                  <span className="text-orange-300/70">Bids</span>
                  <span className="font-medium text-orange-200">{domain.bidCount}</span>
                </div>
              )}
              {domain.auctionEndAt && (
                <div className="flex justify-between">
                  <span className="text-orange-300/70">Ends</span>
                  <span className="font-bold text-red-400">{new Date(domain.auctionEndAt).toLocaleString()}</span>
                </div>
              )}
              {domain.auctionUrl && (
                <a
                  href={domain.auctionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center mt-3 bg-orange-600 text-white rounded py-2 text-sm font-medium hover:bg-orange-500 transition-colors"
                >
                  View Auction →
                </a>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── REGISTER / BUY LINKS ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Register or Buy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {REGISTRAR_LINKS(domain.name).map(link => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center justify-between w-full px-4 py-2.5 text-sm text-white rounded-lg font-medium transition-colors ${link.cls}`}
              >
                {link.label}
                <span>→</span>
              </a>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ── LIVE ENRICHMENT RESULTS ── */}
      {enrichResult && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Zap className="w-4 h-4 text-primary" />
              Live Enrichment Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">RDAP / WHOIS</p>
                <div className="space-y-1">
                  <EnrichRow label="Available" value={enrichResult.enriched.rdap.available ? "Yes" : "No"} />
                  <EnrichRow label="Registrar" value={enrichResult.enriched.rdap.registrar || "—"} />
                  <EnrichRow label="Age"       value={enrichResult.enriched.rdap.ageYears != null ? `${enrichResult.enriched.rdap.ageYears} years` : "—"} />
                  <EnrichRow label="Created"   value={enrichResult.enriched.rdap.createdDate ? new Date(enrichResult.enriched.rdap.createdDate).toLocaleDateString() : "—"} />
                  <EnrichRow label="Expires"   value={enrichResult.enriched.rdap.expiresDate ? new Date(enrichResult.enriched.rdap.expiresDate).toLocaleDateString() : "—"} />
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">OpenPageRank</p>
                {enrichResult.enriched.opr ? (
                  <div className="space-y-1">
                    <EnrichRow label="Page Rank"     value={`${enrichResult.enriched.opr.rank}/10`} />
                    <EnrichRow label="DA (converted)" value={`${enrichResult.enriched.opr.da}/100`} />
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    No data. Set <code className="bg-muted px-1 rounded">OPENPAGERANK_API_KEY</code> to enable.
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Backlinks</p>
                {enrichResult.enriched.backlinks ? (
                  <div className="space-y-1">
                    <EnrichRow label="Total Links"       value={enrichResult.enriched.backlinks.totalLinks.toLocaleString()} />
                    <EnrichRow label="Referring Domains" value={enrichResult.enriched.backlinks.referringDomains.toLocaleString()} />
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">No data returned from OpenLinkProfiler.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── UDRP TRADEMARK RISK ── */}
      {enrichResult?.enriched?.trademark && (
        <Card className={`border-2 ${
          enrichResult.enriched.trademark.riskLevel === "HIGH"
            ? "border-red-600 bg-red-950/30"
            : enrichResult.enriched.trademark.riskLevel === "MEDIUM"
              ? "border-yellow-600 bg-yellow-950/20"
              : enrichResult.enriched.trademark.riskLevel === "LOW"
                ? "border-orange-600/40 bg-orange-950/10"
                : "border-green-600/40 bg-green-950/10"
        }`}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 text-sm ${
              enrichResult.enriched.trademark.riskLevel === "HIGH"
                ? "text-red-400"
                : enrichResult.enriched.trademark.riskLevel === "MEDIUM"
                  ? "text-yellow-400"
                  : enrichResult.enriched.trademark.riskLevel === "LOW"
                    ? "text-orange-400"
                    : "text-green-400"
            }`}>
              <ShieldAlert className="w-5 h-5" />
              UDRP Trademark Check — {enrichResult.enriched.trademark.riskLevel} RISK
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Risk Banner */}
            {enrichResult.enriched.trademark.shouldAvoid && (
              <div className="mb-4 p-4 bg-red-900/40 border border-red-700 rounded-lg">
                <p className="text-red-200 font-bold text-sm flex items-center gap-2">
                  <span className="text-lg">🚫</span> DO NOT BUY THIS DOMAIN
                </p>
                <p className="text-red-300/80 text-xs mt-1">
                  This domain is likely subject to a UDRP dispute and could be forcibly transferred to the trademark owner.
                </p>
              </div>
            )}

            {/* Reason */}
            <p className={`text-sm mb-4 ${
              enrichResult.enriched.trademark.shouldAvoid ? "text-red-300" : "text-muted-foreground"
            }`}>
              {enrichResult.enriched.trademark.reason}
            </p>

            {/* Matches */}
            {enrichResult.enriched.trademark.matches.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Trademark Matches Found</p>
                {enrichResult.enriched.trademark.matches.map((match, idx) => (
                  <div key={idx} className={`flex items-center justify-between p-3 rounded-lg border ${
                    match.matchType === "exact"
                      ? "border-red-700/60 bg-red-900/20"
                      : match.matchType === "contains"
                        ? "border-red-700/40 bg-red-900/10"
                        : "border-yellow-700/40 bg-yellow-900/10"
                  }`}>
                    <div>
                      <p className="font-mono font-bold text-sm">
                        {match.matchType === "exact" ? "🔴" : match.matchType === "contains" ? "🟠" : "🟡"}{" "}
                        "{match.mark}"
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {match.source}
                        {match.owner && ` • Owner: ${match.owner}`}
                        {match.registrationNumber && ` • Reg#: ${match.registrationNumber}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`text-xs px-2 py-1 rounded-full border font-medium ${
                        match.matchType === "exact"
                          ? "bg-red-900/60 text-red-300 border-red-700"
                          : match.matchType === "contains"
                            ? "bg-orange-900/60 text-orange-300 border-orange-700"
                            : "bg-yellow-900/60 text-yellow-300 border-yellow-700"
                      }`}>
                        {match.matchType === "exact" ? "EXACT MATCH" : match.matchType === "contains" ? "CONTAINS MARK" : "SIMILAR"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Safe badge */}
            {enrichResult.enriched.trademark.riskLevel === "NONE" && (
              <div className="p-3 bg-green-900/30 border border-green-700/40 rounded-lg">
                <p className="text-green-300 text-sm font-medium flex items-center gap-2">
                  <span className="text-lg">✅</span> No trademark conflicts detected — safe to purchase.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── WAYBACK MACHINE ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Archive className="w-4 h-4 text-muted-foreground" />
            Wayback Machine History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">Check what this domain was previously used for:</p>
          <a
            href={`https://web.archive.org/web/*/${domain.name}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            View archive history for {domain.name} <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </CardContent>
      </Card>

    </div>
  );
}
