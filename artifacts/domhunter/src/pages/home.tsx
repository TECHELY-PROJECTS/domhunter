import { useGetDomainStats, useGetRecentDomains, useGetTopScoringDomains, useGetExpiringSoonDomains } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Sparkles, Database, Trash2, Wand2, Upload } from "lucide-react";
import { useState, useRef } from "react";
import { DomainSearch } from "@/components/domain-search";

export default function Home() {
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useGetDomainStats();
  const { data: recent, isLoading: recentLoading, refetch: refetchRecent } = useGetRecentDomains({ limit: 5 });
  const { data: topScoring, isLoading: topScoringLoading, refetch: refetchTop } = useGetTopScoringDomains({ limit: 5 });
  const { data: expiring, isLoading: expiringLoading, refetch: refetchExpiring } = useGetExpiringSoonDomains({ limit: 5 });

  const { toast } = useToast();
  const [syncLoading, setSyncLoading] = useState(false);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [brandableLoading, setBrandableLoading] = useState(false);
  const [clearLoading, setClearLoading] = useState(false);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refetchAll = () => { refetchStats(); refetchRecent(); refetchTop(); refetchExpiring(); };

  const anyLoading = syncLoading || sampleLoading || brandableLoading || clearLoading || backfillLoading || uploadLoading;

  const handleIngest = async () => {
    setSyncLoading(true);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "dropcatch" }),
      });
      const data = await res.json() as { message?: string; error?: string; top30?: unknown[]; needsUpload?: boolean };
      if (!res.ok) {
        const detail = data.error ?? "Unknown error";
        toast({
          title: "Sync Failed",
          description: detail,
          variant: "destructive",
        });
      } else if (data.needsUpload) {
        toast({
          title: "Upload Required",
          description: "Auto-download not available. Download 'Dropping Today' CSV from dropcatch.com/downloads and click 'Upload CSV'.",
        });
      } else {
        const top30Count = Array.isArray(data.top30) ? data.top30.length : 0;
        toast({
          title: "Sync Complete",
          description: top30Count > 0
            ? `${data.message} — ${top30Count} top picks identified!`
            : data.message ?? "Domains fetched.",
        });
        refetchAll();
      }
    } catch {
      toast({ title: "Sync Failed", description: "Network error — check server is running.", variant: "destructive" });
    } finally {
      setSyncLoading(false);
    }
  };

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Accept .csv and .txt files
    if (!file.name.endsWith(".csv") && !file.name.endsWith(".txt")) {
      toast({ title: "Invalid File", description: "Please upload a .csv or .txt file from DropCatch.", variant: "destructive" });
      return;
    }

    setUploadLoading(true);
    try {
      const csvContent = await file.text();

      if (csvContent.trim().length === 0) {
        toast({ title: "Empty File", description: "The uploaded file is empty.", variant: "destructive" });
        return;
      }

      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "dropcatch", csv: csvContent }),
      });
      const data = await res.json() as { message?: string; error?: string; top30?: unknown[]; ingested?: number };
      if (!res.ok) {
        toast({ title: "Upload Failed", description: data.error ?? "Unknown error", variant: "destructive" });
      } else {
        const top30Count = Array.isArray(data.top30) ? data.top30.length : 0;
        toast({
          title: "CSV Processed",
          description: top30Count > 0
            ? `${data.ingested ?? 0} domains ingested — ${top30Count} top picks identified!`
            : data.message ?? "Domains processed.",
        });
        refetchAll();
      }
    } catch {
      toast({ title: "Upload Failed", description: "Network error — check server is running.", variant: "destructive" });
    } finally {
      setUploadLoading(false);
      // Reset file input so the same file can be re-uploaded
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSampleData = async () => {
    setSampleLoading(true);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "sample" }),
      });
      const data = await res.json() as { message?: string; error?: string };
      if (!res.ok) {
        toast({ title: "Failed", description: data.error ?? "Could not load sample data", variant: "destructive" });
      } else {
        toast({ title: "Sample Data Loaded", description: data.message ?? "20 sample domains added." });
        refetchAll();
      }
    } catch {
      toast({ title: "Failed", description: "Network error", variant: "destructive" });
    } finally {
      setSampleLoading(false);
    }
  };

  const handleBrandable = async () => {
    setBrandableLoading(true);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "brandable" }),
      });
      const data = await res.json() as { message?: string; inserted?: number; error?: string };
      if (!res.ok) {
        toast({ title: "Generation Failed", description: data.error ?? "Unknown error", variant: "destructive" });
      } else {
        toast({ title: "Brandable Domains Added", description: data.message ?? "Done" });
        refetchAll();
      }
    } catch {
      toast({ title: "Generation Failed", description: "Network error", variant: "destructive" });
    } finally {
      setBrandableLoading(false);
    }
  };

  const handleBackfill = async () => {
    setBackfillLoading(true);
    try {
      const res = await fetch("/api/domains/backfill-scores", { method: "POST" });
      const data = await res.json() as { message?: string; queued?: number; error?: string };
      if (!res.ok) {
        toast({ title: "Backfill Failed", description: data.error ?? "Error", variant: "destructive" });
      } else {
        toast({ title: "Backfill Started", description: data.message ?? `Filling scores for ${data.queued} domains in background.` });
      }
    } catch {
      toast({ title: "Backfill Failed", description: "Network error", variant: "destructive" });
    } finally {
      setBackfillLoading(false);
    }
  };

  const handleClearAll = async (source?: string) => {
    const label = source ? `all "${source}" domains` : "ALL domains";
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    setClearLoading(true);
    try {
      const res = await fetch("/api/domains", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: source ? JSON.stringify({ source }) : "{}",
      });
      const data = await res.json() as { deleted?: number; error?: string };
      if (!res.ok) {
        toast({ title: "Delete Failed", description: data.error ?? "Error", variant: "destructive" });
      } else {
        toast({ title: "Deleted", description: `Removed ${data.deleted?.toLocaleString()} domains.` });
        refetchAll();
      }
    } catch {
      toast({ title: "Delete Failed", description: "Network error", variant: "destructive" });
    } finally {
      setClearLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Terminal</h1>
          <p className="text-muted-foreground mt-1">Live market overview and opportunities.</p>
        </div>
        <DomainSearch />
      </div>
      <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSampleData}
            disabled={anyLoading}
            className="gap-2 border-blue-500/40 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
          >
            <Database className={`w-4 h-4 ${sampleLoading ? "animate-pulse" : ""}`} />
            {sampleLoading ? "Loading..." : "Load Sample Data"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBrandable}
            disabled={anyLoading}
            className="gap-2 border-purple-500/40 text-purple-400 hover:bg-purple-500/10 hover:text-purple-300"
          >
            <Sparkles className={`w-4 h-4 ${brandableLoading ? "animate-pulse" : ""}`} />
            {brandableLoading ? "Generating..." : "Generate Brandable"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleIngest} disabled={anyLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${syncLoading ? "animate-spin" : ""}`} />
            {syncLoading ? "Syncing..." : "Force Sync"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={anyLoading}
            className="gap-2 border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10 hover:text-cyan-300"
          >
            <Upload className={`w-4 h-4 ${uploadLoading ? "animate-pulse" : ""}`} />
            {uploadLoading ? "Processing..." : "Upload CSV"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            onChange={handleCSVUpload}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleBackfill}
            disabled={anyLoading}
            className="gap-2 border-green-500/40 text-green-400 hover:bg-green-500/10 hover:text-green-300"
          >
            <Wand2 className={`w-4 h-4 ${backfillLoading ? "animate-pulse" : ""}`} />
            {backfillLoading ? "Filling..." : "Fill Missing Scores"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleClearAll()}
            disabled={anyLoading}
            className="gap-2 border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            <Trash2 className={`w-4 h-4 ${clearLoading ? "animate-pulse" : ""}`} />
            {clearLoading ? "Deleting..." : "Clear All"}
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
              ) : topScoring?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="mb-3">No domains yet.</p>
                  <Button size="sm" variant="outline" onClick={handleSampleData} disabled={anyLoading} className="gap-2">
                    <Database className="w-4 h-4" /> Load Sample Data
                  </Button>
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
