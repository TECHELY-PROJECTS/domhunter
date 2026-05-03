import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCheckBrand } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sparkles, Loader2, Search, Layers } from "lucide-react";
import { Link } from "wouter";

const formSchema = z.object({
  domain: z.string().min(3, "Domain name is required").regex(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, "Must be a valid domain name"),
  context: z.string().optional(),
});

const REC_STYLES: Record<string, string> = {
  BUY:   "bg-green-500/20 text-green-400 border border-green-500/40",
  WATCH: "bg-amber-500/20 text-amber-400 border border-amber-500/40",
  SKIP:  "bg-red-500/20 text-red-400 border border-red-500/40",
};

const REC_CARD_BORDER: Record<string, string> = {
  BUY:   "border-green-700/50 bg-green-900/10",
  WATCH: "border-yellow-700/40 bg-yellow-900/5",
  SKIP:  "",
};

const TIER_LABELS: Record<string, string> = {
  legendary: "🔥 Legendary",
  epic:      "💎 Epic",
  rare:      "⭐ Rare",
  uncommon:  "✓ Uncommon",
  common:    "· Common",
};

const TIER_COLORS: Record<string, string> = {
  legendary: "text-yellow-400",
  epic:      "text-purple-400",
  rare:      "text-blue-400",
  uncommon:  "text-green-400",
  common:    "text-muted-foreground",
};

function generateVariations(keyword: string): string[] {
  const k = keyword.toLowerCase().replace(/[^a-z0-9]/g, "");
  const prefixes = ["get", "try", "use", "go", "my"];
  const suffixes = ["hub", "io", "app", "ai", "hq", "ify", "lab", "pro"];
  const tlds = [".com", ".io", ".ai", ".co"];
  const names: string[] = [k];
  prefixes.slice(0, 3).forEach((p) => names.push(`${p}${k}`));
  suffixes.slice(0, 4).forEach((s) => names.push(`${k}${s}`));
  const domains: string[] = [];
  names.forEach((n) => tlds.forEach((t) => domains.push(`${n}${t}`)));
  return [...new Set(domains)].slice(0, 12);
}

function MiniBar({ value, color }: { value?: number | null; color: string }) {
  const pct = Math.min(100, Math.max(0, value ?? 0));
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs w-8 text-right text-muted-foreground">
        {value != null ? Math.round(value) : "—"}
      </span>
    </div>
  );
}

type BulkResult = {
  domain: { name: string; sld: string; tld: string };
  metrics: {
    rarityScore?: number | null;
    rarityTier?: string | null;
    brandScore?: number | null;
    pronounceScore?: number | null;
    estimatedValue?: number | null;
    recommendation?: string | null;
    aiReason?: string | null;
    targetBuyer?: string | null;
  };
};

