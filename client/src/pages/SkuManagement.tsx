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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Package,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

type Sku = inferRouterOutputs<AppRouter>["skus"]["list"][number];
import { toast } from "sonner";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });
}

export default function SkuManagement() {
  const utils = trpc.useUtils();
  const { data: skuList, isLoading } = trpc.skus.list.useQuery();
  const { data: categories } = trpc.categories.list.useQuery();
  const createSku = trpc.skus.create.useMutation({
    onSuccess: () => {
      utils.skus.list.invalidate();
      toast.success("SKU created successfully");
      setCreateOpen(false);
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateSku = trpc.skus.update.useMutation({
    onSuccess: () => {
      utils.skus.list.invalidate();
      toast.success("SKU updated");
      setEditOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteSku = trpc.skus.delete.useMutation({
    onSuccess: () => {
      utils.skus.list.invalidate();
      toast.success("SKU deactivated");
    },
    onError: (e) => toast.error(e.message),
  });
  const previewImport = trpc.skus.previewProductionItemKey.useMutation({
    onSuccess: () => setImportOpen(true),
    onError: (e) => toast.error(e.message),
  });
  const importItems = trpc.skus.importProductionItemKey.useMutation({
    onSuccess: (result) => {
      utils.skus.list.invalidate();
      toast.success(
        `Import complete: ${result.created} added, ${result.updated} updated`,
      );
      setImportOpen(false);
      setPendingImport(null);
      previewImport.reset();
    },
    onError: (e) => toast.error(e.message),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<{
    fileBase64: string;
    fileName: string;
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [editingSku, setEditingSku] = useState<Sku | null>(null);
  const [form, setForm] = useState({
    name: "",
    categoryId: "",
    dailyVelocity: "0",
    bufferDays: "14",
    leadTimeDays: "5",
    customBatchSize: "",
    metrcItemNames: "",
  });

  const resetForm = () =>
    setForm({
      name: "",
      categoryId: "",
      dailyVelocity: "0",
      bufferDays: "14",
      leadTimeDays: "5",
      customBatchSize: "",
      metrcItemNames: "",
    });

  const handleCreate = () => {
    if (!form.name || !form.categoryId) {
      toast.error("Name and category are required");
      return;
    }
    createSku.mutate({
      name: form.name,
      categoryId: parseInt(form.categoryId),
      dailyVelocity: parseFloat(form.dailyVelocity) || 0,
      bufferDays: parseInt(form.bufferDays) || 14,
      leadTimeDays: parseInt(form.leadTimeDays) || 5,
      customBatchSize: form.customBatchSize
        ? parseInt(form.customBatchSize)
        : undefined,
      metrcItemNames: form.metrcItemNames,
    });
  };

  const handleEdit = () => {
    if (!editingSku) return;
    updateSku.mutate({
      id: editingSku.id,
      name: form.name || undefined,
      categoryId: form.categoryId ? parseInt(form.categoryId) : undefined,
      bufferDays: form.bufferDays ? parseInt(form.bufferDays) : undefined,
      leadTimeDays: form.leadTimeDays
        ? parseInt(form.leadTimeDays)
        : undefined,
      customBatchSize: form.customBatchSize
        ? parseInt(form.customBatchSize)
        : null,
      metrcItemNames: form.metrcItemNames,
    });
  };

  const openEdit = (sku: Sku) => {
    setEditingSku(sku);
    setForm({
      name: sku.name,
      categoryId: String(sku.categoryId),
      dailyVelocity: String(sku.dailyVelocity ?? 0),
      bufferDays: String(sku.bufferDays ?? 14),
      leadTimeDays: String(sku.leadTimeDays ?? 5),
      customBatchSize: sku.customBatchSize ? String(sku.customBatchSize) : "",
      metrcItemNames: sku.metrcItemNames ?? "",
    });
    setEditOpen(true);
  };

  const activeSkus = skuList?.filter((s) => s.isActive) ?? [];
  const inactiveSkus = skuList?.filter((s) => !s.isActive) ?? [];

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      toast.error("Please choose an Excel workbook (.xlsx).");
      return;
    }
    try {
      const upload = { fileBase64: await fileToBase64(file), fileName: file.name };
      setPendingImport(upload);
      previewImport.mutate(upload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read file.");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const previewRows = previewImport.data?.rows ?? [];
  const newItemCount = previewRows.filter(row => row.status === "new").length;
  const matchedItemCount = previewRows.length - newItemCount;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
            Production Items
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage product items, batch sizes, and METRC import names.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={event => handleImportFile(event.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            disabled={previewImport.isPending}
            onClick={() => importInputRef.current?.click()}
          >
            {previewImport.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Import Item Key
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm} size="sm" className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" /> Add SKU
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Add New SKU</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label>Product Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Alpha Chunk - 2pk"
                />
              </div>
              <div>
                <Label>METRC Item Names</Label>
                <Textarea
                  value={form.metrcItemNames}
                  onChange={(e) =>
                    setForm({ ...form, metrcItemNames: e.target.value })
                  }
                  placeholder="Enter each METRC item name on its own line"
                  className="min-h-24"
                />
              </div>
              <div>
                <Label>Category</Label>
                <Select
                  value={form.categoryId}
                  onValueChange={(v) => setForm({ ...form, categoryId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories?.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name} (Net: {c.netBatchSize.toLocaleString()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label>Daily Velocity</Label>
                  <Input
                    type="number"
                    value={form.dailyVelocity}
                    onChange={(e) =>
                      setForm({ ...form, dailyVelocity: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Buffer Days</Label>
                  <Input
                    type="number"
                    value={form.bufferDays}
                    onChange={(e) =>
                      setForm({ ...form, bufferDays: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label>Lead Time (Days)</Label>
                  <Input
                    type="number"
                    value={form.leadTimeDays}
                    onChange={(e) =>
                      setForm({ ...form, leadTimeDays: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Custom Batch Size (optional)</Label>
                  <Input
                    type="number"
                    value={form.customBatchSize}
                    onChange={(e) =>
                      setForm({ ...form, customBatchSize: e.target.value })
                    }
                    placeholder="Override category default"
                  />
                </div>
              </div>
              <Button
                onClick={handleCreate}
                disabled={createSku.isPending}
                className="w-full"
              >
                {createSku.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Create Production Item
              </Button>
            </div>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Review Production Item Import</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge>{newItemCount} new items</Badge>
              <Badge variant="outline">{matchedItemCount} matched items</Badge>
              <span className="text-muted-foreground">
                {pendingImport?.fileName}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              New common names will be added as Production Items. Matched items
              will keep their current name and receive the METRC names below.
            </p>
            <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
              {previewRows.map(row => (
                <div
                  key={`${row.sourceRow}-${row.commonName}`}
                  className="rounded-lg border p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{row.commonName}</div>
                      {row.matchedSkuName ? (
                        <div className="text-xs text-muted-foreground">
                          Matches existing item: {row.matchedSkuName}
                        </div>
                      ) : null}
                    </div>
                    <Badge variant={row.status === "new" ? "default" : "outline"}>
                      {row.status === "new" ? "Will add" : "Will update"}
                    </Badge>
                  </div>
                  <div className="mt-2 whitespace-pre-line text-xs text-muted-foreground">
                    {row.metrcItemNames.length > 0
                      ? row.metrcItemNames.join("\n")
                      : "No METRC names supplied"}
                  </div>
                  {row.batchSize ? (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Batch size: {row.batchSize.toLocaleString()}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <Button
              className="w-full"
              disabled={!pendingImport || importItems.isPending}
              onClick={() => pendingImport && importItems.mutate(pendingImport)}
            >
              {importItems.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Import {previewRows.length} Production Items
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Active Production Items ({activeSkus.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : activeSkus.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No production items yet. Add your first product above.</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-3 font-medium text-muted-foreground">Name</th>
                      <th className="pb-3 font-medium text-muted-foreground">Category</th>
                      <th className="pb-3 font-medium text-muted-foreground">METRC Names</th>
                      <th className="pb-3 font-medium text-muted-foreground text-right">Vel/Day</th>
                      <th className="pb-3 font-medium text-muted-foreground text-right">Par</th>
                      <th className="pb-3 font-medium text-muted-foreground text-right">Batch</th>
                      <th className="pb-3 font-medium text-muted-foreground text-right">Buffer</th>
                      <th className="pb-3 font-medium text-muted-foreground text-right">Lead</th>
                      <th className="pb-3 font-medium text-muted-foreground">Source</th>
                      <th className="pb-3 font-medium text-muted-foreground text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeSkus.map((sku) => (
                      <tr key={sku.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-3 font-medium text-foreground">{sku.name}</td>
                        <td className="py-3 text-muted-foreground">{sku.categoryName}</td>
                        <td className="py-3 text-muted-foreground max-w-[260px]">
                          {sku.metrcItemNames ? (
                            <span className="line-clamp-2 whitespace-pre-line text-xs">
                              {sku.metrcItemNames}
                            </span>
                          ) : (
                            <span className="text-xs italic">Uses default mapping</span>
                          )}
                        </td>
                        <td className="py-3 text-right tabular-nums">{parseFloat(String(sku.dailyVelocity ?? 0)).toFixed(1)}</td>
                        <td className="py-3 text-right tabular-nums">{(sku.parLevel ?? 0).toLocaleString()}</td>
                        <td className="py-3 text-right tabular-nums">{(sku.customBatchSize ?? sku.netBatchSize ?? 0).toLocaleString()}</td>
                        <td className="py-3 text-right tabular-nums">{sku.bufferDays}d</td>
                        <td className="py-3 text-right tabular-nums">{sku.leadTimeDays}d</td>
                        <td className="py-3"><Badge variant="outline" className="text-xs">{sku.velocitySource}</Badge></td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(sku)}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteSku.mutate({ id: sku.id })}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card layout */}
              <div className="lg:hidden space-y-2">
                {activeSkus.map((sku) => (
                  <div key={sku.id} className="border rounded-lg p-3 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-sm truncate flex-1 mr-2">{sku.name}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(sku)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteSku.mutate({ id: sku.id })}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-muted-foreground truncate">{sku.categoryName}</span>
                      <Badge variant="outline" className="text-[10px]">{sku.velocitySource}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <span className="block font-medium text-foreground">METRC Names</span>
                      {sku.metrcItemNames ? (
                        <span className="whitespace-pre-line">{sku.metrcItemNames}</span>
                      ) : (
                        <span className="italic">Uses default mapping</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs min-[430px]:grid-cols-3">
                      <div><span className="text-muted-foreground block">Vel/Day</span><span className="tabular-nums">{parseFloat(String(sku.dailyVelocity ?? 0)).toFixed(1)}</span></div>
                      <div><span className="text-muted-foreground block">Par Level</span><span className="tabular-nums">{(sku.parLevel ?? 0).toLocaleString()}</span></div>
                      <div><span className="text-muted-foreground block">Batch</span><span className="tabular-nums">{(sku.customBatchSize ?? sku.netBatchSize ?? 0).toLocaleString()}</span></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-muted-foreground">Buffer:</span> <span className="tabular-nums">{sku.bufferDays}d</span></div>
                      <div><span className="text-muted-foreground">Lead:</span> <span className="tabular-nums">{sku.leadTimeDays}d</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {inactiveSkus.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-muted-foreground">
              Inactive Production Items ({inactiveSkus.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {inactiveSkus.map((sku) => (
                <div key={sku.id} className="flex flex-col gap-2 border-b py-2 last:border-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 opacity-70">
                    <p className="truncate text-sm font-medium">{sku.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{sku.categoryName}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={() =>
                      updateSku.mutate({
                        id: sku.id,
                        isActive: true,
                      })
                    }
                  >
                    Reactivate
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Production Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Product Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Category</Label>
              <Select
                value={form.categoryId}
                onValueChange={(v) => setForm({ ...form, categoryId: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories?.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name} (Net: {c.netBatchSize.toLocaleString()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>METRC Item Names</Label>
              <Textarea
                value={form.metrcItemNames}
                onChange={(e) =>
                  setForm({ ...form, metrcItemNames: e.target.value })
                }
                placeholder="Enter each METRC item name on its own line"
                className="min-h-24"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Buffer Days</Label>
                <Input
                  type="number"
                  value={form.bufferDays}
                  onChange={(e) =>
                    setForm({ ...form, bufferDays: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Lead Time (Days)</Label>
                <Input
                  type="number"
                  value={form.leadTimeDays}
                  onChange={(e) =>
                    setForm({ ...form, leadTimeDays: e.target.value })
                  }
                />
              </div>
            </div>
            <div>
              <Label>Custom Batch Size (optional)</Label>
              <Input
                type="number"
                value={form.customBatchSize}
                onChange={(e) =>
                  setForm({ ...form, customBatchSize: e.target.value })
                }
                placeholder="Leave blank to use category default"
              />
            </div>
            <Button
              onClick={handleEdit}
              disabled={updateSku.isPending}
              className="w-full"
            >
              {updateSku.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
