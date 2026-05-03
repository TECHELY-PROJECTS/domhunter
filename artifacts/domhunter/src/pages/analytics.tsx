import { useGetNicheBreakdown, useGetSourceBreakdown, useGetDaVsScore } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ScatterChart, Scatter, ZAxis } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

export default function Analytics() {
  const { data: nicheData, isLoading: nicheLoading } = useGetNicheBreakdown();
  const { data: sourceData, isLoading: sourceLoading } = useGetSourceBreakdown();
  const { data: scatterData, isLoading: scatterLoading } = useGetDaVsScore({ limit: 100 });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Market Analytics</h1>
        <p className="text-muted-foreground mt-1">High-level market distributions and correlations.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Niche Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {nicheLoading ? (
              <Skeleton className="w-full h-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={nicheData || []} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                  <XAxis dataKey="niche" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                    cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Source Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {sourceLoading ? (
              <Skeleton className="w-full h-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sourceData || []} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                  <XAxis dataKey="source" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                    cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Domain Authority vs Rarity Score</CardTitle>
          </CardHeader>
          <CardContent className="h-96">
            {scatterLoading ? (
              <Skeleton className="w-full h-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                  <XAxis type="number" dataKey="da" name="Domain Authority" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis type="number" dataKey="rarityScore" name="Rarity Score" stroke="var(--muted-foreground)" fontSize={12} />
                  <ZAxis type="category" dataKey="name" name="Domain" />
                  <Tooltip 
                    cursor={{ strokeDasharray: '3 3' }}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                  />
                  <Scatter name="Domains" data={scatterData || []} fill="hsl(var(--primary))" opacity={0.6} />
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
