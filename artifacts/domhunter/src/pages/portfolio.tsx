import { useGetWatchlist, useRemoveFromWatchlist, getGetWatchlistQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Portfolio() {
  const { data, isLoading } = useGetWatchlist();
  const removeWatchlist = useRemoveFromWatchlist();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleRemove = (id: string, domainName: string) => {
    removeWatchlist.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() });
        toast({ title: `Removed ${domainName} from portfolio` });
      }
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Portfolio & Watchlist</h1>
        <p className="text-muted-foreground mt-1">Domains you are actively monitoring.</p>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Domain</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Current Bid</TableHead>
              <TableHead className="text-right">Rarity</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-6 w-16 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-6 w-8 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : !data || data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center h-32 text-muted-foreground">
                  Your portfolio is empty. Head to Explore to find domains.
                </TableCell>
              </TableRow>
            ) : (
              data.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono font-medium">
                    <Link href={`/domain/${item.domain.name}`} className="hover:text-primary transition-colors">
                      {item.domain.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="uppercase text-[10px]">{item.domain.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {item.domain.currentBid ? `$${item.domain.currentBid}` : "-"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {item.domain.metrics?.rarityScore ? Math.round(item.domain.metrics.rarityScore) : "-"}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Link href={`/domain/${item.domain.name}`}>
                      <Button variant="ghost" size="sm">View</Button>
                    </Link>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleRemove(item.id, item.domain.name)}
                      disabled={removeWatchlist.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
