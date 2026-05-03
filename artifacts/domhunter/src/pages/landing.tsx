import { Link } from "wouter";
import { useGetDomainStats, useGetTopScoringDomains } from "@workspace/api-client-react";
import { ArrowRight, Bot, Clock, Bell, Search, BarChart2, Bookmark, Star } from "lucide-react";

const REC_STYLES: Record<string, string> = {
  BUY:   "bg-green-900/60 text-green-300 border border-green-700",
  WATCH: "bg-yellow-900/60 text-yellow-300 border border-yellow-700",
  SKIP:  "bg-muted text-muted-foreground border border-border",
};

const FEATURES = [
  { icon: Bot,      title: "AI Scoring",       desc: "Every domain scored for brandability, niche fit, and estimated USD value using AI." },
  { icon: Clock,    title: "Live Auction Feed", desc: "GoDaddy, NameJet, expireddomains.net — updated every 6 hours automatically." },
  { icon: Bell,     title: "Smart Watchlist",   desc: "Save domains you're considering. Track value changes and auction deadlines over time." },
  { icon: Search,   title: "Brand Checker",     desc: "Type any keyword, get 12 domain variations scored and analyzed instantly." },
  { icon: BarChart2,"title": "Free Metrics",    desc: "Domain authority, backlinks, age, WHOIS history — all free APIs, no paid tools needed." },
  { icon: Bookmark, title: "Portfolio Tracker", desc: "Monitor your entire domain portfolio. Know which ones to hold, sell, or drop." },
];

