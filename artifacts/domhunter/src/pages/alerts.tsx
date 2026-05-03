import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Bell, Trash2, Power, Loader2, Plus, Send, ExternalLink, CheckCircle2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type Alert = {
  id: string;
  name: string;
  telegramChatId: string;
  telegramBotToken: string;
  filterJson: string;
  active: boolean;
  lastSentAt: string | null;
  createdAt: string;
};

type AlertFilter = {
  minScore?: number;
  recommendation?: string;
  niche?: string;
  tier?: string;
  tlds?: string[];
};

const formSchema = z.object({
  name: z.string().min(1, "Name required").max(100),
  telegramChatId: z.string().min(1, "Chat ID required"),
  telegramBotToken: z.string().min(1, "Bot token required"),
  minScore: z.number().min(0).max(100),
  recommendation: z.string().optional(),
  tier: z.string().optional(),
});

const API_BASE = "/api";

async function fetchAlerts(): Promise<Alert[]> {
  const res = await fetch(`${API_BASE}/alerts`);
  if (!res.ok) throw new Error("Failed to fetch alerts");
  return res.json();
}

async function createAlert(data: {
  name: string;
  telegramChatId: string;
  telegramBotToken: string;
  filter: AlertFilter;
}): Promise<Alert> {
  const res = await fetch(`${API_BASE}/alerts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create alert");
  return res.json();
}

async function testTelegram(botToken: string, chatId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/alerts/test-telegram`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ botToken, chatId }),
  });
  return res.json();
}

