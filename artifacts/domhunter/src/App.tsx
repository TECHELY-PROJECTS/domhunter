import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import Landing from "@/pages/landing";
import Home from "@/pages/home";
import Explore from "@/pages/explore";
import DomainDetail from "@/pages/domain-detail";
import Portfolio from "@/pages/portfolio";
import Analytics from "@/pages/analytics";
import BrandChecker from "@/pages/brand-checker";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/explore">
        <Layout noPadding>
          <Explore />
        </Layout>
      </Route>
      <Route>
        <Layout>
          <Switch>
            <Route path="/terminal" component={Home} />
            <Route path="/domain/:fqdn" component={DomainDetail} />
            <Route path="/portfolio" component={Portfolio} />
            <Route path="/analytics" component={Analytics} />
            <Route path="/brand-checker" component={BrandChecker} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
