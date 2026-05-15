import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Loader2,
  PackagePlus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { PRODUCT_LAUNCH_ROADMAP, type ProductLaunchStatus } from "@shared/product-launch-roadmap";
import type { ProductLaunch, ProductLaunchChecklistItem } from "../../../drizzle/schema";

const statusLabels: Record<ProductLaunchStatus, string> = {
  draft: "Draft",
  in_progress: "In Progress",
  paused: "Paused",
  launched: "Launched",
  cancelled: "Cancelled",
};

const statusClasses: Record<ProductLaunchStatus, string> = {
  draft: "border-slate-300 text-slate-700 bg-slate-50",
  in_progress: "border-blue-300 text-blue-700 bg-blue-50",
  paused: "border-amber-300 text-amber-700 bg-amber-50",
  launched: "border-green-300 text-green-700 bg-green-50",
  cancelled: "border-gray-300 text-gray-600 bg-gray-50",
};

function formatDate(date: Date | null) {
  return date ? format(date, "MMM d, yyyy h:mm a") : "";
}

function getProgress(items: ProductLaunchChecklistItem[]) {
  const total = items.length;
  const complete = items.filter((item) => item.isComplete).length;
  return {
    complete,
    total,
    percent: total === 0 ? 0 : Math.round((complete / total) * 100),
  };
}

function getStageGate(stageNumber: number) {
  return PRODUCT_LAUNCH_ROADMAP.find((stage) => stage.stageNumber === stageNumber)?.gate ?? "";
}

