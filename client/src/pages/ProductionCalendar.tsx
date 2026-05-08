import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarDays,
  Plus,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Factory,
  Trash2,
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
  isSameDay,
  isWeekend,
  isSameMonth,
} from "date-fns";

export default function ProductionCalendar() {
  const utils = trpc.useUtils();
  const { data: batches, isLoading: loadingBatches } =
    trpc.production.batches.useQuery();
  const { data: suggestions } = trpc.production.suggestions.useQuery();
  const { data: skuList } = trpc.skus.list.useQuery();

  const scheduleBatch = trpc.production.scheduleBatch.useMutation({
    onSuccess: () => {
      utils.production.batches.invalidate();
      toast.success("Batch scheduled");
      setScheduleOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateBatch = trpc.production.updateBatch.useMutation({
    onSuccess: () => {
      utils.production.batches.invalidate();
      toast.success("Batch updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteBatch = trpc.production.deleteBatch.useMutation({
    onSuccess: () => {
      utils.production.batches.invalidate();
      toast.success("Batch removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateCommitted = trpc.committed.update.useMutation({
    onSuccess: () => {
      utils.production.batches.invalidate();
      toast.success("Committed batch updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteCommitted = trpc.committed.delete.useMutation({
    onSuccess: () => {
      utils.production.batches.invalidate();
      toast.success("Committed batch removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [scheduleForm, setScheduleForm] = useState({
    skuId: "",
    batchSize: "",
    notes: "",
  });

  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });

    // Pad start
    const startDow = getDay(start);
    const padStart: Date[] = [];
    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(start);
      d.setDate(d.getDate() - (i + 1));
      padStart.push(d);
    }

    // Pad end
    const endDow = getDay(end);
    const padEnd: Date[] = [];
    for (let i = 1; i < 7 - endDow; i++) {
      const d = new Date(end);
      d.setDate(d.getDate() + i);
      padEnd.push(d);
    }

    return [...padStart, ...days, ...padEnd];
  }, [currentMonth]);

  const getBatchesForDay = (day: Date) => {
    if (!batches) return [];
    return batches.filter((b) => {
      if (!b.startDate || !b.endDate) return false;
      const start = new Date(b.startDate);
      const end = new Date(b.endDate);
      return day >= start && day <= end;
    });
  };

  const handleSchedule = () => {
    if (!scheduleForm.skuId || !selectedDate) {
      toast.error("Please select a SKU and date");
      return;
    }
    const sku = skuList?.find((s) => s.id === parseInt(scheduleForm.skuId));
    const batchSize =
      parseInt(scheduleForm.batchSize) ||
      sku?.customBatchSize ||
      sku?.netBatchSize ||
      950;

    scheduleBatch.mutate({
      skuId: parseInt(scheduleForm.skuId),
      batchSize,
      startDate: selectedDate.toISOString(),
      notes: scheduleForm.notes || undefined,
    });
  };

  const openScheduleForDate = (day: Date) => {
    if (isWeekend(day)) {
      toast.error("Cannot schedule production on weekends");
      return;
    }
    setSelectedDate(day);
    setScheduleForm({ skuId: "", batchSize: "", notes: "" });
    setScheduleOpen(true);
  };

  const quickScheduleFromSuggestion = (s: { suggestedStartDate: string | Date; skuId: number; batchSize: number; batchesNeeded: number }) => {
    setSelectedDate(new Date(s.suggestedStartDate));
    const sku = skuList?.find((sk) => sk.id === s.skuId);
    setScheduleForm({
      skuId: String(s.skuId),
      batchSize: String(s.batchSize),
      notes: `Auto-suggested: ${s.batchesNeeded} batch(es) needed`,
    });
    setScheduleOpen(true);
  };

  const statusColors: Record<string, string> = {
    suggested: "bg-blue-100 text-blue-800 border-blue-200",
    scheduled: "bg-primary/10 text-primary border-primary/20",
    in_progress: "bg-yellow-100 text-yellow-800 border-yellow-200",
    completed: "bg-green-100 text-green-800 border-green-200",
    cancelled: "bg-gray-100 text-gray-500 border-gray-200",
  };

  const activeSkus = skuList?.filter((s) => s.isActive) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
          Production Calendar
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tap a weekday to schedule. Weekends are grayed out.
        </p>
      </div>

      {/* Quick Schedule from Suggestions */}
      {suggestions?.suggestions?.some(
        (s) => s.urgency === "critical" || s.urgency === "warning"
      ) && (
        <Card className="border-yellow-500/30 bg-yellow-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Factory className="h-4 w-4 text-yellow-600" />
              Quick Schedule from Suggestions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {suggestions.suggestions
                .filter(
                  (s) => s.urgency === "critical" || s.urgency === "warning"
                )
                .map((s) => (
                  <Button
                    key={s.skuId}
                    variant="outline"
                    size="sm"
                    className={`text-xs ${s.urgency === "critical" ? "border-destructive/50 text-destructive" : "border-yellow-500/50 text-yellow-700"}`}
                    onClick={() => quickScheduleFromSuggestion(s)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {s.skuName} ({s.batchesNeeded}x)
                  </Button>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Calendar */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-4">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <CardTitle className="text-base sm:text-lg">
                {format(currentMonth, "MMMM yyyy")}
              </CardTitle>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2 text-[10px] sm:text-xs">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded bg-primary/10 border border-primary/20" />
                Sched
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded bg-yellow-100 border border-yellow-200" />
                In Prog
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded bg-green-100 border border-green-200" />
                Done
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingBatches ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
              {/* Day headers */}
              {["S", "M", "T", "W", "T", "F", "S"].map((d, idx) => (
                <div
                  key={idx}
                  className="bg-muted px-1 sm:px-2 py-1.5 sm:py-2 text-center text-[10px] sm:text-xs font-medium text-muted-foreground"
                >
                  <span className="sm:hidden">{d}</span>
                  <span className="hidden sm:inline">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][idx]}</span>
                </div>
              ))}
              {/* Calendar cells */}
              {calendarDays.map((day, i) => {
                const dayBatches = getBatchesForDay(day);
                const weekend = isWeekend(day);
                const inMonth = isSameMonth(day, currentMonth);
                const isToday = isSameDay(day, new Date());

                return (
                  <div
                    key={i}
                    className={`min-h-[48px] sm:min-h-[80px] p-0.5 sm:p-1 ${
                      weekend
                        ? "bg-muted/60"
                        : inMonth
                          ? "bg-card hover:bg-muted/20 cursor-pointer"
                          : "bg-muted/30"
                    } ${!inMonth ? "opacity-40" : ""} transition-colors`}
                    onClick={() => inMonth && !weekend && openScheduleForDate(day)}
                  >
                    <div
                      className={`text-xs font-medium mb-1 ${
                        isToday
                          ? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center"
                          : weekend
                            ? "text-muted-foreground/50"
                            : "text-foreground"
                      }`}
                    >
                      {format(day, "d")}
                    </div>
                    <div className="space-y-0.5">
                      {dayBatches.slice(0, 3).map((b) => (
                        <div
                          key={`${b.source}-${b.id}`}
                          className={`text-[10px] px-1 py-0.5 rounded truncate border ${statusColors[b.status ?? "scheduled"]} ${b.source === "committed" ? "border-l-2 border-l-primary" : ""}`}
                          title={`${b.skuName} - ${b.status}${b.source === "committed" ? " (Committed)" : ""}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {b.skuName?.split(" ")[0]}
                        </div>
                      ))}
                      {dayBatches.length > 3 && (
                        <div className="text-[10px] text-muted-foreground px-1">
                          +{dayBatches.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Batch List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Scheduled Batches</CardTitle>
        </CardHeader>
        <CardContent>
          {!batches?.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No batches scheduled yet. Tap a weekday on the calendar to schedule one.
            </p>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-3 font-medium text-muted-foreground">SKU</th>
                      <th className="pb-3 font-medium text-muted-foreground">Start</th>
                      <th className="pb-3 font-medium text-muted-foreground">End</th>
                      <th className="pb-3 font-medium text-muted-foreground text-right">Size</th>
                      <th className="pb-3 font-medium text-muted-foreground">Status</th>
                      <th className="pb-3 font-medium text-muted-foreground">Notes</th>
                      <th className="pb-3 font-medium text-muted-foreground text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((b) => (
                      <tr key={`${b.source}-${b.id}`} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-3 font-medium text-foreground">
                          <span className="flex items-center gap-2">
                            {b.skuName}
                            {b.source === "committed" && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-primary/40 text-primary">Committed</Badge>
                            )}
                          </span>
                        </td>
                        <td className="py-3 text-muted-foreground">{b.startDate ? format(new Date(b.startDate), "MMM d, yyyy") : "--"}</td>
                        <td className="py-3 text-muted-foreground">{b.endDate ? format(new Date(b.endDate), "MMM d, yyyy") : "--"}</td>
                        <td className="py-3 text-right tabular-nums">{b.batchSize.toLocaleString()}</td>
                        <td className="py-3">
                          <Select value={b.status ?? "scheduled"} onValueChange={(v) => {
                            if (b.source === "committed") {
                              updateCommitted.mutate({ id: b.id, status: (v === "scheduled" ? "planned" : v) as "planned" | "in_progress" | "completed" | "cancelled" });
                            } else {
                              updateBatch.mutate({ id: b.id, status: v as "suggested" | "scheduled" | "in_progress" | "completed" | "cancelled" });
                            }
                          }}>
                            <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="scheduled">{b.source === "committed" ? "Planned" : "Scheduled"}</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-3 text-muted-foreground text-xs max-w-[200px] truncate">{b.notes || "--"}</td>
                        <td className="py-3 text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => {
                            if (b.source === "committed") deleteCommitted.mutate({ id: b.id });
                            else deleteBatch.mutate({ id: b.id });
                          }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card layout */}
              <div className="md:hidden space-y-2">
                {batches.map((b) => (
                  <div key={`${b.source}-${b.id}`} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm truncate flex-1 mr-2">
                        {b.skuName}
                        {b.source === "committed" && (
                          <Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0 h-4 border-primary/40 text-primary">C</Badge>
                        )}
                      </span>
                      <span className="text-sm tabular-nums font-medium shrink-0">{b.batchSize.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{b.startDate ? format(new Date(b.startDate), "MMM d") : "--"} → {b.endDate ? format(new Date(b.endDate), "MMM d") : "--"}</span>
                      <div className="flex items-center gap-1">
                        <Select value={b.status ?? "scheduled"} onValueChange={(v) => {
                          if (b.source === "committed") updateCommitted.mutate({ id: b.id, status: (v === "scheduled" ? "planned" : v) as "planned" | "in_progress" | "completed" | "cancelled" });
                          else updateBatch.mutate({ id: b.id, status: v as "suggested" | "scheduled" | "in_progress" | "completed" | "cancelled" });
                        }}>
                          <SelectTrigger className="h-6 w-[100px] text-[10px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="scheduled">{b.source === "committed" ? "Planned" : "Scheduled"}</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => {
                          if (b.source === "committed") deleteCommitted.mutate({ id: b.id });
                          else deleteBatch.mutate({ id: b.id });
                        }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Schedule Dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Schedule Production Batch
              {selectedDate && (
                <span className="text-muted-foreground font-normal ml-2">
                  {format(selectedDate, "EEEE, MMM d, yyyy")}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>SKU</Label>
              <Select
                value={scheduleForm.skuId}
                onValueChange={(v) =>
                  setScheduleForm({ ...scheduleForm, skuId: v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select SKU" />
                </SelectTrigger>
                <SelectContent>
                  {activeSkus.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Batch Size</Label>
              <Input
                type="number"
                value={scheduleForm.batchSize}
                onChange={(e) =>
                  setScheduleForm({
                    ...scheduleForm,
                    batchSize: e.target.value,
                  })
                }
                placeholder="Leave blank for default"
              />
              {scheduleForm.skuId && (
                <p className="text-xs text-muted-foreground mt-1">
                  Default:{" "}
                  {(
                    skuList?.find(
                      (s) => s.id === parseInt(scheduleForm.skuId)
                    )?.customBatchSize ??
                    skuList?.find(
                      (s) => s.id === parseInt(scheduleForm.skuId)
                    )?.netBatchSize ??
                    0
                  ).toLocaleString()}{" "}
                  units (net of 5% loss)
                </p>
              )}
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                value={scheduleForm.notes}
                onChange={(e) =>
                  setScheduleForm({ ...scheduleForm, notes: e.target.value })
                }
                placeholder="Any notes about this batch..."
                rows={2}
              />
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <p className="text-muted-foreground">
                This batch will take{" "}
                <span className="font-medium text-foreground">
                  5 business days
                </span>{" "}
                to complete (weekends excluded). Product will be sellable by the
                end date shown on the calendar.
              </p>
            </div>
            <Button
              onClick={handleSchedule}
              disabled={scheduleBatch.isPending}
              className="w-full"
            >
              {scheduleBatch.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Scheduling...
                </>
              ) : (
                <>
                  <CalendarDays className="h-4 w-4 mr-2" />
                  Schedule Batch
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