async function toggleAlert(id: string, active: boolean): Promise<Alert> {
  const res = await fetch(`${API_BASE}/alerts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active }),
  });
  if (!res.ok) throw new Error("Failed to update alert");
  return res.json();
}

async function deleteAlert(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/alerts/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete alert");
}

const TIER_LABELS: Record<string, string> = {
  legendary: "🔥 Legendary",
  epic: "💎 Epic",
  rare: "⭐ Rare",
  uncommon: "✓ Uncommon",
};

function maskToken(token: string) {
  if (token.length < 10) return "••••••••";
  return token.slice(0, 6) + "••••••••" + token.slice(-4);
}

function AlertCard({ alert, onToggle, onDelete }: {
  alert: Alert;
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
}) {
  let filter: AlertFilter = {};
  try { filter = JSON.parse(alert.filterJson); } catch { /* ignore */ }

  const filterChips = [
    filter.minScore != null && `Score ≥ ${filter.minScore}`,
    filter.recommendation && filter.recommendation,
    filter.tier && TIER_LABELS[filter.tier],
    filter.tlds?.length && filter.tlds.join(", "),
  ].filter(Boolean);

  return (
    <Card className={`transition-all ${!alert.active ? "opacity-50" : ""}`}>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold truncate">{alert.name}</span>
              {alert.active ? (
                <span className="text-xs bg-green-900/40 text-green-400 border border-green-700/50 px-1.5 py-0.5 rounded">Active</span>
              ) : (
                <span className="text-xs bg-muted text-muted-foreground border border-border px-1.5 py-0.5 rounded">Paused</span>
              )}
            </div>

            <div className="flex items-center gap-1.5 mb-3">
              <Send className="w-3 h-3 text-blue-400 shrink-0" />
              <span className="text-xs text-muted-foreground font-mono">
                Chat: {alert.telegramChatId} · Token: {maskToken(alert.telegramBotToken)}
              </span>
            </div>

            {filterChips.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {filterChips.map((chip, i) => (
                  <span key={i} className="text-xs bg-muted border border-border px-2 py-0.5 rounded text-muted-foreground">
                    {chip}
                  </span>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground/60">
              {alert.lastSentAt
                ? `Last sent ${new Date(alert.lastSentAt).toLocaleDateString()}`
                : "Never sent"}
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onToggle(alert.id, !alert.active)}
              title={alert.active ? "Pause alert" : "Resume alert"}
              className={`p-2 rounded-md transition-colors ${alert.active ? "text-green-400 hover:bg-green-900/20" : "text-muted-foreground hover:bg-accent/10"}`}
            >
              <Power className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(alert.id)}
              title="Delete alert"
              className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Alerts() {
  const [showForm, setShowForm] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [testError, setTestError] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["alerts"],
    queryFn: fetchAlerts,
  });

  const createMut = useMutation({
    mutationFn: createAlert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      toast({ title: "Alert created", description: "You'll get a Telegram message when matching domains appear." });
      setShowForm(false);
      form.reset();
      setTestStatus("idle");
    },
    onError: () => toast({ title: "Failed to create alert", variant: "destructive" }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => toggleAlert(id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts"] }),
    onError: () => toast({ title: "Failed to update alert", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteAlert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      toast({ title: "Alert deleted" });
    },
    onError: () => toast({ title: "Failed to delete alert", variant: "destructive" }),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", telegramChatId: "", telegramBotToken: "", minScore: 60, recommendation: "", tier: "" },
  });

  const onTest = async () => {
    const botToken = form.getValues("telegramBotToken");
    const chatId = form.getValues("telegramChatId");
    if (!botToken || !chatId) {
      toast({ title: "Enter Bot Token and Chat ID first", variant: "destructive" });
      return;
    }
    setTestStatus("loading");
    setTestError("");
    const result = await testTelegram(botToken, chatId);
    if (result.ok) {
      setTestStatus("ok");
    } else {
      setTestStatus("error");
      setTestError(result.error ?? "Unknown error");
    }
  };

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    const filter: AlertFilter = { minScore: values.minScore };
    if (values.recommendation) filter.recommendation = values.recommendation;
    if (values.tier) filter.tier = values.tier;
    createMut.mutate({
      name: values.name,
      telegramChatId: values.telegramChatId,
      telegramBotToken: values.telegramBotToken,
      filter,
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Domain Alerts</h1>
          <p className="text-muted-foreground mt-1">
            Get instant Telegram messages when new domains match your filters.
          </p>
        </div>
        <Button onClick={() => { setShowForm((v) => !v); setTestStatus("idle"); }} className="gap-2">
          <Plus className="w-4 h-4" />
          {showForm ? "Cancel" : "New Alert"}
        </Button>
      </div>

      {/* Setup guide */}
      <div className="rounded-lg border border-blue-700/40 bg-blue-900/10 px-4 py-3 text-sm text-blue-300 space-y-1.5">
        <div className="flex items-center gap-2 font-semibold">
          <Send className="w-4 h-4 shrink-0" />
          How to set up Telegram alerts
        </div>
        <ol className="list-decimal list-inside space-y-1 text-blue-300/80 text-xs ml-1">
          <li>Message <span className="font-mono bg-blue-900/40 px-1 rounded">@BotFather</span> on Telegram → create a new bot → copy the <strong>Bot Token</strong></li>
          <li>Start a chat with your bot, then get your <strong>Chat ID</strong> by messaging <span className="font-mono bg-blue-900/40 px-1 rounded">@userinfobot</span></li>
          <li>Paste both below, test the connection, then save your alert</li>
        </ol>
        <a
          href="https://core.telegram.org/bots#how-do-i-create-a-bot"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 underline mt-1"
        >
          Telegram bot docs <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Create form */}
      {showForm && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Create New Alert</CardTitle>
            <CardDescription>Receive a Telegram message daily when new domains match these criteria.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Alert Name</FormLabel>
                    <FormControl><Input placeholder="e.g. High-score .com BUYs" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <Separator />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Telegram Setup</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField control={form.control} name="telegramBotToken" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bot Token</FormLabel>
                      <FormControl><Input placeholder="123456:ABC-DEF..." {...field} /></FormControl>
                      <FormDescription className="text-xs">From @BotFather</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="telegramChatId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Chat ID</FormLabel>
                      <FormControl><Input placeholder="-100123456789 or 123456789" {...field} /></FormControl>
                      <FormDescription className="text-xs">From @userinfobot</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="flex items-center gap-3">
                  <Button type="button" variant="outline" size="sm" className="gap-2" onClick={onTest} disabled={testStatus === "loading"}>
                    {testStatus === "loading" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Test Connection
                  </Button>
                  {testStatus === "ok" && (
                    <span className="flex items-center gap-1.5 text-sm text-green-400">
                      <CheckCircle2 className="w-4 h-4" /> Message sent! Check Telegram.
                    </span>
                  )}
                  {testStatus === "error" && (
                    <span className="flex items-center gap-1.5 text-sm text-red-400">
                      <XCircle className="w-4 h-4" /> {testError || "Connection failed"}
                    </span>
                  )}
                </div>

                <Separator />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Filters</p>

                <FormField control={form.control} name="minScore" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Minimum Rarity Score — <span className="text-primary font-mono">{field.value}</span></FormLabel>
                    <FormControl>
                      <Slider
                        min={0} max={100} step={5}
                        value={[field.value]}
                        onValueChange={([v]) => field.onChange(v)}
                        className="mt-2"
                      />
                    </FormControl>
                  </FormItem>
                )} />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField control={form.control} name="recommendation" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Signal</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Any signal" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="">Any signal</SelectItem>
                          <SelectItem value="BUY">BUY only</SelectItem>
                          <SelectItem value="WATCH">WATCH only</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="tier" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Minimum Tier</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Any tier" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="">Any tier</SelectItem>
                          <SelectItem value="legendary">🔥 Legendary</SelectItem>
                          <SelectItem value="epic">💎 Epic</SelectItem>
                          <SelectItem value="rare">⭐ Rare</SelectItem>
                          <SelectItem value="uncommon">✓ Uncommon</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                </div>

                <Button type="submit" className="w-full gap-2" disabled={createMut.isPending}>
                  {createMut.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : <><Bell className="w-4 h-4" /> Create Alert</>}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {/* Alert list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-5 space-y-2">
                <div className="h-5 bg-muted rounded w-40" />
                <div className="h-3 bg-muted rounded w-56" />
                <div className="flex gap-1.5 mt-3">
                  <div className="h-5 bg-muted rounded w-20" />
                  <div className="h-5 bg-muted rounded w-16" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : alerts.length === 0 && !showForm ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl bg-card/30">
          <Send className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium mb-1">No alerts yet</p>
          <p className="text-muted-foreground/60 text-sm mb-5">Create an alert to get instant Telegram messages for matching domains.</p>
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Create Your First Alert
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onToggle={(id, active) => toggleMut.mutate({ id, active })}
              onDelete={(id) => deleteMut.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