export default function BrandChecker() {
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [bulkInput, setBulkInput] = useState("");
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { domain: "", context: "" },
  });

  const checkBrand = useCheckBrand();
  const onSubmit = (values: z.infer<typeof formSchema>) => {
    checkBrand.mutate({ data: values });
  };

  const runBulk = async () => {
    const keyword = bulkInput.trim();
    if (!keyword) return;
    setBulkLoading(true);
    setBulkResults([]);
    try {
      const variations = generateVariations(keyword.toLowerCase().split(".")[0]);
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domains: variations }),
      });
      const data = await res.json();
      const sorted = (data.results || []).sort(
        (a: BulkResult, b: BulkResult) =>
          (b.metrics?.rarityScore ?? 0) - (a.metrics?.rarityScore ?? 0),
      );
      setBulkResults(sorted);
    } finally {
      setBulkLoading(false);
    }
  };

  const result = checkBrand.data as (typeof checkBrand.data & {
    targetBuyer?: string | null;
    aiPowered?: boolean;
    rarityTier?: string;
    rarityScore?: number;
  }) | undefined;

  const formatValue = (v?: number | null) => {
    if (!v) return null;
    return v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${v}`;
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI Brand Checker</h1>
        <p className="text-muted-foreground mt-1">
          Analyze any domain or generate keyword variations — get instant AI brandability scores and investment signals.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        <button
          onClick={() => setMode("single")}
          className={`flex items-center gap-2 px-4 py-2 text-sm rounded-md font-medium transition-all ${
            mode === "single"
              ? "bg-card shadow text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          Single Domain
        </button>
        <button
          onClick={() => setMode("bulk")}
          className={`flex items-center gap-2 px-4 py-2 text-sm rounded-md font-medium transition-all ${
            mode === "bulk"
              ? "bg-card shadow text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Keyword → Variations
        </button>
      </div>

      {/* ── SINGLE DOMAIN MODE ── */}
      {mode === "single" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Deep Brand Analysis</CardTitle>
              <CardDescription>Enter a domain and optional business context for full AI analysis.</CardDescription>
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
                        <FormLabel>
                          Business Context{" "}
                          <span className="text-muted-foreground font-normal">(Optional)</span>
                        </FormLabel>
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
                  <div className="space-y-2">
                    {[
                      { label: "Brand", value: result.brandScore, color: "bg-purple-500" },
                      { label: "Pronounce", value: result.pronounceScore, color: "bg-blue-500" },
                      { label: "Memory", value: result.memorability, color: "bg-green-500" },
                      ...(result.rarityScore != null ? [{ label: "Rarity", value: result.rarityScore, color: "bg-orange-500" }] : []),
                    ].map(({ label, value, color }) => (
                      <div key={label} className="flex items-center gap-3 text-xs">
                        <span className="w-20 text-muted-foreground shrink-0">{label}</span>
                        <div className="flex-1"><MiniBar value={value} color={color} /></div>
                      </div>
                    ))}
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
                        <li className="text-xs text-muted-foreground">No significant weaknesses.</li>
                      )}
                    </ul>
                  </div>
                </div>

                <Separator className="bg-primary/10" />

                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Est. Market Value</span>
                  <span className="font-mono font-bold text-primary">${result.estimatedValue.toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="h-full flex items-center justify-center p-8 border border-dashed border-border rounded-xl bg-card/30 min-h-[300px]">
              <div className="text-center space-y-2">
                <Sparkles className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                <p className="text-muted-foreground text-sm">Enter a domain to see its brand potential analysis.</p>
                <p className="text-muted-foreground/60 text-xs">Powered by AI — scores brandability, memorability, and market value.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── BULK KEYWORD MODE ── */}
      {mode === "bulk" && (
        <div className="space-y-6">
          <div className="flex gap-2">
            <Input
              className="h-12 text-base font-mono bg-card"
              placeholder="Enter a keyword, e.g. relay, fintech, aiflow..."
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !bulkLoading && runBulk()}
            />
            <Button
              className="h-12 px-6 text-base gap-2 shrink-0"
              onClick={runBulk}
              disabled={bulkLoading || !bulkInput.trim()}
            >
              {bulkLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Scoring...</>
              ) : (
                <><Layers className="w-4 h-4" /> Generate Ideas</>
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground -mt-4">
            Generates 12 domain variations and AI-scores all of them simultaneously.
          </p>

          {bulkLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array(6).fill(0).map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="pt-5 space-y-3">
                    <div className="h-5 bg-muted rounded w-40" />
                    <div className="h-3 bg-muted rounded w-24" />
                    <div className="space-y-2 mt-4">
                      <div className="h-2 bg-muted rounded" />
                      <div className="h-2 bg-muted rounded" />
                      <div className="h-2 bg-muted rounded" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!bulkLoading && bulkResults.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {bulkResults.map((r, i) => {
                const m = r.metrics;
                const rec = m.recommendation ?? "";
                return (
                  <Card
                    key={i}
                    className={`transition-all ${REC_CARD_BORDER[rec] ?? ""}`}
                  >
                    <CardContent className="pt-5">
                      {/* Domain name + signal */}
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="font-mono font-bold text-lg text-foreground">
                            {r.domain.name}
                          </div>
                          <div className="flex gap-1.5 mt-1 flex-wrap">
                            {m.rarityTier && (
                              <span className={`text-xs font-medium ${TIER_COLORS[m.rarityTier] ?? "text-muted-foreground"}`}>
                                {TIER_LABELS[m.rarityTier] ?? m.rarityTier}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {rec && (
                            <span className={`text-sm font-bold px-2.5 py-1 rounded ${REC_STYLES[rec] ?? ""}`}>
                              {rec}
                            </span>
                          )}
                          {formatValue(m.estimatedValue) && (
                            <div className="text-sm font-bold text-foreground mt-1.5 font-mono">
                              {formatValue(m.estimatedValue)}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Score bars */}
                      <div className="space-y-2 mb-3">
                        <div className="flex items-center gap-3 text-xs">
                          <span className="w-16 text-muted-foreground shrink-0">Rarity</span>
                          <div className="flex-1"><MiniBar value={m.rarityScore} color="bg-blue-500" /></div>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="w-16 text-muted-foreground shrink-0">Brand</span>
                          <div className="flex-1"><MiniBar value={m.brandScore} color="bg-purple-500" /></div>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="w-16 text-muted-foreground shrink-0">Pronounce</span>
                          <div className="flex-1"><MiniBar value={m.pronounceScore} color="bg-green-500" /></div>
                        </div>
                      </div>

                      {/* AI reason */}
                      {m.aiReason && (
                        <p className="text-xs text-muted-foreground italic mb-3 leading-relaxed">
                          "{m.aiReason}"
                        </p>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2">
                        <Link
                          href={`/domain/${r.domain.name}`}
                          className="flex-1 text-center text-xs py-1.5 bg-muted hover:bg-muted/70 rounded text-foreground transition-colors"
                        >
                          Full Analysis
                        </Link>
                        <a
                          href={`https://www.godaddy.com/domainsearch/find?checkAvail=1&domainToCheck=${r.domain.name}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 text-center text-xs py-1.5 bg-primary hover:bg-primary/80 rounded text-primary-foreground transition-colors"
                        >
                          Register →
                        </a>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {!bulkLoading && bulkResults.length === 0 && bulkInput && (
            <div className="text-center py-12 text-muted-foreground">
              <Layers className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Enter a keyword above to generate domain ideas.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
