import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  TrendingUp,
  Save,
  Loader2,
  History,
  RotateCcw,
  Rocket,
} from "lucide-react";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { format } from "date-fns";

export default function VelocityPar() {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const { data: skuList, isLoading } = trpc.skus.list.useQuery();
  const { data: velocityHistoryData } = trpc.sales.velocityHistory.useQuery();
  const updateVelocity = trpc.skus.updateVelocity.useMutation({
    onSuccess: () => {
      utils.skus.list.invalidate();
      utils.production.suggestions.invalidate();
      utils.sales.velocityHistory.invalidate();
      toast.success("Velocity updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const activeSkus = useMemo(
    () => skuList?.filter((s) => s.isActive) ?? [],
    [skuList]
  );

  const handleSaveVelocity = (skuId: number) => {
    const velocity = parseFloat(editValue);
    if (isNaN(velocity) || velocity < 0) {
      toast.error("Please enter a valid velocity");
      return;
    }
    updateVelocity.mutate({ id: skuId, velocity, source: "manual" });
    setEditingId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
            Velocity & Par Levels
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Adjust daily velocities. Par = velocity x buffer days.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => setLocation("/product-launch-roadmap")}>
            <Rocket className="h-4 w-4 mr-2" />
            Product Launch
          </Button>
          <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => setShowHistory(!showHistory)}>
            <History className="h-4 w-4 mr-2" />
            {showHistory ? "Hide History" : "Show History"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            SKU Velocities
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-3 font-medium text-muted-foreground">SKU</th>
                      <th className="pb-3 font-medium text-muted-foreground">Category</th>
                      <th className="pb-3 font-medium text-muted-foreground text-right">Velocity</th>
                      <th className="pb-3 font-medium text-muted-foreground">Source</th>
                      <th className="pb-3 font-medium text-muted-foreground text-right">Buffer</th>
                      <th className="pb-3 font-medium text-muted-foreground text-right">Par Level</th>
                      <th className="pb-3 font-medium text-muted-foreground text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeSkus.map((sku) => (
                      <tr key={sku.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-3 font-medium text-foreground">{sku.name}</td>
                        <td className="py-3 text-muted-foreground">{sku.categoryName}</td>
                        <td className="py-3 text-right">
                          {editingId === sku.id ? (
                            <div className="flex items-center justify-end gap-2">
                              <Input type="number" step="0.1" value={editValue} onChange={(e) => setEditValue(e.target.value)} className="w-24 h-8 text-right" autoFocus onKeyDown={(e) => { if (e.key === "Enter") handleSaveVelocity(sku.id); if (e.key === "Escape") setEditingId(null); }} />
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleSaveVelocity(sku.id)} disabled={updateVelocity.isPending}><Save className="h-3.5 w-3.5" /></Button>
                            </div>
                          ) : (
                            <span className="tabular-nums">{parseFloat(String(sku.dailyVelocity ?? 0)).toFixed(1)}</span>
                          )}
                        </td>
                        <td className="py-3">
                          <Badge variant="outline" className={`text-xs ${sku.velocitySource === "ai" ? "border-primary/50 text-primary" : sku.velocitySource === "manual" ? "border-yellow-500/50 text-yellow-700" : ""}`}>{sku.velocitySource}</Badge>
                        </td>
                        <td className="py-3 text-right tabular-nums">{sku.bufferDays}d</td>
                        <td className="py-3 text-right tabular-nums font-medium">{(sku.parLevel ?? 0).toLocaleString()}</td>
                        <td className="py-3 text-right">
                          {editingId === sku.id ? (
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => { setEditingId(sku.id); setEditValue(String(parseFloat(String(sku.dailyVelocity ?? 0)))); }}>Edit</Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card layout */}
              <div className="md:hidden space-y-2">
                {activeSkus.map((sku) => (
                  <div key={sku.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-sm truncate flex-1 mr-2">{sku.name}</span>
                      {editingId === sku.id ? (
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setEditingId(sku.id); setEditValue(String(parseFloat(String(sku.dailyVelocity ?? 0)))); }}>Edit</Button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-muted-foreground truncate">{sku.categoryName}</span>
                      <Badge variant="outline" className={`text-[10px] ${sku.velocitySource === "ai" ? "border-primary/50 text-primary" : sku.velocitySource === "manual" ? "border-yellow-500/50 text-yellow-700" : ""}`}>{sku.velocitySource}</Badge>
                    </div>
                    {editingId === sku.id ? (
                      <div className="flex items-center gap-2">
                        <Input type="number" step="0.1" value={editValue} onChange={(e) => setEditValue(e.target.value)} className="h-8 text-sm" autoFocus onKeyDown={(e) => { if (e.key === "Enter") handleSaveVelocity(sku.id); if (e.key === "Escape") setEditingId(null); }} />
                        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => handleSaveVelocity(sku.id)} disabled={updateVelocity.isPending}><Save className="h-3.5 w-3.5" /></Button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 text-xs min-[430px]:grid-cols-3">
                        <div><span className="text-muted-foreground block">Velocity</span><span className="tabular-nums">{parseFloat(String(sku.dailyVelocity ?? 0)).toFixed(1)}/day</span></div>
                        <div><span className="text-muted-foreground block">Buffer</span><span className="tabular-nums">{sku.bufferDays}d</span></div>
                        <div><span className="text-muted-foreground block">Par Level</span><span className="tabular-nums font-medium">{(sku.parLevel ?? 0).toLocaleString()}</span></div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Velocity History */}
      {showHistory && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="h-5 w-5 text-muted-foreground" />
              Velocity Change History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!velocityHistoryData?.length ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No velocity changes recorded yet.
              </p>
            ) : (
              <>
                {/* Desktop history table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-3 font-medium text-muted-foreground">Date</th>
                        <th className="pb-3 font-medium text-muted-foreground">SKU</th>
                        <th className="pb-3 font-medium text-muted-foreground text-right">Velocity</th>
                        <th className="pb-3 font-medium text-muted-foreground">Source</th>
                        <th className="pb-3 font-medium text-muted-foreground">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {velocityHistoryData.slice(0, 50).map((h) => (
                        <tr key={h.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2 text-muted-foreground text-xs">{format(new Date(h.recordedAt), "MMM d, yyyy h:mm a")}</td>
                          <td className="py-2 font-medium text-foreground">{h.skuName}</td>
                          <td className="py-2 text-right tabular-nums">{parseFloat(String(h.dailyVelocity)).toFixed(1)}</td>
                          <td className="py-2"><Badge variant="outline" className="text-xs">{h.source}</Badge></td>
                          <td className="py-2 text-muted-foreground text-xs">{h.notes || "--"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile history cards */}
                <div className="md:hidden space-y-2">
                  {velocityHistoryData.slice(0, 50).map((h) => (
                    <div key={h.id} className="border rounded-lg p-2.5 flex flex-col gap-2 min-[380px]:flex-row min-[380px]:items-center min-[380px]:justify-between">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{h.skuName}</div>
                        <div className="text-[10px] text-muted-foreground">{format(new Date(h.recordedAt), "MMM d, h:mm a")}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="tabular-nums text-sm">{parseFloat(String(h.dailyVelocity)).toFixed(1)}</span>
                        <Badge variant="outline" className="text-[10px]">{h.source}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
