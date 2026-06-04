import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  X,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  Minus,
  Save,
  FlaskConical,
  Percent,
} from "lucide-react";
import { type WhatIfRow, recalcRow } from "@/lib/what-if-calc";

// ─── Types ──────────────────────────────────────────────────────────

export interface WhatIfSku {
  skuId: number;
  skuName: string;
  currentStock: number;
  wipStock: number;
  dailyVelocity: number;
  parLevel: number;
  netBatchSize: number;
  leadTimeDays: number;
  committedQuantity: number;
  bufferDays: number;
}

interface WhatIfPanelProps {
  skus: WhatIfSku[];
  onClose: () => void;
  onApply: (velocities: Array<{ skuId: number; velocity: number }>) => void;
  isApplying?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────

function DeltaIndicator({ value, suffix = "" }: { value: number; suffix?: string }) {
  if (value === 0) return <Minus className="h-3 w-3 text-muted-foreground" />;
  const isUp = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isUp ? "text-red-600" : "text-green-600"}`}>
      {isUp ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(value).toLocaleString()}{suffix}
    </span>
  );
}

function DiffCell({ original, adjusted, suffix = "" }: { original: number; adjusted: number; suffix?: string }) {
  const changed = original !== adjusted;
  return (
    <div className="text-right tabular-nums">
      <span className={changed ? "font-semibold" : ""}>
        {adjusted === Infinity ? "--" : adjusted.toLocaleString()}{suffix}
      </span>
      {changed && original !== Infinity && (
        <span className="block text-xs text-muted-foreground line-through">
          {original.toLocaleString()}{suffix}
        </span>
      )}
    </div>
  );
}

// ─── Mobile card for a single What-If row ───────────────────────────

function WhatIfMobileCard({
  r,
  isOverridden,
  onOverride,
  onClearOverride,
}: {
  r: WhatIfRow;
  isOverridden: boolean;
  onOverride: (skuId: number, val: number) => void;
  onClearOverride: (skuId: number) => void;
}) {
  const changed = r.adjustedVelocity !== r.originalVelocity;
  return (
    <div className={`border rounded-lg p-3 space-y-2 ${changed ? "bg-primary/[0.03] border-primary/30" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Badge
            variant={r.urgency === "critical" ? "destructive" : "outline"}
            className={`text-[10px] px-1.5 shrink-0 ${
              r.urgency === "warning" ? "border-yellow-500 text-yellow-700 bg-yellow-50" :
              r.urgency === "ok" ? "border-primary/50 text-primary" : ""
            }`}
          >
            {r.urgency === "critical" ? "!" : r.urgency === "warning" ? "▼" : "✓"}
          </Badge>
          <span className="font-medium text-sm truncate">{r.skuName}</span>
        </div>
        <DeltaIndicator value={r.velocityDelta} suffix="%" />
      </div>

      {/* Velocity input */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-16 shrink-0">Vel/Day:</span>
        <Input
          type="number"
          step="0.1"
          min="0"
          value={r.adjustedVelocity}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val) && val >= 0) onOverride(r.skuId, val);
          }}
          className={`h-8 text-sm tabular-nums flex-1 ${isOverridden ? "border-primary ring-1 ring-primary/30" : ""}`}
        />
        {isOverridden && (
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => onClearOverride(r.skuId)}>
            <RotateCcw className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-2 text-xs min-[430px]:grid-cols-3">
        <div>
          <span className="text-muted-foreground block">Par Level</span>
          <DiffCell original={r.originalParLevel} adjusted={r.adjustedParLevel} />
        </div>
        <div>
          <span className="text-muted-foreground block">Stockout</span>
          <DiffCell original={r.originalDaysToStockout} adjusted={r.adjustedDaysToStockout} suffix=" d" />
        </div>
        <div>
          <span className="text-muted-foreground block">Batches</span>
          <DiffCell original={r.originalBatchesNeeded} adjusted={r.adjustedBatchesNeeded} />
        </div>
      </div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────

export function WhatIfPanel({ skus, onClose, onApply, isApplying }: WhatIfPanelProps) {
  const [bulkPercent, setBulkPercent] = useState(0);
  const [overrides, setOverrides] = useState<Record<number, number>>({});

  // Build rows: apply per-SKU overrides first, then bulk if no override
  const rows: WhatIfRow[] = useMemo(() => {
    const base = skus.map((s) => {
      const adjusted = overrides[s.skuId] ?? s.dailyVelocity;
      return recalcRow(
        s.skuId, s.skuName, s.currentStock, s.dailyVelocity,
        adjusted, s.netBatchSize, s.leadTimeDays, s.committedQuantity, s.bufferDays,
        s.wipStock,
      );
    });

    // Apply bulk % only to rows without manual overrides
    if (bulkPercent === 0) return base;
    return base.map((r) => {
      if (overrides[r.skuId] !== undefined) return r;
      const newVel = Math.max(0, r.originalVelocity * (1 + bulkPercent / 100));
      return recalcRow(
        r.skuId, r.skuName, r.currentStock, r.originalVelocity,
        Math.round(newVel * 100) / 100,
        r.netBatchSize, r.leadTimeDays, r.committedQuantity, r.bufferDays,
        r.wipStock,
      );
    });
  }, [skus, overrides, bulkPercent]);

  const hasChanges = rows.some((r) => r.adjustedVelocity !== r.originalVelocity);

  const handleReset = useCallback(() => {
    setOverrides({});
    setBulkPercent(0);
  }, []);

  const handleApply = useCallback(() => {
    const changed = rows
      .filter((r) => r.adjustedVelocity !== r.originalVelocity)
      .map((r) => ({ skuId: r.skuId, velocity: r.adjustedVelocity }));
    if (changed.length > 0) onApply(changed);
  }, [rows, onApply]);

  const handleOverride = useCallback((skuId: number, val: number) => {
    setOverrides((prev) => ({ ...prev, [skuId]: val }));
  }, []);

  const handleClearOverride = useCallback((skuId: number) => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[skuId];
      return next;
    });
  }, []);

  // Summary stats
  const summary = useMemo(() => {
    const critOriginal = rows.filter((r) => {
      const origStockout = r.originalDaysToStockout;
      return r.currentStock <= 0 || origStockout <= r.leadTimeDays;
    }).length;
    const critAdjusted = rows.filter((r) => r.urgency === "critical").length;
    const totalOrigBatches = rows.reduce((s, r) => s + r.originalBatchesNeeded, 0);
    const totalAdjBatches = rows.reduce((s, r) => s + r.adjustedBatchesNeeded, 0);
    return { critOriginal, critAdjusted, totalOrigBatches, totalAdjBatches };
  }, [rows]);

  return (
    <Card className="border-2 border-dashed border-primary/40 bg-primary/[0.02]">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            What-If Scratchpad
          </CardTitle>
          <div className="flex items-center gap-1 sm:gap-2">
            <Button variant="ghost" size="sm" onClick={handleReset} disabled={!hasChanges}>
              <RotateCcw className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Reset</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Bulk adjustment slider */}
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2">
            <Percent className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium whitespace-nowrap">
              Bulk: {bulkPercent > 0 ? "+" : ""}{bulkPercent}%
            </span>
          </div>
          <div className="flex items-center gap-2 flex-1">
            <Slider
              value={[bulkPercent]}
              onValueChange={([v]) => setBulkPercent(v)}
              min={-50}
              max={100}
              step={5}
              className="flex-1"
            />
            <Button
              variant="ghost"
              size="sm"
              className="text-xs shrink-0"
              onClick={() => setBulkPercent(0)}
            >
              0%
            </Button>
          </div>
        </div>

        {/* Impact summary */}
        {hasChanges && (
          <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-4 text-xs">
            <span className="text-muted-foreground">Impact:</span>
            <span>
              Critical: {summary.critOriginal} → {" "}
              <span className={summary.critAdjusted > summary.critOriginal ? "text-red-600 font-semibold" : summary.critAdjusted < summary.critOriginal ? "text-green-600 font-semibold" : ""}>
                {summary.critAdjusted}
              </span>
            </span>
            <span className="h-3 w-px bg-border" />
            <span>
              Batches: {summary.totalOrigBatches} → {" "}
              <span className={summary.totalAdjBatches > summary.totalOrigBatches ? "text-red-600 font-semibold" : summary.totalAdjBatches < summary.totalOrigBatches ? "text-green-600 font-semibold" : ""}>
                {summary.totalAdjBatches}
              </span>
            </span>
          </div>
        )}
      </CardHeader>

      <CardContent>
        {/* Desktop table — hidden on mobile */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 font-medium text-muted-foreground">SKU</th>
                <th className="pb-2 font-medium text-muted-foreground text-right">Available</th>
                <th className="pb-2 font-medium text-muted-foreground text-right">In Testing</th>
                <th className="pb-2 font-medium text-muted-foreground text-right">Projected</th>
                <th className="pb-2 font-medium text-muted-foreground text-center w-40">
                  Velocity/Day
                </th>
                <th className="pb-2 font-medium text-muted-foreground text-right">Par Level</th>
                <th className="pb-2 font-medium text-muted-foreground text-right">Days to Stockout</th>
                <th className="pb-2 font-medium text-muted-foreground text-right">Batches</th>
                <th className="pb-2 font-medium text-muted-foreground text-center w-16">Δ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isOverridden = overrides[r.skuId] !== undefined;
                return (
                  <tr
                    key={r.skuId}
                    className={`border-b last:border-0 transition-colors ${
                      r.adjustedVelocity !== r.originalVelocity ? "bg-primary/[0.03]" : ""
                    }`}
                  >
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={r.urgency === "critical" ? "destructive" : "outline"}
                          className={`text-[10px] px-1.5 ${
                            r.urgency === "warning" ? "border-yellow-500 text-yellow-700 bg-yellow-50" :
                            r.urgency === "ok" ? "border-primary/50 text-primary" : ""
                          }`}
                        >
                          {r.urgency === "critical" ? "!" : r.urgency === "warning" ? "▼" : "✓"}
                        </Badge>
                        <span className="font-medium">{r.skuName}</span>
                      </div>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {r.currentStock.toLocaleString()}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                      {r.wipStock > 0 ? r.wipStock.toLocaleString() : "--"}
                    </td>
                    <td className="py-2.5 text-right tabular-nums font-medium">
                      {r.projectedStock.toLocaleString()}
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center justify-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Input
                              type="number"
                              step="0.1"
                              min="0"
                              value={r.adjustedVelocity}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val) && val >= 0) handleOverride(r.skuId, val);
                              }}
                              className={`w-24 h-8 text-center text-sm tabular-nums ${
                                isOverridden ? "border-primary ring-1 ring-primary/30" : ""
                              }`}
                            />
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p className="text-xs">Original: {r.originalVelocity.toFixed(1)}/day</p>
                          </TooltipContent>
                        </Tooltip>
                        {isOverridden && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleClearOverride(r.skuId)}
                          >
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5">
                      <DiffCell original={r.originalParLevel} adjusted={r.adjustedParLevel} />
                    </td>
                    <td className="py-2.5">
                      <DiffCell
                        original={r.originalDaysToStockout}
                        adjusted={r.adjustedDaysToStockout}
                        suffix=" d"
                      />
                    </td>
                    <td className="py-2.5">
                      <DiffCell original={r.originalBatchesNeeded} adjusted={r.adjustedBatchesNeeded} />
                    </td>
                    <td className="py-2.5 text-center">
                      <DeltaIndicator value={r.velocityDelta} suffix="%" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile card layout */}
        <div className="md:hidden space-y-2">
          {rows.map((r) => (
            <WhatIfMobileCard
              key={r.skuId}
              r={r}
              isOverridden={overrides[r.skuId] !== undefined}
              onOverride={handleOverride}
              onClearOverride={handleClearOverride}
            />
          ))}
        </div>

        {/* Apply button */}
        {hasChanges && (
          <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-t pt-4">
            <p className="text-xs text-muted-foreground">
              {rows.filter((r) => r.adjustedVelocity !== r.originalVelocity).length} SKU(s) modified.
              Applying will save these as the new actual velocities.
            </p>
            <Button
              onClick={handleApply}
              disabled={isApplying}
              className="bg-primary hover:bg-primary/90 w-full sm:w-auto"
            >
              <Save className="h-4 w-4 mr-2" />
              {isApplying ? "Applying..." : "Apply Velocities"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
