import { Suspense, type ComponentType } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import PageErrorBoundary from "./components/PageErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import { Loader2 } from "lucide-react";
import { lazyWithReload } from "./lib/lazyWithReload";

// ─── Eager: Home is the landing page, always needed immediately ─────
import Home from "./pages/Home";
import SkuManagement from "./pages/SkuManagement";

// ─── Lazy: secondary pages loaded on demand ─────────────────────────
const UploadData = lazyWithReload(() => import("./pages/UploadData"));
const VelocityPar = lazyWithReload(() => import("./pages/VelocityPar"));
const ProductionCalendar = lazyWithReload(() => import("./pages/ProductionCalendar"));
const ProjectedUnits = lazyWithReload(() => import("./pages/ProjectedUnits"));
const Categories = lazyWithReload(() => import("./pages/Categories"));
const CommittedBatches = lazyWithReload(() => import("./pages/CommittedBatches"));
const ProductLaunchRoadmap = lazyWithReload(() => import("./pages/ProductLaunchRoadmap"));

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
        <Route path="/skus" component={guarded(SkuManagement, "Production Items")} />
        <Route path="/upload" component={guarded(UploadData, "Upload Data")} />
        <Route path="/velocity" component={guarded(VelocityPar, "Velocity & Par")} />
        <Route path="/calendar" component={guarded(ProductionCalendar, "Production Calendar")} />
        <Route path="/projected-units" component={guarded(ProjectedUnits, "Projected Units")} />
        <Route path="/categories" component={guarded(Categories, "Categories")} />
        <Route path="/committed" component={guarded(CommittedBatches, "Committed Batches")} />
        <Route path="/product-launch-roadmap" component={guarded(ProductLaunchRoadmap, "Product Launch Roadmap")} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
