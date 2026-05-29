import { useState, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  CheckCircle,
  Package,
  TrendingUp,
  Calendar,
  ArrowRight,
  Loader2,
  XCircle,
  Clock,
  Timer,
  Bell,
  FlaskConical,
  Download,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLocation } from "wouter";
import { exportProductionNeedsPdf } from "@/lib/exportProductionPdf";
import { endOfMonth, format, formatDistanceToNow, startOfMonth } from "date-fns";
import type { AppRouter } from "../../../server/routers";
import type { inferRouterOutputs } from "@trpc/server";

type Suggestion = inferRouterOutputs<AppRouter>["production"]["suggestions"]["suggestions"][number];
import { toast } from "sonner";
import { StockoutTimeline } from "@/components/StockoutTimeline";
import { WhatIfPanel, type WhatIfSku } from "@/components/WhatIfPanel";

// ─── Data Freshness Indicator ─────────────────────────────────────

function freshnessColor(daysAgo: number) {
  if (daysAgo <= 1) return { bg: "bg-primary/10", text: "text-primary", dot: "bg-primary" };
  if (daysAgo <= 3) return { bg: "bg-blue-50", text: "text-blue-600", dot: "bg-blue-500" };
  if (daysAgo <= 7) return { bg: "bg-yellow-50", text: "text-yellow-700", dot: "bg-yellow-500" };
  return { bg: "bg-red-50", text: "text-red-600", dot: "bg-red-500" };
}

