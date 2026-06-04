import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Loader2, Settings, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Categories() {
  const utils = trpc.useUtils();
  const { data: categories, isLoading } = trpc.categories.list.useQuery();
  const createCategory = trpc.categories.create.useMutation({
    onSuccess: () => {
      utils.categories.list.invalidate();
      toast.success("Category created");
      setCreateOpen(false);
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateCategory = trpc.categories.update.useMutation({
    onSuccess: () => {
      utils.categories.list.invalidate();
      toast.success("Category updated");
      setEditOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteCategory = trpc.categories.delete.useMutation({
    onSuccess: () => {
      utils.categories.list.invalidate();
      toast.success("Category deleted");
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<{ id: number; name: string; theoreticalBatchSize: number; lossPercent: string | number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [form, setForm] = useState({
    name: "",
    theoreticalBatchSize: "",
    lossPercent: "5",
  });

  const resetForm = () =>
    setForm({ name: "", theoreticalBatchSize: "", lossPercent: "5" });

  const netPreview = () => {
    const theoretical = parseInt(form.theoreticalBatchSize) || 0;
    const loss = parseFloat(form.lossPercent) || 0;
    return Math.floor(theoretical * (1 - loss / 100));
  };

  const handleCreate = () => {
    if (!form.name || !form.theoreticalBatchSize) {
      toast.error("Name and batch size are required");
      return;
    }
    createCategory.mutate({
      name: form.name,
      theoreticalBatchSize: parseInt(form.theoreticalBatchSize),
      lossPercent: parseFloat(form.lossPercent) || 5,
    });
  };

  const handleEdit = () => {
    if (!editingCat) return;
    updateCategory.mutate({
      id: editingCat.id,
      name: form.name || undefined,
      theoreticalBatchSize: form.theoreticalBatchSize
        ? parseInt(form.theoreticalBatchSize)
        : undefined,
      lossPercent:
        form.lossPercent !== "" ? parseFloat(form.lossPercent) : undefined,
    });
  };

  const openEdit = (cat: { id: number; name: string; theoreticalBatchSize: number; lossPercent: string | number }) => {
    setEditingCat(cat);
    setForm({
      name: cat.name,
      theoreticalBatchSize: String(cat.theoreticalBatchSize),
      lossPercent: String(cat.lossPercent),
    });
    setEditOpen(true);
  };

  // ─── Shared form fields (used in both create and edit dialogs) ────
  const formFields = (
    <div className="space-y-4 mt-2">
      <div>
        <Label>Category Name</Label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g., Chunks, Minis, Vapes"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label>Theoretical Batch Size</Label>
          <Input
            type="number"
            value={form.theoreticalBatchSize}
            onChange={(e) =>
              setForm({ ...form, theoreticalBatchSize: e.target.value })
            }
            placeholder="e.g., 7500"
          />
        </div>
        <div>
          <Label>Loss % (default 5%)</Label>
          <Input
            type="number"
            step="0.1"
            value={form.lossPercent}
            onChange={(e) =>
              setForm({ ...form, lossPercent: e.target.value })
            }
          />
        </div>
      </div>
      <div className="bg-muted/50 rounded-lg p-3 text-sm">
        <p className="text-muted-foreground">
          Net batch size after {form.lossPercent || 5}% loss:{" "}
          <span className="font-semibold text-foreground">
            {netPreview().toLocaleString()} units
          </span>
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
            Batch Categories
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage categories and default batch sizes. Loss factor is applied automatically.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm} size="sm" className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" /> Add Category
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add New Category</DialogTitle>
            </DialogHeader>
            {formFields}
            <Button
              onClick={handleCreate}
              disabled={createCategory.isPending}
              className="w-full"
            >
              {createCategory.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Create Category
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Categories
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !categories?.length ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No categories yet. Add your first category above.
            </p>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-3 font-medium text-muted-foreground">Name</th>
                      <th className="pb-3 font-medium text-muted-foreground text-right">Theoretical</th>
                      <th className="pb-3 font-medium text-muted-foreground text-right">Loss %</th>
                      <th className="pb-3 font-medium text-muted-foreground text-right">Net Batch</th>
                      <th className="pb-3 font-medium text-muted-foreground text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((cat) => (
                      <tr key={cat.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-3 font-medium text-foreground">{cat.name}</td>
                        <td className="py-3 text-right tabular-nums">{cat.theoreticalBatchSize.toLocaleString()}</td>
                        <td className="py-3 text-right tabular-nums">{cat.lossPercent}%</td>
                        <td className="py-3 text-right tabular-nums font-medium">{cat.netBatchSize.toLocaleString()}</td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(cat)}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget({ id: cat.id, name: cat.name })}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card layout */}
              <div className="sm:hidden space-y-2">
                {categories.map((cat) => (
                  <div key={cat.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate font-medium text-sm">{cat.name}</span>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(cat)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget({ id: cat.id, name: cat.name })}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs min-[430px]:grid-cols-3">
                      <div><span className="text-muted-foreground block">Theoretical</span><span className="tabular-nums">{cat.theoreticalBatchSize.toLocaleString()}</span></div>
                      <div><span className="text-muted-foreground block">Loss</span><span className="tabular-nums">{cat.lossPercent}%</span></div>
                      <div><span className="text-muted-foreground block">Net Batch</span><span className="tabular-nums font-medium">{cat.netBatchSize.toLocaleString()}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
          </DialogHeader>
          {formFields}
          <Button
            onClick={handleEdit}
            disabled={updateCategory.isPending}
            className="w-full"
          >
            {updateCategory.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Save Changes
          </Button>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete Category
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This will also remove all SKUs associated with this category. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="w-full sm:w-auto"
              onClick={() => deleteTarget && deleteCategory.mutate({ id: deleteTarget.id })}
              disabled={deleteCategory.isPending}
            >
              {deleteCategory.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
