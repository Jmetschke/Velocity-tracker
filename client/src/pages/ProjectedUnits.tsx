import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  CalendarDays,
  Clock,
  Loader2,
  Package,
  PackageCheck,
  Timer,
} from "lucide-react";
import { useMemo } from "react";
import { addDays, format } from "date-fns";
import { useLocation } from "wouter";
import type { AppRouter } from "../../../server/routers";
import type { inferRouterOutputs } from "@trpc/server";

type Suggestion = inferRouterOutputs<AppRouter>["production"]["suggestions"]["suggestions"][number];
type CalendarItem = inferRouterOutputs<AppRouter>["production"]["batches"][number];

function UrgencyBadge({ urgency }: { urgency: string }) {
  if (urgency === "critical") return <Badge variant="destructive" className="text-xs">Critical</Badge>;
  if (urgency === "warning") return <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-700 bg-yellow-50">Below Par</Badge>;
  return <Badge variant="outline" className="text-xs border-primary/50 text-primary">OK</Badge>;
}

function normalizeProductName(value: string) {
  return value
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function projectedUnitsForSku(
  skuName: string,
  projectedUnitsByProduct: Map<string, number>
) {
  const skuKey = normalizeProductName(skuName);
  const exactMatch = projectedUnitsByProduct.get(skuKey);
  if (exactMatch != null) return exactMatch;

  let total = 0;
  projectedUnitsByProduct.forEach((units, productKey) => {
    if (productKey.includes(skuKey) || skuKey.includes(productKey)) {
      total += units;
    }
  });
  return total;
}

function SkuMobileCard({
  s,
  projectedUnits,
}: {
  s: Suggestion;
  projectedUnits: number;
}) {
  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-foreground text-sm truncate flex-1 mr-2">{s.skuName}</span>
        <UrgencyBadge urgency={s.urgency} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground block">Available</span>
          <span className="tabular-nums font-medium">{s.currentStock.toLocaleString()}</span>
        </div>
        <div>
          <span className="text-muted-foreground block">Projected Units / 30d</span>
          <span className="tabular-nums font-semibold text-primary">
            {projectedUnits > 0 ? projectedUnits.toLocaleString() : "--"}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground block">In Testing</span>
          <span className="tabular-nums text-muted-foreground">{s.wipStock > 0 ? s.wipStock.toLocaleString() : "--"}</span>
        </div>
        <div>
          <span className="text-muted-foreground block">Projected</span>
          <span className="tabular-nums font-medium">{s.projectedStock.toLocaleString()}</span>
        </div>
        <div>
          <span className="text-muted-foreground block">Stockout</span>
          {s.daysUntilStockout === Infinity ? (
            <span className="text-muted-foreground">--</span>
          ) : (
            <span className="tabular-nums font-semibold">{s.daysUntilStockout}d</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProjectedUnits() {
  const [, setLocation] = useLocation();
  const calendarRange = useMemo(() => {
    const today = new Date();
    return {
      startDate: format(today, "yyyy-MM-dd"),
      endDate: format(addDays(today, 30), "yyyy-MM-dd"),
    };
  }, []);

  const { data: suggestions, isLoading: loadingSuggestions } = trpc.production.suggestions.useQuery();
  const { data: calendarItems = [], isLoading: loadingCalendar } = trpc.production.batches.useQuery(calendarRange);

  const projectedUnitsByProduct = useMemo(() => {
    const projected = new Map<string, number>();
    for (const item of calendarItems as CalendarItem[]) {
      if (item.type !== "batch_hijnx" && item.type !== "batch_sb") continue;
      if (item.quantity == null || item.quantity <= 0) continue;

      const key = normalizeProductName(item.title);
      if (!key) continue;
      projected.set(key, (projected.get(key) ?? 0) + item.quantity);
    }
    return projected;
  }, [calendarItems]);

  const rows = useMemo(
    () =>
      (suggestions?.suggestions ?? []).map((suggestion) => ({
        suggestion,
        projectedUnits: projectedUnitsForSku(suggestion.skuName, projectedUnitsByProduct),
      })),
    [projectedUnitsByProduct, suggestions?.suggestions]
  );

  const loading = loadingSuggestions || loadingCalendar;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">Projected Units</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Production needs with units scheduled in the next 30 days from the shared calendar.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setLocation("/calendar")}>
          View Calendar <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-lg">Projected Units</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Calendar range: {format(new Date(`${calendarRange.startDate}T00:00:00`), "MMM d")} - {format(new Date(`${calendarRange.endDate}T00:00:00`), "MMM d, yyyy")}
            </p>
          </div>
          <Badge variant="outline" className="w-fit gap-1">
            <CalendarDays className="h-3.5 w-3.5" />
            Read-only calendar data
          </Badge>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !rows.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No inventory data yet. Upload an inventory spreadsheet to get started.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setLocation("/upload")}>
                Upload Inventory
              </Button>
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-[1460px] w-full table-fixed text-sm">
                  <colgroup>
                    <col className="w-[104px]" />
                    <col className="w-[330px]" />
                    <col className="w-[150px]" />
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
                      <th className="px-3 pb-3 font-medium text-muted-foreground text-right leading-tight">Projected Units<br />Next 30 Days</th>
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
                    {rows.map(({ suggestion: s, projectedUnits }) => (
                      <tr key={s.skuId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-3"><UrgencyBadge urgency={s.urgency} /></td>
                        <td className="px-3 py-3 font-medium text-foreground whitespace-nowrap">{s.skuName}</td>
                        <td className="px-3 py-3 text-right tabular-nums font-semibold text-primary">
                          {projectedUnits > 0 ? (
                            <span className="inline-flex items-center justify-end gap-1">
                              <PackageCheck className="h-3.5 w-3.5" />
                              {projectedUnits.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-muted-foreground font-normal">--</span>
                          )}
                        </td>
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
                            <span className={`inline-flex items-center gap-1.5 tabular-nums font-semibold px-2.5 py-1 rounded-full text-xs ${
                              s.daysUntilStockout <= 5 ? "bg-destructive/10 text-destructive" :
                              s.daysUntilStockout <= 14 ? "bg-yellow-100 text-yellow-700" :
                              s.daysUntilStockout <= 21 ? "bg-blue-50 text-blue-600" :
                              "bg-primary/10 text-primary"
                            }`}>
                              {s.daysUntilStockout <= 5 && <Clock className="h-3 w-3" />}
                              {s.daysUntilStockout} days
                            </span>
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
                          {s.committedQuantity > 0 || s.batchesNeeded > 0 ? (
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

              <div className="md:hidden space-y-2">
                {rows.map(({ suggestion, projectedUnits }) => (
                  <SkuMobileCard key={suggestion.skuId} s={suggestion} projectedUnits={projectedUnits} />
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
