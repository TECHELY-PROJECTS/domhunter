import { useGetDomainStats, useGetRecentDomains, useGetTopScoringDomains, useGetExpiringSoonDomains, useTriggerIngest } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw } from "lucide-react";

export default function Home() {
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useGetDomainStats();
  const { data: recent, isLoading: recentLoading, refetch: refetchRecent } = useGetRecentDomains({ limit: 5 });
  const { data: topScoring, isLoading: topScoringLoading, refetch: refetchTop } = useGetTopScoringDomains({ limit: 5 });
  const { data: expiring, isLoading: expiringLoading, refetch: refetchExpiring } = useGetExpiringSoonDomains({ limit: 5 });

  const triggerIngest = useTriggerIngest();
  const { toast } = useToast();

  const handleIngest = () => {
    triggerIngest.mutate({ data: { source: "godaddy" as const } }, {
      onSuccess: () => {
        toast({ title: "Ingestion Triggered", description: "Fetching new domains..." });
        refetchStats();
        refetchRecent();
        refetchTop();
        refetchExpiring();
      }
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Terminal</h1>
          <p className="text-muted-foreground mt-1">Live market overview and opportunities.</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleIngest} disabled={triggerIngest.isPending}>
          <RefreshCw className={`w-4 h-4 mr-2 ${triggerIngest.isPending ? "animate-spin" : ""}`} />
          Force Sync
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Domains" value={stats?.totalDomains} loading={statsLoading} />
        <StatCard title="Available Now" value={stats?.totalAvailable} loading={statsLoading} />
        <StatCard title="Active Auctions" value={stats?.totalAuctions} loading={statsLoading} />
        <StatCard title="Avg Rarity" value={stats?.avgRarityScore ? Math.round(stats.avgRarityScore) : undefined} loading={statsLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Top Scoring Domains</CardTitle>
            </CardHeader>
            <CardContent>
              {topScoringLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : (
                <div className="space-y-2">
                  {topScoring?.map((domain) => (
                    <Link key={domain.id} href={`/domain/${domain.name}`}>
                      <div className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary transition-colors cursor-pointer bg-card/50">
                        <div>
                          <p className="font-mono font-bold">{domain.name}</p>
                          <div className="flex gap-2 mt-1">
                            <Badge variant="outline" className="text-[10px] uppercase">{domain.status}</Badge>
                            {domain.metrics?.rarityTier && (
                              <Badge variant="secondary" className="text-[10px] uppercase text-primary">{domain.metrics.rarityTier}</Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-primary">{domain.metrics?.rarityScore || 0}</p>
                          <p className="text-xs text-muted-foreground">Score</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Recently Discovered</CardTitle>
            </CardHeader>
            <CardContent>
              {recentLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : (
                <div className="space-y-2">
                  {recent?.map((domain) => (
                    <Link key={domain.id} href={`/domain/${domain.name}`}>
                      <div className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary transition-colors cursor-pointer bg-card/50">
                        <div>
                          <p className="font-mono font-bold">{domain.name}</p>
                        </div>
                        <Badge variant="outline" className="uppercase">{domain.source}</Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-destructive/50 bg-destructive/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg text-destructive">Expiring Soon</CardTitle>
            </CardHeader>
            <CardContent>
              {expiringLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : (
                <div className="space-y-2">
                  {expiring?.map((domain) => (
                    <Link key={domain.id} href={`/domain/${domain.name}`}>
                      <div className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-destructive transition-colors cursor-pointer bg-card">
                        <div>
                          <p className="font-mono font-bold">{domain.name}</p>
                          <p className="text-xs text-muted-foreground mt-1">{new Date(domain.auctionEndAt || "").toLocaleDateString()}</p>
                        </div>
                        {domain.currentBid ? (
                          <div className="text-right">
                            <p className="text-sm font-bold">${domain.currentBid}</p>
                            <p className="text-xs text-muted-foreground">{domain.bidCount} bids</p>
                          </div>
                        ) : null}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, loading }: { title: string; value?: number; loading: boolean }) {
  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        {loading ? (
          <Skeleton className="h-8 w-20 mt-2" />
        ) : (
          <p className="text-2xl md:text-3xl font-bold mt-2 text-primary">{value?.toLocaleString()}</p>
        )}
      </CardContent>
    </Card>
  );
}
