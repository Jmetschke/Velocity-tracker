import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Calendar,
  Package,
  CheckCircle2,
  Clock,
  XCircle,
  PlayCircle,
  Filter,
} from "lucide-react";

function getISOWeek(date: Date): { week: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week: weekNo, year: d.getUTCFullYear() };
}

function getWeekDateRange(week: number, year: number): string {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayOfWeek + 1);
  monday.setDate(monday.getDate() + (week - 1) * 7);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(monday)} – ${fmt(friday)}`;
}

const statusConfig = {
  planned: { label: "Planned", icon: Clock, color: "bg-blue-100 text-blue-800 border-blue-200" },
  in_progress: { label: "In Progress", icon: PlayCircle, color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  completed: { label: "Completed", icon: CheckCircle2, color: "bg-green-100 text-green-800 border-green-200" },
  cancelled: { label: "Cancelled", icon: XCircle, color: "bg-gray-100 text-gray-500 border-gray-200" },
};

export default function CommittedBatches() {
  const utils = trpc.useUtils();
  const { data: batches, isLoading } = trpc.committed.list.useQuery();
  const { data: skuList } = trpc.skus.list.useQuery();
  const createBatch = trpc.committed.create.useMutation({
    onSuccess: () => {
      utils.committed.list.invalidate();
      utils.production.suggestions.invalidate();
      toast.success("Batch committed successfully");
      resetForm();
    },
    onError: (e) => toast.error("Failed to create batch: " + e.message),
  });
  const updateBatch = trpc.committed.update.useMutation({
    onSuccess: () => {
      utils.committed.list.invalidate();
      utils.production.suggestions.invalidate();
      toast.success("Batch updated");
    },
    onError: (e) => toast.error("Failed to update: " + e.message),
  });
  const deleteBatch = trpc.committed.delete.useMutation({
    onSuccess: () => {
      utils.committed.list.invalidate();
      utils.production.suggestions.invalidate();
      toast.success("Batch deleted");
    },
    onError: (e) => toast.error("Failed to delete: " + e.message),
  });

  const currentWeekInfo = useMemo(() => getISOWeek(new Date()), []);
  const [showForm, setShowForm] = useState(false);
  const [selectedSkuId, setSelectedSkuId] = useState<string>("");
  const [quantity, setQuantity] = useState("");
  const [calendarWeek, setCalendarWeek] = useState(String(currentWeekInfo.week));
  const [calendarYear, setCalendarYear] = useState(String(currentWeekInfo.year));
  const [notes, setNotes] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");

  function resetForm() {
    setShowForm(false);
    setSelectedSkuId("");
    setQuantity("");
    setCalendarWeek(String(currentWeekInfo.week));
    setCalendarYear(String(currentWeekInfo.year));
    setNotes("");
  }

  function handleSubmit() {
    if (!selectedSkuId || !quantity) {
      toast.error("Please select a SKU and enter a quantity");
      return;
    }
    createBatch.mutate({
      skuId: parseInt(selectedSkuId),
      quantity: parseInt(quantity),
      calendarWeek: parseInt(calendarWeek),
      calendarYear: parseInt(calendarYear),
      notes: notes || undefined,
    });
  }

  // Auto-fill batch size when SKU is selected
  const selectedSku = skuList?.find((s) => s.id === parseInt(selectedSkuId));
  const suggestedQty = selectedSku
    ? selectedSku.customBatchSize ?? selectedSku.netBatchSize ?? 0
    : 0;

  const filteredBatches = useMemo(() => {
    if (!batches) return [];
    if (statusFilter === "all") return batches;
    if (statusFilter === "active")
      return batches.filter((b) => b.status === "planned" || b.status === "in_progress");
    return batches.filter((b) => b.status === statusFilter);
  }, [batches, statusFilter]);

  // Group by calendar week
  const groupedBatches = useMemo(() => {
    const groups = new Map<string, typeof filteredBatches>();
    for (const batch of filteredBatches) {
      const key = `W${batch.calendarWeek} ${batch.calendarYear}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(batch);
    }
    return Array.from(groups.entries()).sort((a, b) => {
      const [aWeek, aYear] = a[0].replace("W", "").split(" ").map(Number);
      const [bWeek, bYear] = b[0].replace("W", "").split(" ").map(Number);
      return aYear !== bYear ? bYear - aYear : bWeek - aWeek;
    });
  }, [filteredBatches]);

  // Generate week options (current week through 8 weeks ahead)
  const weekOptions = useMemo(() => {
    const options: Array<{ week: number; year: number; label: string }> = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i * 7);
      const { week, year } = getISOWeek(d);
      const exists = options.find((o) => o.week === week && o.year === year);
      if (!exists) {
        options.push({
          week,
          year,
          label: `Week ${week} (${getWeekDateRange(week, year)})`,
        });
      }
    }
    return options;
  }, []);

  // Summary stats
  const stats = useMemo(() => {
    if (!batches) return { planned: 0, inProgress: 0, completed: 0, totalUnits: 0 };
    return {
      planned: batches.filter((b) => b.status === "planned").length,
      inProgress: batches.filter((b) => b.status === "in_progress").length,
      completed: batches.filter((b) => b.status === "completed").length,
      totalUnits: batches
        .filter((b) => b.status === "planned" || b.status === "in_progress")
        .reduce((sum, b) => sum + b.quantity, 0),
    };
  }, [batches]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Committed Batches</h1>
          <p className="text-sm text-muted-foreground">
            Current week: <strong>Week {currentWeekInfo.week}</strong> ({getWeekDateRange(currentWeekInfo.week, currentWeekInfo.year)})
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm" className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Commit Batch
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="px-3 pt-4 pb-4 sm:px-6">
            <div className="flex items-center gap-2 text-blue-700">
              <Clock className="h-4 w-4" />
              <span className="text-xs font-medium sm:text-sm">Planned</span>
            </div>
            <p className="text-xl font-bold text-blue-800 mt-1 sm:text-2xl">{stats.planned}</p>
          </CardContent>
        </Card>
        <Card className="border-yellow-200 bg-yellow-50/50">
          <CardContent className="px-3 pt-4 pb-4 sm:px-6">
            <div className="flex items-center gap-2 text-yellow-700">
              <PlayCircle className="h-4 w-4" />
              <span className="text-xs font-medium sm:text-sm">In Progress</span>
            </div>
            <p className="text-xl font-bold text-yellow-800 mt-1 sm:text-2xl">{stats.inProgress}</p>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="px-3 pt-4 pb-4 sm:px-6">
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-xs font-medium sm:text-sm">Completed</span>
            </div>
            <p className="text-xl font-bold text-green-800 mt-1 sm:text-2xl">{stats.completed}</p>
          </CardContent>
        </Card>
        <Card className="border-purple-200 bg-purple-50/50">
          <CardContent className="px-3 pt-4 pb-4 sm:px-6">
            <div className="flex items-center gap-2 text-purple-700">
              <Package className="h-4 w-4" />
              <span className="text-xs font-medium sm:text-sm">Committed Units</span>
            </div>
            <p className="text-xl font-bold text-purple-800 mt-1 sm:text-2xl">{stats.totalUnits.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Add Batch Form */}
      {showForm && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-lg">Commit a Production Batch</CardTitle>
            <CardDescription>
              Add a planned batch to your production schedule. This will be subtracted from deficit calculations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>SKU</Label>
                <Select value={selectedSkuId} onValueChange={(v) => {
                  setSelectedSkuId(v);
                  // Auto-fill quantity with batch size
                  const sku = skuList?.find((s) => s.id === parseInt(v));
                  if (sku) {
                    setQuantity(String(sku.customBatchSize ?? sku.netBatchSize ?? ""));
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select SKU" />
                  </SelectTrigger>
                  <SelectContent>
                    {skuList
                      ?.filter((s) => s.isActive)
                      .map((sku) => (
                        <SelectItem key={sku.id} value={String(sku.id)}>
                          {sku.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder={suggestedQty ? `Batch size: ${suggestedQty}` : "Enter quantity"}
                />
                {suggestedQty > 0 && quantity && parseInt(quantity) !== suggestedQty && (
                  <p className="text-xs text-muted-foreground">
                    Standard batch: {suggestedQty.toLocaleString()} units
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Calendar Week</Label>
                <Select
                  value={`${calendarWeek}-${calendarYear}`}
                  onValueChange={(v) => {
                    const [w, y] = v.split("-");
                    setCalendarWeek(w);
                    setCalendarYear(y);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {weekOptions.map((opt) => (
                      <SelectItem key={`${opt.week}-${opt.year}`} value={`${opt.week}-${opt.year}`}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Notes (optional)</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g., Priority batch for distributor order"
                />
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <Button className="w-full sm:w-auto" onClick={handleSubmit} disabled={createBatch.isPending}>
                  {createBatch.isPending ? "Committing..." : "Commit Batch"}
                </Button>
                <Button variant="outline" className="w-full sm:w-auto" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active (Planned + In Progress)</SelectItem>
            <SelectItem value="planned">Planned Only</SelectItem>
            <SelectItem value="in_progress">In Progress Only</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="all">All Batches</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {filteredBatches.length} batch{filteredBatches.length !== 1 ? "es" : ""}
        </span>
      </div>

      {/* Batches grouped by week */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading committed batches...</div>
      ) : groupedBatches.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">No committed batches</h3>
            <p className="text-muted-foreground mb-4">
              Click "Commit Batch" to add your planned production runs.
            </p>
        <Button className="w-full sm:w-auto" onClick={() => setShowForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Commit Your First Batch
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groupedBatches.map(([weekKey, weekBatches]) => {
            const firstBatch = weekBatches[0];
            const isCurrentWeek =
              firstBatch.calendarWeek === currentWeekInfo.week &&
              firstBatch.calendarYear === currentWeekInfo.year;
            const dateRange = getWeekDateRange(firstBatch.calendarWeek, firstBatch.calendarYear);
            const weekTotal = weekBatches.reduce((sum, b) => sum + b.quantity, 0);

            return (
              <Card key={weekKey} className={isCurrentWeek ? "border-primary/50 bg-primary/5" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-base">
                        Week {firstBatch.calendarWeek}
                        {isCurrentWeek && (
                          <Badge variant="outline" className="ml-2 text-xs border-primary text-primary">
                            Current
                          </Badge>
                        )}
                      </CardTitle>
                      <span className="text-xs sm:text-sm text-muted-foreground">{dateRange}</span>
                    </div>
                    <span className="text-xs sm:text-sm font-medium text-muted-foreground sm:text-foreground">
                      {weekBatches.length} batch{weekBatches.length !== 1 ? "es" : ""} · {weekTotal.toLocaleString()} units
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {weekBatches.map((batch) => {
                      const cfg = statusConfig[batch.status as keyof typeof statusConfig] ?? statusConfig.planned;
                      const StatusIcon = cfg.icon;
                      return (
                        <div
                          key={batch.id}
                          className="p-3 rounded-lg border bg-background hover:bg-accent/30 transition-colors space-y-2"
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex flex-wrap items-center gap-2 min-w-0">
                              <Badge variant="outline" className={`${cfg.color} shrink-0`}>
                                <StatusIcon className="h-3 w-3 mr-1" />
                                {cfg.label}
                              </Badge>
                              <span className="font-medium truncate">{batch.skuName}</span>
                            </div>
                            <span className="font-mono text-sm font-medium shrink-0 sm:ml-2">
                              {batch.quantity.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground min-w-0">
                              {batch.categoryName && <span>({batch.categoryName})</span>}
                              {batch.notes && <span className="max-w-full break-words sm:max-w-[180px] sm:truncate">{batch.notes}</span>}
                            </div>
                            <div className="flex items-center justify-end gap-0.5 shrink-0">
                              {batch.status === "planned" && (
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => updateBatch.mutate({ id: batch.id, status: "in_progress" })} title="Start production">
                                  <PlayCircle className="h-4 w-4 text-yellow-600" />
                                </Button>
                              )}
                              {batch.status === "in_progress" && (
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => updateBatch.mutate({ id: batch.id, status: "completed" })} title="Mark completed">
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                </Button>
                              )}
                              {(batch.status === "planned" || batch.status === "in_progress") && (
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => updateBatch.mutate({ id: batch.id, status: "cancelled" })} title="Cancel batch">
                                  <XCircle className="h-4 w-4 text-gray-400" />
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { if (confirm("Delete this committed batch?")) deleteBatch.mutate({ id: batch.id }); }} title="Delete batch">
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