function DataFreshness({
  latestSnapshot,
  latestSalesUpload,
  onNavigate,
}: {
  latestSnapshot: { snapshotDate: Date | number; fileName: string | null } | null;
  latestSalesUpload: { createdAt: Date | number; fileName: string | null } | null;
  onNavigate: (path: string) => void;
}) {
  const items = [
    { label: "Inventory", date: latestSnapshot ? new Date(latestSnapshot.snapshotDate) : null, source: latestSnapshot?.fileName ?? null },
    { label: "Sales Velocity", date: latestSalesUpload ? new Date(latestSalesUpload.createdAt) : null, source: latestSalesUpload?.fileName ?? null },
  ];

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="View data freshness — click to upload new data"
      className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 rounded-lg border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => onNavigate("/upload")}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate('/upload'); } }}
    >
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Data Freshness</span>
      <span className="hidden sm:block h-4 w-px bg-border" />
      <div className="flex flex-wrap items-center gap-2">
        {items.map(({ label, date, source }) => {
          if (!date) {
            return (
              <span key={label} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                {label}: <span className="italic">No data</span>
              </span>
            );
          }
          const daysAgo = Math.floor((Date.now() - date.getTime()) / 86_400_000);
          const colors = freshnessColor(daysAgo);
          const isMetrc = source?.startsWith("[METRC]");
          const isQB = source?.startsWith("[QB]") || source?.toLowerCase().includes("quickbooks");
          const sourceTag = isMetrc ? "METRC" : isQB ? "QB" : null;

          return (
            <Tooltip key={label}>
              <TooltipTrigger asChild>
                <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                  <span className={`h-2 w-2 rounded-full ${colors.dot}`} />
                  {label}: {formatDistanceToNow(date, { addSuffix: true })}
                  {sourceTag && <span className="opacity-60">({sourceTag})</span>}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">
                  {format(date, "MMM d, yyyy h:mm a")}
                  {source && <span className="block text-muted-foreground mt-0.5">{source}</span>}
                  {daysAgo > 7 && <span className="block text-red-500 font-medium mt-1">Data is over a week old — consider re-uploading</span>}
                </p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

// ─── Urgency Badge ──────────────────────────────────────────────────

function UrgencyBadge({ urgency }: { urgency: string }) {
  if (urgency === "critical") return <Badge variant="destructive" className="text-xs">Critical</Badge>;
  if (urgency === "warning") return <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-700 bg-yellow-50">Below Par</Badge>;
  return <Badge variant="outline" className="text-xs border-primary/50 text-primary">OK</Badge>;
}

// ─── Summary Card ───────────────────────────────────────────────────

function SummaryCard({ icon, label, value, loading, className }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  loading: boolean;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">
          {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : value}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Mobile SKU Card (used instead of table row on small screens) ───

function SkuMobileCard({ s }: { s: Suggestion }) {
  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-foreground text-sm truncate flex-1 mr-2">{s.skuName}</span>
        <UrgencyBadge urgency={s.urgency} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground block">Available</span>
          <span className="tabular-nums font-medium">{s.currentStock.toLocaleString()}</span>
        </div>
        <div>
          <span className="text-muted-foreground block">In Testing</span>
          <span className="tabular-nums text-muted-foreground">{s.wipStock > 0 ? s.wipStock.toLocaleString() : "--"}</span>
        </div>
        <div>
          <span className="text-muted-foreground block">Projected</span>
          <span className="tabular-nums font-medium">{s.projectedStock.toLocaleString()}</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground block">Par Level</span>
          <span className="tabular-nums">{s.parLevel.toLocaleString()}</span>
        </div>
        <div>
          <span className="text-muted-foreground block">Velocity/Day</span>
          <span className="tabular-nums">{s.dailyVelocity.toFixed(1)}</span>
        </div>
        <div>
          <span className="text-muted-foreground block">Stockout</span>
          {s.daysUntilStockout === Infinity ? (
            <span className="text-muted-foreground">--</span>
          ) : (
            <span className={`tabular-nums font-semibold ${
              s.daysUntilStockout <= 5 ? "text-destructive" :
              s.daysUntilStockout <= 14 ? "text-yellow-700" :
              "text-primary"
            }`}>
              {s.daysUntilStockout}d
            </span>
          )}
        </div>
      </div>
      {(s.committedQuantity > 0 || s.batchesNeeded > 0) && (
        <div className="flex items-center justify-between text-xs pt-1 border-t">
          <span className="text-muted-foreground">
            {s.committedQuantity > 0 && (
              <span className="text-blue-600 font-medium mr-3">Committed: {s.committedQuantity.toLocaleString()}</span>
            )}
            {s.batchesNeeded > 0 && (
              <span>Batches: <span className="font-medium text-foreground">{s.batchesNeeded}</span></span>
            )}
          </span>
          {s.batchesNeeded > 0 && (
            <span className="text-muted-foreground">
              Start {format(new Date(s.suggestedStartDate), "MMM d")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────

export default function Home() {
  const [, setLocation] = useLocation();
  const [showWhatIf, setShowWhatIf] = useState(false);
  const calendarRange = useMemo(() => {
    const today = new Date();
    return {
      startDate: format(startOfMonth(today), "yyyy-MM-dd"),
      endDate: format(endOfMonth(today), "yyyy-MM-dd"),
    };
  }, []);

  const { data: suggestions, isLoading: loadingSuggestions } = trpc.production.suggestions.useQuery();
  const { data: inventory, isLoading: loadingInventory } = trpc.inventory.latestSnapshot.useQuery();
  const { data: batches, isLoading: loadingBatches } = trpc.production.batches.useQuery(calendarRange);
  const { data: salesUploads } = trpc.sales.uploads.useQuery();
  const { data: allSnapshots } = trpc.inventory.allSnapshots.useQuery();

  const utils = trpc.useUtils();
  const checkStockoutsMutation = trpc.notifications.checkAndNotify.useMutation({
    onSuccess: () => toast.success("Stockout check completed. Email sent if alerts found."),
    onError: (e) => toast.error(`Error checking stockouts: ${e.message}`),
  });

  const bulkVelocityMutation = trpc.skus.bulkUpdateVelocity.useMutation({
    onSuccess: (data) => {
      toast.success(`Applied velocity changes to ${data.count} SKU(s)`);
      utils.production.suggestions.invalidate();
      utils.skus.list.invalidate();
      setShowWhatIf(false);
    },
    onError: (e) => toast.error(`Failed to apply: ${e.message}`),
  });

  const handleApplyWhatIf = useCallback(
    (velocities: Array<{ skuId: number; velocity: number }>) => {
      bulkVelocityMutation.mutate({ updates: velocities });
    },
    [bulkVelocityMutation],
  );

  // Derived counts
  const criticalCount = suggestions?.suggestions?.filter((s) => s.urgency === "critical").length ?? 0;
  const warningCount = suggestions?.suggestions?.filter((s) => s.urgency === "warning").length ?? 0;
  const okCount = suggestions?.suggestions?.filter((s) => s.urgency === "ok").length ?? 0;
  const activeBatches = batches?.filter((b) => b.type === "batch_hijnx" || b.type === "batch_sb").length ?? 0;

  // Build What-If SKU data from the raw skuInputs returned by the suggestions query
  const whatIfSkus: WhatIfSku[] = (suggestions?.skuInputs ?? []).map((s) => ({
    skuId: s.skuId,
    skuName: s.skuName,
    currentStock: s.currentStock,
    wipStock: s.wipStock ?? 0,
    dailyVelocity: s.dailyVelocity,
    parLevel: s.parLevel,
    netBatchSize: s.netBatchSize,
    leadTimeDays: s.leadTimeDays,
    committedQuantity: s.committedQuantity,
    bufferDays: s.bufferDays,
  }));

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">Production Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm">Overview of inventory status, production needs, and scheduling.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showWhatIf ? "default" : "outline"}
            onClick={() => setShowWhatIf((v) => !v)}
            className={`${showWhatIf ? "bg-primary" : ""} text-sm`}
            size="sm"
          >
            <FlaskConical className="w-4 h-4 mr-1.5" />
            <span className="hidden xs:inline">What-If</span>
          </Button>
          <Button
            onClick={() => checkStockoutsMutation.mutate()}
            disabled={checkStockoutsMutation.isPending}
            className="bg-green-600 hover:bg-green-700 whitespace-nowrap text-sm"
            size="sm"
          >
            {checkStockoutsMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Checking...</>
            ) : (
              <><Bell className="w-4 h-4 mr-1.5" /><span className="hidden sm:inline">Check for </span>Stockouts</>
            )}
          </Button>
        </div>
      </div>

      {/* Data Freshness */}
      <DataFreshness
        latestSnapshot={allSnapshots?.[0] ?? null}
        latestSalesUpload={salesUploads?.find((u) => u.status === "completed") ?? null}
        onNavigate={setLocation}
      />

      {/* What-If Panel */}
      {showWhatIf && whatIfSkus.length > 0 && (
        <WhatIfPanel
          skus={whatIfSkus}
          onClose={() => setShowWhatIf(false)}
          onApply={handleApplyWhatIf}
          isApplying={bulkVelocityMutation.isPending}
        />
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <SummaryCard
          icon={<XCircle className="h-4 w-4 text-destructive" />}
          label="Critical"
          value={criticalCount}
          loading={loadingSuggestions}
          className="border-destructive/20 bg-destructive/5"
        />
        <SummaryCard
          icon={<AlertTriangle className="h-4 w-4 text-yellow-600" />}
          label="Below Par"
          value={warningCount}
          loading={loadingSuggestions}
          className="border-yellow-500/20 bg-yellow-50"
        />
        <SummaryCard
          icon={<CheckCircle className="h-4 w-4 text-primary" />}
          label="On Track"
          value={okCount}
          loading={loadingSuggestions}
          className="border-primary/20 bg-primary/5"
        />
        <SummaryCard
          icon={<Calendar className="h-4 w-4" />}
          label="Calendar Batches"
          value={activeBatches}
          loading={loadingBatches}
        />
      </div>

      {/* Production Needs Table */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-lg">Production Needs</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">SKUs requiring production attention, sorted by days to stockout</p>
          </div>
          <div className="flex items-center gap-2">
            {suggestions?.suggestions && suggestions.suggestions.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void exportProductionNeedsPdf(
                    suggestions.suggestions,
                    { critical: criticalCount, warning: warningCount, ok: okCount, activeBatches },
                    {
                      inventoryDate: allSnapshots?.[0] ? new Date(allSnapshots[0].snapshotDate) : null,
                      salesDate: salesUploads?.find((u) => u.status === "completed")
                        ? new Date(salesUploads.find((u) => u.status === "completed")!.createdAt)
                        : null,
                    },
                  )
                }
              >
                <Download className="h-4 w-4 mr-1.5" />
                Export PDF
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setLocation("/calendar")}>
              View Calendar <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingSuggestions ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !suggestions?.suggestions?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No inventory data yet. Upload an inventory spreadsheet to get started.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setLocation("/upload")}>
                Upload Inventory
              </Button>
            </div>
          ) : (
            <>
              {/* Desktop table — hidden on mobile */}
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-[1320px] w-full table-fixed text-sm">
                  <colgroup>
                    <col className="w-[104px]" />
                    <col className="w-[330px]" />
                    <col className="w-[92px]" />
                    <col className="w-[96px]" />
                    <col className="w-[96px]" />
                    <col className="w-[92px]" />
                    <col className="w-[106px]" />
                    <col className="w-[136px]" />
                    <col className="w-[106px]" />
                    <col className="w-[112px]" />
                    <col className="w-[150px]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b text-left">
                      <th className="px-3 pb-3 font-medium text-muted-foreground">Status</th>
                      <th className="px-3 pb-3 font-medium text-muted-foreground">SKU</th>
                      <th className="px-3 pb-3 font-medium text-muted-foreground text-right leading-tight">Available</th>
                      <th className="px-3 pb-3 font-medium text-muted-foreground text-right leading-tight">In<br />Testing</th>
                      <th className="px-3 pb-3 font-medium text-muted-foreground text-right leading-tight">Projected</th>
                      <th className="px-3 pb-3 font-medium text-muted-foreground text-right leading-tight">Par<br />Level</th>
                      <th className="px-3 pb-3 font-medium text-muted-foreground text-right leading-tight">Velocity<br />/ Day</th>
                      <th className="px-3 pb-3 font-medium text-muted-foreground text-right leading-tight">
                        <span className="flex items-center justify-end gap-1">
                          <Timer className="h-3.5 w-3.5 shrink-0" />Days to<br />Stockout
                        </span>
                      </th>
                      <th className="px-3 pb-3 font-medium text-muted-foreground text-right leading-tight">Committed</th>
                      <th className="px-3 pb-3 font-medium text-muted-foreground text-right leading-tight">Batches<br />Needed</th>
                      <th className="px-3 pb-3 font-medium text-muted-foreground leading-tight">Suggested<br />Start</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suggestions.suggestions.map((s) => (
                      <tr key={s.skuId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-3"><UrgencyBadge urgency={s.urgency} /></td>
                        <td className="px-3 py-3 font-medium text-foreground whitespace-nowrap">{s.skuName}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{s.currentStock.toLocaleString()}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                          {s.wipStock > 0 ? s.wipStock.toLocaleString() : "--"}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums font-medium">{s.projectedStock.toLocaleString()}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{s.parLevel.toLocaleString()}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{s.dailyVelocity.toFixed(1)}</td>
                        <td className="px-3 py-3 text-right">
                          {s.daysUntilStockout === Infinity ? (
                            <span className="text-muted-foreground">--</span>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={`inline-flex items-center gap-1.5 tabular-nums font-semibold px-2.5 py-1 rounded-full text-xs ${
                                  s.daysUntilStockout <= 5 ? "bg-destructive/10 text-destructive" :
                                  s.daysUntilStockout <= 14 ? "bg-yellow-100 text-yellow-700" :
                                  s.daysUntilStockout <= 21 ? "bg-blue-50 text-blue-600" :
                                  "bg-primary/10 text-primary"
                                }`}>
                                  {s.daysUntilStockout <= 5 && <Clock className="h-3 w-3" />}
                                  {s.daysUntilStockout} days
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="left">
                                <p className="text-xs">
                                  At {s.dailyVelocity.toFixed(1)} units/day, {s.projectedStock.toLocaleString()} projected units will last ~{s.daysUntilStockout} days
                                  {s.daysUntilStockout <= 5 && (
                                    <span className="block mt-1 font-semibold text-destructive">Stockout before next batch can finish!</span>
                                  )}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {s.committedQuantity > 0 ? (
                            <span className="text-blue-600 font-medium">{s.committedQuantity.toLocaleString()}</span>
                          ) : (
                            <span className="text-muted-foreground">--</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums font-medium">{s.batchesNeeded || "--"}</td>
                        <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">
                          {s.batchesNeeded > 0 ? (
                            <span>
                              {format(new Date(s.suggestedStartDate), "MMM d")}
                              <span className="text-xs ml-1 opacity-70">(W{s.calendarWeek})</span>
                            </span>
                          ) : "--"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card layout — shown on small screens */}
              <div className="md:hidden space-y-2">
                {suggestions.suggestions.map((s) => (
                  <SkuMobileCard key={s.skuId} s={s} />
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Stockout Timeline */}
      {suggestions?.suggestions && (
        <StockoutTimeline
          items={suggestions.suggestions.map((s) => ({
            skuId: s.skuId,
            skuName: s.skuName,
            stockoutDate: new Date(s.suggestedStartDate),
            daysUntilStockout: s.daysUntilStockout,
            currentStock: s.currentStock,
            dailyVelocity: s.dailyVelocity,
            urgency: s.urgency as "critical" | "warning" | "ok",
          }))}
          isLoading={loadingSuggestions}
          hasData={!!inventory}
        />
      )}
    </div>
  );
}
