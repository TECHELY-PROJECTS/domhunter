import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Search, Activity, Briefcase, BarChart2, Star, Menu, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

interface LayoutProps {
  children: ReactNode;
  noPadding?: boolean;
}

export function Layout({ children, noPadding = false }: LayoutProps) {
  const [location] = useLocation();

  const navigation = [
    { name: "Terminal", href: "/terminal", icon: Activity },
    { name: "Explore", href: "/explore", icon: Search },
    { name: "Portfolio", href: "/portfolio", icon: Briefcase },
    { name: "Analytics", href: "/analytics", icon: BarChart2 },
    { name: "Brand Checker", href: "/brand-checker", icon: Shield },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row">
      <div className="hidden md:flex flex-col w-64 border-r border-border bg-card shrink-0">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <Star className="text-primary w-6 h-6" />
          <span className="font-bold text-xl tracking-tight uppercase">DomHunter</span>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navigation.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.name} href={item.href}>
                <div
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent/10 hover:text-accent"
                  }`}
                  data-testid={`nav-${item.name.toLowerCase().replace(" ", "-")}`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.name}
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Mobile Nav */}
      <div className="md:hidden border-b border-border bg-card p-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Star className="text-primary w-6 h-6" />
          <span className="font-bold text-lg tracking-tight uppercase">DomHunter</span>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <Star className="text-primary w-6 h-6" />
              <span className="font-bold text-xl tracking-tight uppercase">DomHunter</span>
            </div>
            <nav className="p-4 space-y-1">
              {navigation.map((item) => {
                const isActive = location === item.href;
                return (
                  <Link key={item.name} href={item.href}>
                    <div
                      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-accent/10 hover:text-accent"
                      }`}
                    >
                      <item.icon className="w-4 h-4" />
                      {item.name}
                    </div>
                  </Link>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>
      </div>

      <main className="flex-1 overflow-hidden flex flex-col">
        {noPadding ? (
          children
        ) : (
          <div className="flex-1 overflow-auto">
            <div className="container mx-auto p-4 md:p-8 max-w-7xl">
              {children}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
