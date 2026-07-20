import type { ComponentType } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import PageErrorBoundary from "./components/PageErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";

// Keep routes in the main bundle. Installed desktop PWAs can remain open
// across deployments, while hashed lazy chunks are replaced on the server.
import Home from "./pages/Home";
import SkuManagement from "./pages/SkuManagement";
import UploadData from "./pages/UploadData";
import VelocityPar from "./pages/VelocityPar";
import ProductionCalendar from "./pages/ProductionCalendar";
import ProjectedUnits from "./pages/ProjectedUnits";
import Categories from "./pages/Categories";
import CommittedBatches from "./pages/CommittedBatches";
import ProductLaunchRoadmap from "./pages/ProductLaunchRoadmap";

/** Keep rendering failures isolated to the active page. */
function guarded(Page: ComponentType, pageName: string) {
  return function GuardedPage() {
    return (
      <PageErrorBoundary pageName={pageName}>
        <Page />
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
