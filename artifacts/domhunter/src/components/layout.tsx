import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Search, Activity, Briefcase, BarChart2, Shield, Star, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

interface LayoutProps {
  children: ReactNode;
  noPadding?: boolean;
}

export function Layout({ children, noPadding = false }: LayoutProps) {
  const [location] = useLocation();

  const navigation = [
    { name: "Terminal",      href: "/terminal",     icon: Activity },
    { name: "Explore",       href: "/explore",      icon: Search },
    { name: "Portfolio",     href: "/portfolio",    icon: Briefcase },
    { name: "Analytics",     href: "/analytics",    icon: BarChart2 },
    { name: "Brand Checker", href: "/brand-checker",icon: Shield },
  ];

  const NavLinks = ({ onClick }: { onClick?: () => void }) => (
    <>
      {navigation.map((item) => {
        const isActive =
          item.href === "/terminal"
            ? location === "/terminal"
            : location.startsWith(item.href);
        return (
          <Link key={item.name} href={item.href} onClick={onClick}>
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/10"
              }`}
              data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <item.icon className="w-3.5 h-3.5" />
              {item.name}
            </div>
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">

      {/* ── Top Navbar ── */}
      <header className="sticky top-0 z-40 bg-card border-b border-border shrink-0">
        <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center justify-between gap-4">

          {/* Logo */}
          <Link href="/">
            <div className="flex items-center gap-2 shrink-0 cursor-pointer">
              <Star className="text-primary w-5 h-5" />
              <span className="font-bold text-base tracking-tight uppercase">DomHunter</span>
            </div>
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-1 flex-1 pl-4">
            <NavLinks />
          </nav>

          {/* Mobile hamburger */}
          <div className="md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0 bg-card border-border">
                <div className="p-4 border-b border-border flex items-center gap-2">
                  <Star className="text-primary w-5 h-5" />
                  <span className="font-bold text-base tracking-tight uppercase">DomHunter</span>
                </div>
                <nav className="p-4 flex flex-col gap-1">
                  <NavLinks />
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* ── Page content ── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {noPadding ? (
          children
        ) : (
          <div className="flex-1 overflow-auto">
            <div className="max-w-screen-xl mx-auto px-4 md:px-8 py-6 md:py-8">
              {children}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