function formatValue(v?: number | null) {
  if (!v) return "—";
  return v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${v}`;
}

export default function Landing() {
  const { data: stats } = useGetDomainStats();
  const { data: topDomains } = useGetTopScoringDomains({ limit: 5 });

  const buySignalDomains = topDomains?.filter(
    (d) => d.metrics?.recommendation === "BUY",
  ) ?? [];
  const displayDomains = buySignalDomains.length > 0 ? buySignalDomains : (topDomains ?? []);

  const statItems = [
    { value: stats?.totalDomains?.toLocaleString() ?? "—", label: "Domains Tracked" },
    { value: stats?.totalAuctions?.toLocaleString() ?? "—", label: "Active Auctions" },
    { value: stats?.avgRarityScore ? Math.round(stats.avgRarityScore).toString() : "—", label: "Avg Rarity Score" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">

      {/* ── Navbar ── */}
      <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Star className="text-primary w-5 h-5" />
            <span className="font-bold text-lg tracking-tight uppercase">DomHunter</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/explore" className="hover:text-foreground transition-colors">Explore</Link>
            <Link href="/brand-checker" className="hover:text-foreground transition-colors">Brand Checker</Link>
            <Link href="/portfolio" className="hover:text-foreground transition-colors">Watchlist</Link>
          </nav>
          <Link href="/terminal">
            <button className="text-sm font-medium px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 transition-colors">
              Open App →
            </button>
          </Link>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0f1b2d] via-[#0d2040] to-[#0a1628] text-white py-24 px-4">
        {/* Ambient glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-primary/10 rounded-full blur-[100px]" />
        </div>

        <div className="max-w-4xl mx-auto text-center relative">
          <div className="inline-flex items-center gap-1.5 bg-primary/10 border border-primary/25 text-primary text-xs px-3 py-1 rounded-full mb-7 font-medium">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            AI-powered · Updated every 6 hours · Free to explore
          </div>

          <h1 className="text-5xl md:text-6xl font-extrabold mb-5 leading-[1.1] tracking-tight">
            Find Valuable Expiring Domains
            <br />
            <span className="text-primary">Before Anyone Else Does</span>
          </h1>

          <p className="text-lg md:text-xl text-slate-300 mb-10 max-w-2xl mx-auto leading-relaxed">
            DomHunter scans 200,000+ expiring domains daily, scores them for brandability and investment potential with AI, and surfaces the best opportunities instantly.
          </p>

          <div className="flex gap-3 justify-center flex-wrap">
            <Link href="/explore">
              <button className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-bold px-8 py-3 rounded-xl hover:bg-primary/80 transition-colors text-base shadow-lg shadow-primary/20">
                Browse Domains <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
            <Link href="/brand-checker">
              <button className="inline-flex items-center gap-2 border border-white/20 bg-white/5 backdrop-blur text-white font-medium px-8 py-3 rounded-xl hover:bg-white/10 transition-colors text-base">
                Check Any Domain
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section className="border-b border-border bg-card py-8 px-4">
        <div className="max-w-4xl mx-auto grid grid-cols-3 gap-6 text-center">
          {statItems.map((s) => (
            <div key={s.label}>
              <div className="text-3xl font-bold text-primary font-mono">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Top BUY signals table ── */}
      {displayDomains.length > 0 && (
        <section className="py-14 px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold mb-1">Today's Top Opportunities</h2>
            <p className="text-muted-foreground mb-6 text-sm">
              Highest-scoring expiring domains — live from the pipeline
            </p>
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium uppercase tracking-wider">Domain</th>
                    <th className="text-center px-4 py-3 text-xs text-muted-foreground font-medium uppercase tracking-wider">Score</th>
                    <th className="text-center px-4 py-3 text-xs text-muted-foreground font-medium uppercase tracking-wider">Brand</th>
                    <th className="text-center px-4 py-3 text-xs text-muted-foreground font-medium uppercase tracking-wider">Est. Value</th>
                    <th className="text-center px-4 py-3 text-xs text-muted-foreground font-medium uppercase tracking-wider">Signal</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {displayDomains.map((d, i) => (
                    <tr key={d.id} className={`${i > 0 ? "border-t border-border" : ""} hover:bg-accent/5 transition-colors`}>
                      <td className="px-4 py-3 font-mono font-semibold text-primary">{d.name}</td>
                      <td className="px-4 py-3 text-center font-bold">
                        {d.metrics?.rarityScore != null ? Math.round(d.metrics.rarityScore) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {d.metrics?.brandScore != null ? Math.round(d.metrics.brandScore) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold">
                        {formatValue(d.metrics?.estimatedValue)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {d.metrics?.recommendation ? (
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${REC_STYLES[d.metrics.recommendation] ?? ""}`}>
                            {d.metrics.recommendation}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/domain/${d.name}`} className="text-xs text-primary hover:underline font-medium">
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-center mt-5">
              <Link href="/explore" className="text-sm font-medium text-primary hover:underline">
                See all domains →
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── Feature grid ── */}
      <section className="py-14 px-4 bg-card border-t border-border">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-2">Everything in one place</h2>
          <p className="text-center text-muted-foreground text-sm mb-10">
            No subscription needed. All free signals, all in one dashboard.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-background rounded-xl p-5 border border-border hover:border-primary/40 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <h3 className="font-semibold mb-1.5">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-16 px-4 bg-gradient-to-br from-[#0f1b2d] to-[#0a1628] text-white text-center">
        <h2 className="text-3xl font-bold mb-3">Ready to find your next domain?</h2>
        <p className="text-slate-400 mb-8 text-base max-w-xl mx-auto">
          Browse thousands of AI-scored expiring domains. No signup required.
        </p>
        <Link href="/explore">
          <button className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-bold px-10 py-3.5 rounded-xl hover:bg-primary/80 transition-colors text-base shadow-lg shadow-primary/20">
            Start Exploring <ArrowRight className="w-4 h-4" />
          </button>
        </Link>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border bg-card py-6 px-4">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-primary" />
            <span className="font-bold uppercase tracking-tight text-foreground">DomHunter</span>
            <span>— AI domain investment research</span>
          </div>
          <div className="flex gap-5">
            <Link href="/explore" className="hover:text-foreground transition-colors">Explore</Link>
            <Link href="/brand-checker" className="hover:text-foreground transition-colors">Brand Checker</Link>
            <Link href="/terminal" className="hover:text-foreground transition-colors">Dashboard</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