export default function ProductLaunchRoadmap() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: launches, isLoading: launchesLoading } = trpc.productLaunches.list.useQuery();
  const [selectedLaunchId, setSelectedLaunchId] = useState<number | null>(null);
  const selectedLaunch = launches?.find((launch) => launch.id === selectedLaunchId) ?? null;

  const { data: detail, isLoading: detailLoading } = trpc.productLaunches.get.useQuery(
    { id: selectedLaunchId ?? 0 },
    { enabled: selectedLaunchId !== null }
  );

  const createLaunch = trpc.productLaunches.create.useMutation({
    onSuccess: async ({ id }) => {
      await utils.productLaunches.list.invalidate();
      setSelectedLaunchId(id);
      resetCreateForm();
      toast.success("Product launch roadmap created");
    },
    onError: (e) => toast.error("Failed to create launch: " + e.message),
  });

  const updateLaunch = trpc.productLaunches.update.useMutation({
    onSuccess: () => {
      utils.productLaunches.list.invalidate();
      if (selectedLaunchId) utils.productLaunches.get.invalidate({ id: selectedLaunchId });
      toast.success("Launch details saved");
    },
    onError: (e) => toast.error("Failed to save launch: " + e.message),
  });

  const updateChecklistItem = trpc.productLaunches.updateChecklistItem.useMutation({
    onSuccess: () => {
      utils.productLaunches.list.invalidate();
      if (selectedLaunchId) utils.productLaunches.get.invalidate({ id: selectedLaunchId });
    },
    onError: (e) => toast.error("Failed to update checklist: " + e.message),
  });

  const deleteLaunch = trpc.productLaunches.delete.useMutation({
    onSuccess: () => {
      utils.productLaunches.list.invalidate();
      setSelectedLaunchId(null);
      toast.success("Product launch deleted");
    },
    onError: (e) => toast.error("Failed to delete launch: " + e.message),
  });

  const [productName, setProductName] = useState("");
  const [codename, setCodename] = useState("");
  const [status, setStatus] = useState<ProductLaunchStatus>("draft");
  const [notes, setNotes] = useState("");

  const [editProductName, setEditProductName] = useState("");
  const [editCodename, setEditCodename] = useState("");
  const [editStatus, setEditStatus] = useState<ProductLaunchStatus>("draft");
  const [editNotes, setEditNotes] = useState("");
  const [itemNotes, setItemNotes] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!selectedLaunchId && launches && launches.length > 0) {
      setSelectedLaunchId(launches[0].id);
    }
  }, [launches, selectedLaunchId]);

  useEffect(() => {
    if (!detail?.launch) return;
    setEditProductName(detail.launch.productName);
    setEditCodename(detail.launch.codename ?? "");
    setEditStatus(detail.launch.status);
    setEditNotes(detail.launch.notes ?? "");
  }, [detail?.launch]);

  useEffect(() => {
    if (!detail?.checklistItems) return;
    setItemNotes(
      Object.fromEntries(
        detail.checklistItems.map((item) => [item.id, item.notes ?? ""])
      )
    );
  }, [detail?.checklistItems]);

  function resetCreateForm() {
    setProductName("");
    setCodename("");
    setStatus("draft");
    setNotes("");
  }

  function handleCreate() {
    if (!productName.trim()) {
      toast.error("Product name is required");
      return;
    }
    createLaunch.mutate({
      productName: productName.trim(),
      codename: codename.trim() || undefined,
      status,
      notes: notes.trim() || undefined,
    });
  }

  function handleSaveLaunch() {
    if (!detail?.launch || !editProductName.trim()) {
      toast.error("Product name is required");
      return;
    }
    updateLaunch.mutate({
      id: detail.launch.id,
      productName: editProductName.trim(),
      codename: editCodename.trim() || null,
      status: editStatus,
      notes: editNotes.trim() || null,
    });
  }

  function handleDelete(launch: ProductLaunch) {
    const confirmed = window.confirm(`Delete roadmap for ${launch.productName}?`);
    if (confirmed) deleteLaunch.mutate({ id: launch.id });
  }

  const checklistItems = detail?.checklistItems ?? [];
  const progress = useMemo(() => getProgress(checklistItems), [checklistItems]);
  const groupedStages = useMemo(() => {
    const groups = new Map<number, ProductLaunchChecklistItem[]>();
    for (const item of checklistItems) {
      if (!groups.has(item.stageNumber)) groups.set(item.stageNumber, []);
      groups.get(item.stageNumber)!.push(item);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a - b);
  }, [checklistItems]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
            Product Launch Roadmap
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Register new products and track every launch gate from concept to launch day.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full sm:w-auto"
          onClick={() => setLocation("/velocity")}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Velocity Tracker
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6 items-start">
        <div className="space-y-4">
          <Card className="border-primary/30">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <PackagePlus className="h-5 w-5 text-primary" />
                New Product
              </CardTitle>
              <CardDescription>
                Create a launch record with the default seven-stage checklist.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="productName">Product Name</Label>
                <Input
                  id="productName"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="Product name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="codename">Internal Codename</Label>
                <Input
                  id="codename"
                  value={codename}
                  onChange={(e) => setCodename(e.target.value)}
                  placeholder="Codename"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={(value) => setStatus(value as ProductLaunchStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Launch notes"
                />
              </div>
              <Button
                className="w-full"
                onClick={handleCreate}
                disabled={createLaunch.isPending}
              >
                {createLaunch.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <PackagePlus className="h-4 w-4 mr-2" />
                )}
                Create Roadmap
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-primary" />
                Existing Launches
              </CardTitle>
            </CardHeader>
            <CardContent>
              {launchesLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : launches && launches.length > 0 ? (
                <div className="space-y-2">
                  {launches.map((launch) => (
                    <button
                      key={launch.id}
                      type="button"
                      onClick={() => setSelectedLaunchId(launch.id)}
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${
                        selectedLaunchId === launch.id
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-foreground truncate">
                            {launch.productName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {launch.codename || "No codename"}
                          </p>
                        </div>
                        <Badge variant="outline" className={`text-xs shrink-0 ${statusClasses[launch.status]}`}>
                          {statusLabels[launch.status]}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No product launches yet.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 min-w-0">
          {!selectedLaunchId ? (
            <Card>
              <CardContent className="py-12 text-center">
                <ClipboardList className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                <p className="font-medium">Create or select a product launch</p>
                <p className="text-sm text-muted-foreground mt-1">
                  The full checklist will appear here.
                </p>
              </CardContent>
            </Card>
          ) : detailLoading || !detail ? (
            <Card>
              <CardContent className="py-12 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="space-y-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <CardTitle className="text-lg sm:text-xl truncate">
                        {selectedLaunch?.productName ?? detail.launch.productName}
                      </CardTitle>
                      <CardDescription>
                        {detail.launch.codename ? `Codename: ${detail.launch.codename}` : "No codename set"}
                      </CardDescription>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleSaveLaunch}
                        disabled={updateLaunch.isPending}
                      >
                        {updateLaunch.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4 mr-2" />
                        )}
                        Save Details
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(detail.launch)}
                        disabled={deleteLaunch.isPending}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label>Product Name</Label>
                      <Input value={editProductName} onChange={(e) => setEditProductName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Internal Codename</Label>
                      <Input value={editCodename} onChange={(e) => setEditCodename(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={editStatus} onValueChange={(value) => setEditStatus(value as ProductLaunchStatus)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(statusLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Launch Notes</Label>
                    <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-center">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium">Overall Progress</span>
                        <span className="text-sm text-muted-foreground">
                          {progress.complete} / {progress.total} complete
                        </span>
                      </div>
                      <Progress value={progress.percent} />
                    </div>
                    <div className="rounded-lg border px-4 py-3 text-center">
                      <div className="text-2xl font-semibold tabular-nums">{progress.percent}%</div>
                      <div className="text-xs text-muted-foreground">complete</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                {groupedStages.map(([stageNumber, items]) => {
                  const stageProgress = getProgress(items);
                  const stageName = items[0]?.stageName ?? `Stage ${stageNumber}`;
                  return (
                    <Card key={stageNumber}>
                      <CardHeader className="space-y-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                          <div>
                            <CardTitle className="text-base sm:text-lg">
                              Stage {stageNumber}: {stageName}
                            </CardTitle>
                            <CardDescription>Gate: {getStageGate(stageNumber)}</CardDescription>
                          </div>
                          <Badge variant="outline" className="w-fit">
                            {stageProgress.complete}/{stageProgress.total} done
                          </Badge>
                        </div>
                        <Progress value={stageProgress.percent} />
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {items.map((item, index) => (
                          <div key={item.id}>
                            {index > 0 && <Separator className="mb-3" />}
                            <div className="grid grid-cols-[auto_1fr] gap-3">
                              <Checkbox
                                checked={item.isComplete}
                                onCheckedChange={(checked) =>
                                  updateChecklistItem.mutate({
                                    id: item.id,
                                    isComplete: checked === true,
                                  })
                                }
                                className="mt-1"
                                aria-label={`Mark ${item.taskText} complete`}
                              />
                              <div className="min-w-0 space-y-3">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="min-w-0">
                                    <p className={`text-sm font-medium ${item.isComplete ? "text-muted-foreground line-through" : "text-foreground"}`}>
                                      {item.taskText}
                                    </p>
                                    {item.completedAt && (
                                      <p className="text-xs text-muted-foreground mt-1">
                                        Completed {formatDate(item.completedAt)}
                                      </p>
                                    )}
                                  </div>
                                  {item.isComplete && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="w-full sm:w-auto"
                                      onClick={() =>
                                        updateChecklistItem.mutate({
                                          id: item.id,
                                          isComplete: false,
                                        })
                                      }
                                    >
                                      <RotateCcw className="h-4 w-4 mr-2" />
                                      Undo
                                    </Button>
                                  )}
                                </div>
                                <div className="flex flex-col sm:flex-row gap-2">
                                  <Textarea
                                    value={itemNotes[item.id] ?? ""}
                                    onChange={(e) =>
                                      setItemNotes((current) => ({
                                        ...current,
                                        [item.id]: e.target.value,
                                      }))
                                    }
                                    placeholder="Task notes"
                                    className="min-h-10"
                                  />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="w-full sm:w-auto sm:self-start"
                                    onClick={() =>
                                      updateChecklistItem.mutate({
                                        id: item.id,
                                        notes: itemNotes[item.id] ?? "",
                                      })
                                    }
                                  >
                                    <CheckCircle2 className="h-4 w-4 mr-2" />
                                    Save
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
