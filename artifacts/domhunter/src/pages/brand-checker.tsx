import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCheckBrand } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sparkles, Loader2 } from "lucide-react";

const formSchema = z.object({
  domain: z.string().min(3, "Domain name is required").regex(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, "Must be a valid domain name"),
  context: z.string().optional(),
});

const REC_STYLES: Record<string, string> = {
  BUY: "bg-green-500/20 text-green-400 border border-green-500/40",
  WATCH: "bg-amber-500/20 text-amber-400 border border-amber-500/40",
  SKIP: "bg-red-500/20 text-red-400 border border-red-500/40",
};

const TIER_COLORS: Record<string, string> = {
  legendary: "text-yellow-400",
  epic: "text-purple-400",
  rare: "text-blue-400",
  uncommon: "text-green-400",
  common: "text-muted-foreground",
};

function MiniBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  const color = pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-primary" : pct >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs w-8 text-right">{Math.round(pct)}</span>
    </div>
  );
}

export default function BrandChecker() {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { domain: "", context: "" },
  });

  const checkBrand = useCheckBrand();
  const onSubmit = (values: z.infer<typeof formSchema>) => {
    checkBrand.mutate({ data: values });
  };

  const result = checkBrand.data as (typeof checkBrand.data & {
    targetBuyer?: string | null;
    aiPowered?: boolean;
    rarityTier?: string;
    rarityScore?: number;
  }) | undefined;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI Brand Checker</h1>
        <p className="text-muted-foreground mt-1">
          Analyze the branding potential of any domain name using Gemini AI.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Analysis Request</CardTitle>
            <CardDescription>Enter a domain and optional business context.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="domain"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Domain Name</FormLabel>
                      <FormControl>
                        <Input placeholder="example.com" {...field} className="font-mono" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="context"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business Context <span className="text-muted-foreground font-normal">(Optional — improves AI accuracy)</span></FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="e.g. A B2B SaaS platform for real estate agents..."
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full gap-2" disabled={checkBrand.isPending}>
                  {checkBrand.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing with AI...</>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> Run Analysis</>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {result ? (
          <Card className="bg-primary/5 border-primary/20 animate-in fade-in zoom-in-95 duration-300">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <CardTitle className="text-xl font-mono truncate">{result.domain}</CardTitle>
                    {result.aiPowered && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 border border-primary/30 rounded px-1.5 py-0.5">
                        <Sparkles className="w-2.5 h-2.5" /> AI
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {result.recommendation && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${REC_STYLES[result.recommendation] ?? ""}`}>
                        {result.recommendation}
                      </span>
                    )}
                    {result.rarityTier && (
                      <span className={`text-xs font-semibold uppercase tracking-widest ${TIER_COLORS[result.rarityTier] ?? ""}`}>
                        {result.rarityTier}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground capitalize">{result.niche}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-3xl font-bold text-primary font-mono">{Math.round(result.brandScore)}</span>
                  <span className="text-xs text-muted-foreground block">Brand Score</span>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-5">
              <p className="text-sm leading-relaxed text-balance">{result.reasoning}</p>

              {result.targetBuyer && (
                <div className="rounded-lg bg-card border border-border px-3 py-2 text-sm">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Ideal Buyer — </span>
                  <span className="font-medium">{result.targetBuyer}</span>
                </div>
              )}

              <Separator className="bg-primary/10" />

              <div className="space-y-2.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Score Breakdown</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="w-20 text-muted-foreground">Brand</span>
                    <div className="flex-1"><MiniBar value={result.brandScore} /></div>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="w-20 text-muted-foreground">Pronounce</span>
                    <div className="flex-1"><MiniBar value={result.pronounceScore} /></div>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="w-20 text-muted-foreground">Memory</span>
                    <div className="flex-1"><MiniBar value={result.memorability} /></div>
                  </div>
                  {result.rarityScore != null && (
                    <div className="flex items-center gap-3 text-xs">
                      <span className="w-20 text-muted-foreground">Rarity</span>
                      <div className="flex-1"><MiniBar value={result.rarityScore} /></div>
                    </div>
                  )}
                </div>
              </div>

              <Separator className="bg-primary/10" />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Strengths</p>
                  <ul className="space-y-1.5">
                    {result.strengths.map((s, i) => (
                      <li key={i} className="text-xs flex items-start gap-1.5">
                        <span className="text-green-500 mt-0.5 shrink-0">+</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Weaknesses</p>
                  <ul className="space-y-1.5">
                    {result.weaknesses.length > 0 ? result.weaknesses.map((w, i) => (
                      <li key={i} className="text-xs flex items-start gap-1.5">
                        <span className="text-destructive mt-0.5 shrink-0">−</span>
                        <span>{w}</span>
                      </li>
                    )) : (
                      <li className="text-xs text-muted-foreground">No significant weaknesses found.</li>
                    )}
                  </ul>
                </div>
              </div>

              <Separator className="bg-primary/10" />

              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Est. Market Value</span>
                <span className="font-mono font-bold text-primary">
                  ${result.estimatedValue.toLocaleString()}
                </span>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="h-full flex items-center justify-center p-8 border border-dashed border-border rounded-xl bg-card/30 min-h-[300px]">
            <div className="text-center space-y-2">
              <Sparkles className="w-8 h-8 text-muted-foreground/40 mx-auto" />
              <p className="text-muted-foreground text-sm">
                Enter a domain to see its comprehensive brand potential analysis.
              </p>
              <p className="text-muted-foreground/60 text-xs">
                Powered by Gemini AI — no API key required
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
