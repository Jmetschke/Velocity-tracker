import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Pencil, Trash2, Loader2, Package } from "lucide-react";
import { useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

type Sku = inferRouterOutputs<AppRouter>["skus"]["list"][number];
import { toast } from "sonner";

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

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingSku, setEditingSku] = useState<Sku | null>(null);
  const [form, setForm] = useState({
    name: "",
    categoryId: "",
    dailyVelocity: "0",
    bufferDays: "14",
    leadTimeDays: "5",
    customBatchSize: "",
  });

  const resetForm = () =>
    setForm({
      name: "",
      categoryId: "",
      dailyVelocity: "0",
      bufferDays: "14",
      leadTimeDays: "5",
      customBatchSize: "",
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
    });
    setEditOpen(true);
  };

  const activeSkus = skuList?.filter((s) => s.isActive) ?? [];
  const inactiveSkus = skuList?.filter((s) => !s.isActive) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
            SKU Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage product SKUs, batch sizes, and production parameters.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm} size="sm" className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" /> Add SKU
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-xl">
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
                Create SKU
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Active SKUs ({activeSkus.length})
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
              <p>No SKUs yet. Add your first product above.</p>
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
              Inactive SKUs ({inactiveSkus.length})
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
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit SKU</DialogTitle>
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
