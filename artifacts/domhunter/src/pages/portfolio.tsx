import { useGetWatchlist, useRemoveFromWatchlist, getGetWatchlistQueryKey } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, BookOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const REC_STYLES: Record<string, string> = {
  BUY:   "bg-green-900/60 text-green-300 border border-green-700 font-bold",
  WATCH: "bg-yellow-900/60 text-yellow-300 border border-yellow-700",
  SKIP:  "bg-muted text-muted-foreground border border-border",
};

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-5 text-center">
        <div className="text-2xl font-bold text-foreground font-mono">{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{label}</div>
      </CardContent>
    </Card>
  );
}

export default function Portfolio() {
  const { data, isLoading } = useGetWatchlist();
  const removeWatchlist = useRemoveFromWatchlist();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const handleRemove = (id: string, domainName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeWatchlist.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() });
        toast({ title: `Removed ${domainName} from watchlist` });
      },
    });
  };

  const watchlist = data ?? [];

  const totalValue = watchlist.reduce(
    (sum, item) => sum + (item.domain.metrics?.estimatedValue ?? 0), 0,
  );
  const buySignals = watchlist.filter(
    (item) => item.domain.metrics?.recommendation === "BUY",
  ).length;

  const formatValue = (v?: number | null) => {
    if (!v) return "—";
    return v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${v}`;
  };

  const formatTotalValue = (v: number) => {
    if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
    return `$${v}`;
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Watchlist</h1>
          <p className="text-muted-foreground mt-1">
            {isLoading ? "Loading..." : `${watchlist.length} domain${watchlist.length !== 1 ? "s" : ""} tracked`}
          </p>
        </div>
        <Link href="/explore">
          <Button variant="outline" className="gap-2">
            <Eye className="w-4 h-4" /> Browse Domains
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {isLoading ? (
          [...Array(3)].map((_, i) => (
            <Card key={i}><CardContent className="pt-5 pb-5"><Skeleton className="h-8 w-full" /></CardContent></Card>
          ))
        ) : (
          <>
            <StatCard label="Domains Watched"  value={watchlist.length} />
            <StatCard label="Total Est. Value"  value={formatTotalValue(totalValue)} />
            <StatCard label="BUY Signals"       value={buySignals} />
          </>
        )}
      </div>

      {/* Empty state */}
      {!isLoading && watchlist.length === 0 && (
        <div className="text-center py-20 border border-dashed border-border rounded-xl bg-card/30">
          <BookOpen className="w-10 h-10 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground text-lg mb-1">No domains in your watchlist yet</p>
          <p className="text-muted-foreground/60 text-sm mb-6">
            Head to Explore and click Watch on any domain to track it here.
          </p>
          <Link href="/explore">
            <Button>Browse Domains →</Button>
          </Link>
        </div>
      )}

      {/* Table */}
      {(isLoading || watchlist.length > 0) && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-xs">Domain</TableHead>
                <TableHead className="text-center text-xs w-16">Score</TableHead>
                <TableHead className="text-center text-xs w-16">Brand</TableHead>
                <TableHead className="text-center text-xs w-14">DA</TableHead>
                <TableHead className="text-center text-xs w-24">Est. Value</TableHead>
                <TableHead className="text-center text-xs w-20">Signal</TableHead>
                <TableHead className="text-center text-xs w-24">Expires</TableHead>
                <TableHead className="text-center text-xs w-24">Added</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? [...Array(5)].map((_, i) => (
                    <TableRow key={i} className="border-border">
                      <TableCell><Skeleton className="h-5 w-36" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-8 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-8 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-8 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-14 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-12 mx-auto" /></TableCell>
                    </TableRow>
                  ))
                : watchlist.map((item) => {
                    const d = item.domain;
                    const m = d.metrics;
                    return (
                      <TableRow
                        key={item.id}
                        className="border-border hover:bg-accent/5 cursor-pointer group"
                        onClick={() => navigate(`/domain/${d.name}`)}
                      >
                        <TableCell className="font-mono font-semibold text-primary group-hover:text-primary/80 py-3">
                          {d.name}
                        </TableCell>

                        <TableCell className="text-center py-3">
                          <span className={`font-bold text-sm ${
                            (m?.rarityScore ?? 0) >= 70 ? "text-green-400" :
                            (m?.rarityScore ?? 0) >= 50 ? "text-primary" : "text-muted-foreground"
                          }`}>
                            {m?.rarityScore != null ? Math.round(m.rarityScore) : "—"}
                          </span>
                        </TableCell>

                        <TableCell className="text-center py-3 text-sm text-foreground">
                          {m?.brandScore != null ? Math.round(m.brandScore) : "—"}
                        </TableCell>

                        <TableCell className="text-center py-3">
                          <span className={`text-sm font-medium ${
                            (m?.domainAuthority ?? 0) >= 50 ? "text-green-400" :
                            (m?.domainAuthority ?? 0) >= 20 ? "text-yellow-400" : "text-muted-foreground"
                          }`}>
                            {m?.domainAuthority != null ? Math.round(m.domainAuthority) : "—"}
                          </span>
                        </TableCell>

                        <TableCell className="text-center py-3 text-sm font-semibold text-foreground">
                          {formatValue(m?.estimatedValue)}
                        </TableCell>

                        <TableCell className="text-center py-3">
                          {m?.recommendation ? (
                            <span className={`text-xs px-2 py-0.5 rounded ${REC_STYLES[m.recommendation] ?? ""}`}>
                              {m.recommendation}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>

                        <TableCell className="text-center py-3 text-xs text-muted-foreground">
                          {d.auctionEndAt
                            ? new Date(d.auctionEndAt).toLocaleDateString()
                            : "—"}
                        </TableCell>

                        <TableCell className="text-center py-3 text-xs text-muted-foreground">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </TableCell>

                        <TableCell className="py-3" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => handleRemove(item.id, d.name, e)}
                            disabled={removeWatchlist.isPending}
                            className="text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded hover:bg-destructive/10 disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })
              }
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
