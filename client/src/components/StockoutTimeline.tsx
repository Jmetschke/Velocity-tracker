import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, TrendingDown, CheckCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { format, differenceInDays } from "date-fns";

interface TimelineItem {
  skuId: number;
  skuName: string;
  stockoutDate: Date;
  daysUntilStockout: number;
  currentStock: number;
  dailyVelocity: number;
  urgency: "critical" | "warning" | "ok";
}

interface StockoutTimelineProps {
  items: TimelineItem[];
  isLoading?: boolean;
  /** Whether inventory data has been uploaded at all. */
  hasData?: boolean;
}

export function StockoutTimeline({ items, isLoading, hasData = true }: StockoutTimelineProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Stockout Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">Loading timeline...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!items || items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Stockout Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            {hasData ? (
              <>
                <CheckCircle className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>All SKUs are well-stocked. No stockouts projected.</p>
              </>
            ) : (
              <>
                <TrendingDown className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>Upload inventory and sales data to see stockout projections.</p>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sort items by stockout date (closest first)
  const sortedItems = [...items].sort(
    (a, b) => new Date(a.stockoutDate).getTime() - new Date(b.stockoutDate).getTime()
  );

  // Calculate the date range for the timeline
  const today = new Date();
  const maxDate = new Date(Math.max(...sortedItems.map((i) => new Date(i.stockoutDate).getTime())));
  const totalDays = differenceInDays(maxDate, today) + 1;

  // Group items by week for better visualization
  const weeks: { startDate: Date; items: TimelineItem[] }[] = [];
  for (let i = 0; i < totalDays; i += 7) {
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() + i);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const weekItems = sortedItems.filter((item) => {
      const itemDate = new Date(item.stockoutDate);
      return itemDate >= weekStart && itemDate <= weekEnd;
    });

    if (weekItems.length > 0) {
      weeks.push({ startDate: weekStart, items: weekItems });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Stockout Timeline</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Visual timeline of when each SKU is projected to run out of stock
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 sm:space-y-6">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="space-y-3">
              {/* Week header */}
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <div className="text-xs text-muted-foreground">
                  {format(week.startDate, "MMM d")} - {format(new Date(week.startDate.getTime() + 6 * 24 * 60 * 60 * 1000), "MMM d")}
                </div>
              </div>

              {/* Timeline items for this week */}
              <div className="space-y-3 sm:space-y-2">
                {week.items.map((item) => {
                  const daysFromNow = differenceInDays(new Date(item.stockoutDate), today);
                  const progressPercent = Math.max(0, Math.min(100, ((daysFromNow + 1) / totalDays) * 100));

                  return (
                    <Tooltip key={item.skuId}>
                      <TooltipTrigger asChild>
                        <div className="group cursor-help">
                          {/* SKU name and date */}
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-foreground truncate flex-1">
                              {item.skuName}
                            </span>
                            <span className="text-xs text-muted-foreground ml-2 whitespace-nowrap">
                              {format(new Date(item.stockoutDate), "MMM d")}
                            </span>
                          </div>

                          {/* Progress bar */}
                          <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                item.urgency === "critical"
                                  ? "bg-destructive"
                                  : item.urgency === "warning"
                                  ? "bg-yellow-500"
                                  : "bg-primary"
                              }`}
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>

                          {/* Status badge */}
                          <div className="flex items-center justify-between mt-1">
                            <div className="flex items-center gap-1">
                              {item.urgency === "critical" ? (
                                <>
                                  <AlertCircle className="h-3 w-3 text-destructive" />
                                  <span className="text-xs text-destructive font-semibold">
                                    {item.daysUntilStockout.toFixed(0)} days
                                  </span>
                                </>
                              ) : item.urgency === "warning" ? (
                                <>
                                  <TrendingDown className="h-3 w-3 text-yellow-600" />
                                  <span className="text-xs text-yellow-700 font-semibold">
                                    {item.daysUntilStockout.toFixed(0)} days
                                  </span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle className="h-3 w-3 text-primary" />
                                  <span className="text-xs text-primary font-semibold">
                                    {item.daysUntilStockout.toFixed(0)} days
                                  </span>
                                </>
                              )}
                            </div>
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                item.urgency === "critical"
                                  ? "border-destructive/50 text-destructive"
                                  : item.urgency === "warning"
                                  ? "border-yellow-500/50 text-yellow-700 bg-yellow-50"
                                  : "border-primary/50 text-primary"
                              }`}
                            >
                              {item.currentStock.toLocaleString()} units
                            </Badge>
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs">
                        <div className="space-y-1 text-xs">
                          <p className="font-semibold">{item.skuName}</p>
                          <p>Current Stock: {item.currentStock.toLocaleString()} units</p>
                          <p>Daily Velocity: {item.dailyVelocity.toFixed(1)} units/day</p>
                          <p>Stockout Date: {format(new Date(item.stockoutDate), "MMMM d, yyyy")}</p>
                          <p className="text-muted-foreground">
                            {item.daysUntilStockout.toFixed(1)} days remaining
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
