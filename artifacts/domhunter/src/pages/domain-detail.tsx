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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Star, Zap, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

const TIER_COLORS: Record<string, string> = {
  legendary: "text-yellow-400",
  epic: "text-purple-400",
  rare: "text-blue-400",
  uncommon: "text-green-400",
  common: "text-muted-foreground",
};

const REC_STYLES: Record<string, string> = {
  BUY: "bg-green-500/20 text-green-400 border-green-500/40",
  WATCH: "bg-amber-500/20 text-amber-400 border-amber-500/40",
  SKIP: "bg-red-500/20 text-red-400 border-red-500/40",
};

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

  const handleToggleWatchlist = () => {
    if (!domain) return;
    if (isWatched) {
      const item = watchlist?.find((w) => w.domain.name === fqdn);
      if (item) {
        removeWatchlist.mutate(
          { id: item.id },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() });
              toast({ title: "Removed from watchlist" });
            },
          },
        );
      }
    } else {
      addWatchlist.mutate(
        { data: { domainId: domain.id } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() });
            toast({ title: "Added to watchlist" });
          },
        },
      );
    }
  };

  const handleEnrich = () => {
    enrich.mutate(undefined, {
      onSuccess: (result) => {
        setEnrichResult(result);
        queryClient.invalidateQueries({
          queryKey: getGetDomainQueryKey(fqdn || ""),
        });
        toast({
          title: "Enrichment complete",
          description: `RDAP, OPR, and backlink data fetched. Score updated.`,
        });
      },
      onError: (err) => {
        toast({
          title: "Enrichment failed",
          description: err.message,
          variant: "destructive",
        });
      },
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-28 w-full" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!domain) {
    return (
      <div className="text-center p-16 text-muted-foreground">
        Domain not found.
      </div>
    );
  }

  const m = domain.metrics;
  const tier = m?.rarityTier ?? "common";
  const rec = m?.recommendation ?? "";

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-6 rounded-xl border border-border">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1
              className="text-3xl font-bold tracking-tight font-mono"
              data-testid="text-domain-name"
            >
              {domain.name}
            </h1>
            <Badge variant="outline" className="uppercase text-xs">
              {domain.status}
            </Badge>
            {tier && (
              <span
                className={`text-xs font-semibold uppercase tracking-widest ${TIER_COLORS[tier] ?? "text-muted-foreground"}`}
                data-testid="text-rarity-tier"
              >
                {tier}
              </span>
            )}
            {rec && (
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded border ${REC_STYLES[rec] ?? ""}`}
                data-testid="badge-recommendation"
              >
                {rec}
              </span>
            )}
          </div>
          <p className="text-muted-foreground mt-2 text-sm max-w-xl">
            {m?.aiReason || "No AI analysis available yet. Click Enrich to fetch live data."}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {domain.auctionUrl && (
            <a href={domain.auctionUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-2" data-testid="button-view-auction">
                Auction <ExternalLink className="w-3.5 h-3.5" />
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
            {enrich.isPending ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5" />
            )}
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
        </div>
      </div>

      {/* Score cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <ScoreCard title="Rarity Score" value={m?.rarityScore} />
        <ScoreCard title="Brand Score" value={m?.brandScore} />
        <ScoreCard title="Domain Authority" value={m?.domainAuthority} />
        <ScoreCard title="Trend Score" value={m?.trendScore} />
      </div>

      {/* Sub-score breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-widest text-muted-foreground">
            Score Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SubScore label="Length" value={m?.lengthScore} weight="25%" />
            <SubScore label="Pronounce" value={m?.pronounceScore} weight="35%" />
            <SubScore label="TLD" value={m?.tldScore} weight="20%" />
            <SubScore label="Keyword" value={m?.keywordScore} weight="20%" />
          </div>
          {enrichResult && (
            <div className="mt-4 pt-4 border-t border-border/50 grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <EnrichStat label="SEO Bonus" value={`+${enrichResult.enriched.scoring.seoBonus.toFixed(1)} pts`} />
              <EnrichStat label="Trend Bonus" value={`+${enrichResult.enriched.scoring.trendBonus.toFixed(1)} pts`} />
              <EnrichStat label="Composite Total" value={`${enrichResult.enriched.scoring.total} / 100`} highlight />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Domain details */}
        <Card>
          <CardHeader>
            <CardTitle>Domain Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <DetailRow label="Registrar" value={m?.registrar || "-"} />
            <DetailRow
              label="Domain Age"
              value={m?.domainAge != null ? `${m.domainAge} years` : "-"}
            />
            <DetailRow
              label="Backlinks"
              value={m?.backlinks != null ? m.backlinks.toLocaleString() : "-"}
            />
            <DetailRow
              label="Referring Domains"
              value={m?.referringDomains != null ? m.referringDomains.toLocaleString() : "-"}
            />
            <DetailRow label="Niche" value={m?.niche || "-"} />
            <DetailRow label="Source" value={domain.source || "-"} />
            <DetailRow label="TLD" value={`.${domain.tld}`} />
            <DetailRow label="SLD" value={domain.sld} />
          </CardContent>
        </Card>

        {/* Auction + valuation */}
        <Card>
          <CardHeader>
            <CardTitle>Valuation &amp; Auction</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <DetailRow
              label="Current Bid"
              value={domain.currentBid ? `$${domain.currentBid.toLocaleString()}` : "-"}
            />
            <DetailRow
              label="Estimated Value"
              value={m?.estimatedValue ? `$${m.estimatedValue.toLocaleString()}` : "-"}
            />
            <DetailRow label="Bid Count" value={domain.bidCount?.toString() || "-"} />
            <DetailRow
              label="Auction Ends"
              value={
                domain.auctionEndAt
                  ? new Date(domain.auctionEndAt).toLocaleString()
                  : "-"
              }
            />
          </CardContent>
        </Card>
      </div>

      {/* Enrichment result panel */}
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
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
                  RDAP / WHOIS
                </p>
                <div className="space-y-2">
                  <EnrichRow label="Available" value={enrichResult.enriched.rdap.available ? "Yes" : "No"} />
                  <EnrichRow label="Registrar" value={enrichResult.enriched.rdap.registrar || "-"} />
                  <EnrichRow label="Age" value={enrichResult.enriched.rdap.ageYears != null ? `${enrichResult.enriched.rdap.ageYears} years` : "-"} />
                  <EnrichRow
                    label="Created"
                    value={
                      enrichResult.enriched.rdap.createdDate
                        ? new Date(enrichResult.enriched.rdap.createdDate).toLocaleDateString()
                        : "-"
                    }
                  />
                  <EnrichRow
                    label="Expires"
                    value={
                      enrichResult.enriched.rdap.expiresDate
                        ? new Date(enrichResult.enriched.rdap.expiresDate).toLocaleDateString()
                        : "-"
                    }
                  />
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
                  OpenPageRank
                </p>
                {enrichResult.enriched.opr ? (
                  <div className="space-y-2">
                    <EnrichRow label="Page Rank" value={`${enrichResult.enriched.opr.rank} / 10`} />
                    <EnrichRow label="DA (converted)" value={`${enrichResult.enriched.opr.da} / 100`} />
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    No data. Set{" "}
                    <code className="bg-muted px-1 rounded">OPENPAGERANK_API_KEY</code>{" "}
                    to enable.
                  </p>
                )}
              </div>

              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
                  Backlinks
                </p>
                {enrichResult.enriched.backlinks ? (
                  <div className="space-y-2">
                    <EnrichRow label="Total Links" value={enrichResult.enriched.backlinks.totalLinks.toLocaleString()} />
                    <EnrichRow label="Referring Domains" value={enrichResult.enriched.backlinks.referringDomains.toLocaleString()} />
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    No data returned from OpenLinkProfiler.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ScoreCard({ title, value }: { title: string; value?: number | null }) {
  const pct = value != null ? Math.min(100, Math.max(0, value)) : 0;
  const color =
    pct >= 80
      ? "bg-green-500"
      : pct >= 60
        ? "bg-primary"
        : pct >= 40
          ? "bg-amber-500"
          : "bg-red-500";

  return (
    <Card data-testid={`card-score-${title.toLowerCase().replace(/\s/g, "-")}`}>
      <CardContent className="p-5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </p>
        <div className="mt-3 flex items-end gap-1">
          <span className="text-3xl font-bold font-mono">
            {value != null ? Math.round(value) : "-"}
          </span>
          {value != null && (
            <span className="text-xs text-muted-foreground mb-1">/ 100</span>
          )}
        </div>
        <div className="h-1.5 w-full bg-secondary rounded-full mt-3 overflow-hidden">
          <div
            className={`h-full ${color} transition-all duration-1000 ease-out rounded-full`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function SubScore({
  label,
  value,
  weight,
}: {
  label: string;
  value?: number | null;
  weight: string;
}) {
  const pct = value != null ? Math.min(100, Math.max(0, value)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-muted-foreground/60">{weight}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-primary/70 rounded-full transition-all duration-1000"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="font-mono text-xs w-7 text-right">
          {value != null ? Math.round(value) : "-"}
        </span>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-border/40 last:border-0">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="font-mono font-medium text-right text-sm">{value}</span>
    </div>
  );
}

function EnrichRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}

function EnrichStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-3 border ${highlight ? "border-primary/40 bg-primary/10" : "border-border bg-card"}`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`font-mono font-bold text-sm mt-0.5 ${highlight ? "text-primary" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}
