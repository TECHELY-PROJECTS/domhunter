import { useState } from "react";
import { useListDomains } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function Explore() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<string>("rarityScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data, isLoading } = useListDomains({
    page,
    limit: 50,
    search: search || undefined,
    status: status !== "ALL" ? (status as any) : undefined,
    sortBy: sortBy as any,
    sortDir,
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Explore Domains</h1>
        <p className="text-muted-foreground mt-1">Search, filter, and analyze the market.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-end bg-card p-4 rounded-lg border border-border">
        <div className="flex-1 w-full space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Search FQDN</label>
          <Input 
            placeholder="Search domains..." 
            value={search} 
            onChange={(e) => { setSearch(e.target.value); setPage(1); }} 
            className="font-mono"
            data-testid="input-search"
          />
        </div>
        
        <div className="w-full md:w-48 space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</label>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="EXPIRING">Expiring</SelectItem>
              <SelectItem value="EXPIRED">Expired</SelectItem>
              <SelectItem value="AUCTION">Auction</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-full md:w-48 space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sort By</label>
          <Select value={sortBy} onValueChange={(v) => { setSortBy(v); setPage(1); }}>
            <SelectTrigger>
              <SelectValue placeholder="Sort By" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rarityScore">Rarity Score</SelectItem>
              <SelectItem value="domainAuthority">Domain Auth</SelectItem>
              <SelectItem value="auctionEndAt">Auction End</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button 
          variant="outline" 
          onClick={() => { setSortDir(sortDir === "asc" ? "desc" : "asc"); setPage(1); }}
        >
          {sortDir === "asc" ? "Asc" : "Desc"}
        </Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Domain</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">DA</TableHead>
              <TableHead className="text-right">Rarity</TableHead>
              <TableHead className="text-right">Brand</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(10)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-6 w-8 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-6 w-8 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-6 w-8 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : data?.domains.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-32 text-muted-foreground">
                  No domains found matching your criteria.
                </TableCell>
              </TableRow>
            ) : (
              data?.domains.map((domain) => (
                <TableRow key={domain.id}>
                  <TableCell className="font-mono font-medium">
                    <Link href={`/domain/${domain.name}`} className="hover:text-primary transition-colors">
                      {domain.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="uppercase text-[10px]">{domain.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{domain.metrics?.domainAuthority || "-"}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{domain.metrics?.rarityScore ? Math.round(domain.metrics.rarityScore) : "-"}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{domain.metrics?.brandScore ? Math.round(domain.metrics.brandScore) : "-"}</TableCell>
                  <TableCell className="text-right">
                    <Link href={`/domain/${domain.name}`}>
                      <Button variant="ghost" size="sm">View</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <Button variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
            Previous
          </Button>
          <div className="flex items-center px-4 font-mono text-sm">
            Page {page} of {data.totalPages}
          </div>
          <Button variant="outline" disabled={page === data.totalPages} onClick={() => setPage(p => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
