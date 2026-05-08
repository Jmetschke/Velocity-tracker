import { lazy, Suspense, type ComponentType } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import PageErrorBoundary from "./components/PageErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import SiteGate from "./components/SiteGate";
import { useSiteGate } from "./hooks/useSiteGate";
import { Loader2 } from "lucide-react";

// ─── Eager: Home is the landing page, always needed immediately ─────
import Home from "./pages/Home";

// ─── Lazy: secondary pages loaded on demand ─────────────────────────
const SkuManagement = lazy(() => import("./pages/SkuManagement"));
const UploadData = lazy(() => import("./pages/UploadData"));
const VelocityPar = lazy(() => import("./pages/VelocityPar"));
const ProductionCalendar = lazy(() => import("./pages/ProductionCalendar"));
const Categories = lazy(() => import("./pages/Categories"));
const CommittedBatches = lazy(() => import("./pages/CommittedBatches"));

// ─── Suspense fallback ──────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

/** Wrap a page component in Suspense + PageErrorBoundary. */
function guarded(Page: ComponentType, pageName: string) {
  return function GuardedPage() {
    return (
      <PageErrorBoundary pageName={pageName}>
        <Suspense fallback={<PageLoader />}>
          <Page />
        </Suspense>
      </PageErrorBoundary>
    );
  };
}

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={guarded(Home, "Dashboard")} />
        <Route path="/skus" component={guarded(SkuManagement, "SKU Management")} />
        <Route path="/upload" component={guarded(UploadData, "Upload Data")} />
        <Route path="/velocity" component={guarded(VelocityPar, "Velocity & Par")} />
        <Route path="/calendar" component={guarded(ProductionCalendar, "Production Calendar")} />
        <Route path="/categories" component={guarded(Categories, "Categories")} />
        <Route path="/committed" component={guarded(CommittedBatches, "Committed Batches")} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function AppWithGate() {
  const { loading, gated, authenticated, error, verify } = useSiteGate();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (gated && !authenticated) {
    return <SiteGate error={error} onSubmit={verify} />;
  }

  return <Router />;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <AppWithGate />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
