import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle,
  XCircle,
  TrendingUp,
  ShieldCheck,
  Package,
  AlertTriangle,
  BookOpen,
} from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ValidationReport, type ValidationResult } from "@/components/ValidationReport";

interface QbParseResult {
  totalRows: number;
  matchedItems: number;
  excludedRows: number;
  unmatchedRows: Array<{ name: string; reason: string }>;
  months: string[];
}

interface AiVelocity {
  skuName: string;
  dailyVelocity: number;
  monthsAnalyzed: number;
  totalUnits: number;
  notes: string;
}

interface AiAnalysis {
  summary: string;
  velocities: AiVelocity[];
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface MetrcResult {
  snapshotId: number;
  matchedItems: number;
  totalRows: number;
  includedRows: number;
  excludedRows: number;
  unmatchedNames: string[];
  unmatchedRows: Array<{ item: string; qty: number; reason: string }>;
  parsedItems: Array<{ skuName: string; available: number; wip: number }>;
}

export default function UploadData() {
  const utils = trpc.useUtils();

  // ─── METRC Upload ────────────────────────────────────────────────
  const [metrcFile, setMetrcFile] = useState<File | null>(null);
  const [metrcResult, setMetrcResult] = useState<MetrcResult | null>(null);
  const metrcRef = useRef<HTMLInputElement>(null);

  const [metrcValidation, setMetrcValidation] = useState<ValidationResult | null>(null);
  const [invValidation, setInvValidation] = useState<ValidationResult | null>(null);
  const [qbValidation, setQbValidation] = useState<ValidationResult | null>(null);

  const metrcUpload = trpc.inventory.uploadMetrc.useMutation({
    onSuccess: (data) => {
      setMetrcValidation(data.validation ?? null);
      if (data.validation && !data.validation.valid) {
        toast.error("METRC upload blocked — validation errors found");
        setMetrcFile(null);
        return;
      }
      utils.inventory.latestSnapshot.invalidate();
      utils.inventory.allSnapshots.invalidate();
      utils.production.suggestions.invalidate();
      setMetrcResult(data as MetrcResult);
      const unmatchedCount = data.unmatchedNames?.length ?? 0;
      if (unmatchedCount > 0) {
        toast.success(
          `METRC parsed: ${data.matchedItems} SKUs matched, ${unmatchedCount} unmatched`
        );
      } else {
        toast.success(
          `METRC parsed: ${data.matchedItems} SKUs matched successfully`
        );
      }
      setMetrcFile(null);
    },
    onError: (e) => toast.error("METRC upload failed: " + e.message),
  });

  // ─── Inventory Upload (legacy format) ────────────────────────────
  const [inventoryFile, setInventoryFile] = useState<File | null>(null);
  const invRef = useRef<HTMLInputElement>(null);

  const inventoryUpload = trpc.inventory.upload.useMutation({
    onSuccess: (data) => {
      setInvValidation(data.validation ?? null);
      if (data.validation && !data.validation.valid) {
        toast.error("Inventory upload blocked — validation errors found");
        setInventoryFile(null);
        return;
      }
      utils.inventory.latestSnapshot.invalidate();
      utils.inventory.allSnapshots.invalidate();
      utils.production.suggestions.invalidate();
      if (data.unmatchedNames && data.unmatchedNames.length > 0) {
        toast.success(
          `Inventory uploaded: ${data.matchedItems}/${data.totalParsed} SKUs matched. Unmatched: ${data.unmatchedNames.join(", ")}`
        );
      } else {
        toast.success(
          `Inventory uploaded: ${data.matchedItems}/${data.totalParsed} SKUs matched successfully`
        );
      }
      setInventoryFile(null);
    },
    onError: (e) => toast.error("Upload failed: " + e.message),
  });

  // ─── QuickBooks Sales Upload ──────────────────────────────────────
  const [qbFile, setQbFile] = useState<File | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysis | null>(null);
  const [qbParseResult, setQbParseResult] = useState<QbParseResult | null>(null);
  const qbRef = useRef<HTMLInputElement>(null);

  const qbUpload = trpc.sales.uploadQuickBooks.useMutation({
    onSuccess: (data) => {
      setQbValidation(data.validation ?? null);
      setQbParseResult(data.parseResult);
      if (data.status === "validation_failed") {
        toast.error("QuickBooks upload blocked — validation errors found");
        setQbFile(null);
        return;
      }
      utils.sales.uploads.invalidate();
      utils.skus.list.invalidate();
      utils.production.suggestions.invalidate();
      if (data.status === "completed") {
        toast.success("QuickBooks sales analyzed. Velocities updated.");
        setAiAnalysis(data.analysis);
      } else {
        toast.error("AI analysis failed: " + (data.error || "Unknown error"));
      }
      setQbFile(null);
    },
    onError: (e) => toast.error("QB upload failed: " + e.message),
  });

  // ─── Legacy Sales Upload ────────────────────────────────────────
  const [salesFile, setSalesFile] = useState<File | null>(null);
  const salesRef = useRef<HTMLInputElement>(null);

  const salesUpload = trpc.sales.upload.useMutation({
    onSuccess: (data) => {
      utils.sales.uploads.invalidate();
      utils.skus.list.invalidate();
      utils.production.suggestions.invalidate();
      if (data.status === "completed") {
        toast.success("Sales data analyzed successfully. Velocities updated.");
        setAiAnalysis(data.analysis);
      } else {
        toast.error("AI analysis failed: " + (data.error || "Unknown error"));
      }
      setSalesFile(null);
    },
    onError: (e) => toast.error("Upload failed: " + e.message),
  });

  const { data: snapshots } = trpc.inventory.allSnapshots.useQuery();
  const { data: salesUploads } = trpc.sales.uploads.useQuery();

  const handleMetrcUpload = async () => {
    if (!metrcFile) return;
    const base64 = await fileToBase64(metrcFile);
    metrcUpload.mutate({ fileBase64: base64, fileName: metrcFile.name });
  };

  const handleInventoryUpload = async () => {
    if (!inventoryFile) return;
    const base64 = await fileToBase64(inventoryFile);
    inventoryUpload.mutate({
      fileBase64: base64,
      fileName: inventoryFile.name,
    });
  };

  const handleQbUpload = async () => {
    if (!qbFile) return;
    const base64 = await fileToBase64(qbFile);
    qbUpload.mutate({ fileBase64: base64, fileName: qbFile.name });
  };

  const handleSalesUpload = async () => {
    if (!salesFile) return;
    const base64 = await fileToBase64(salesFile);
    salesUpload.mutate({ fileBase64: base64, fileName: salesFile.name });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
          Upload Data
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload METRC exports, inventory snapshots, and sales data.
        </p>
      </div>

      {/* METRC Upload - Primary */}
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            METRC Export
            <Badge variant="default" className="text-xs ml-2">
              Recommended
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload your METRC "Packages - Active" export (.xlsx). The parser
            automatically identifies finished goods, separates available
            inventory from work-in-progress, and maps METRC item names to your
            SKUs.
          </p>
          <div
            className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => metrcRef.current?.click()}
          >
            <input
              ref={metrcRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                setMetrcFile(e.target.files?.[0] ?? null);
                setMetrcResult(null);
              }}
            />
            {metrcFile ? (
              <div className="flex items-center justify-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium text-foreground">
                  {metrcFile.name}
                </span>
              </div>
            ) : (
              <div>
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Click to select a METRC Packages export
                </p>
              </div>
            )}
          </div>
          <Button
            onClick={handleMetrcUpload}
            disabled={!metrcFile || metrcUpload.isPending}
            className="w-full"
          >
            {metrcUpload.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Parsing METRC data...
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4 mr-2" />
                Upload METRC Export
              </>
            )}
          </Button>
          <ValidationReport validation={metrcValidation} />
        </CardContent>
      </Card>

      {/* METRC Parse Results */}
      {metrcResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-primary" />
              METRC Parse Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold text-foreground">
                  {metrcResult.totalRows}
                </p>
                <p className="text-xs text-muted-foreground">Total Rows</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold text-primary">
                  {metrcResult.matchedItems}
                </p>
                <p className="text-xs text-muted-foreground">SKUs Matched</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold text-foreground">
                  {metrcResult.includedRows}
                </p>
                <p className="text-xs text-muted-foreground">Rows Included</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold text-muted-foreground">
                  {metrcResult.excludedRows}
                </p>
                <p className="text-xs text-muted-foreground">Rows Excluded</p>
              </div>
            </div>

            {/* Parsed Items Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 font-medium text-muted-foreground">
                      SKU
                    </th>
                    <th className="pb-3 font-medium text-muted-foreground text-right">
                      <span className="flex items-center justify-end gap-1">
                        <Package className="h-3.5 w-3.5" />
                        Available
                      </span>
                    </th>
                    <th className="pb-3 font-medium text-muted-foreground text-right">
                      WIP
                    </th>
                    <th className="pb-3 font-medium text-muted-foreground text-right">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {metrcResult.parsedItems.map((item, i) => (
                    <tr
                      key={i}
                      className="border-b last:border-0 hover:bg-muted/30"
                    >
                      <td className="py-3 font-medium text-foreground">
                        {item.skuName}
                      </td>
                      <td className="py-3 text-right tabular-nums font-medium text-primary">
                        {item.available.toLocaleString()}
                      </td>
                      <td className="py-3 text-right tabular-nums text-amber-600">
                        {item.wip > 0 ? item.wip.toLocaleString() : "—"}
                      </td>
                      <td className="py-3 text-right tabular-nums">
                        {(item.available + item.wip).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Unmatched warnings */}
            {metrcResult.unmatchedNames.length > 0 && (
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      Unmatched SKUs
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                      These items were parsed but could not be matched to
                      existing SKUs. You may need to add them in SKU Management.
                    </p>
                    <ul className="mt-2 space-y-1">
                      {metrcResult.unmatchedNames.map((name, i) => (
                        <li
                          key={i}
                          className="text-xs text-amber-700 dark:text-amber-300"
                        >
                          {name}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {metrcResult.unmatchedRows.length > 0 && (
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm font-medium text-muted-foreground mb-2">
                  Unmatched METRC Rows
                </p>
                <div className="space-y-1">
                  {metrcResult.unmatchedRows.map((row, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      "{row.item}" (qty: {row.qty}) — {row.reason}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Legacy Inventory Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Inventory Snapshot (Manual)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload a custom inventory report (.xlsx) if not using METRC
              export.
            </p>
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => invRef.current?.click()}
            >
              <input
                ref={invRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) =>
                  setInventoryFile(e.target.files?.[0] ?? null)
                }
              />
              {inventoryFile ? (
                <div className="flex items-center justify-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium text-foreground">
                    {inventoryFile.name}
                  </span>
                </div>
              ) : (
                <div>
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    Click to select an inventory spreadsheet
                  </p>
                </div>
              )}
            </div>
            <Button
              onClick={handleInventoryUpload}
              disabled={!inventoryFile || inventoryUpload.isPending}
              className="w-full"
            >
              {inventoryUpload.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Inventory
                </>
              )}
            </Button>
            <ValidationReport validation={invValidation} />
          </CardContent>
        </Card>

        {/* QuickBooks Sales Upload */}
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              QuickBooks Sales Export
              <Badge variant="default" className="text-xs ml-2">Recommended</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload your QuickBooks "Sales by Product/Service Summary" export
              (.xlsx). The parser maps QB product names to app SKUs, excludes
              Pheotera and samples, then AI calculates daily velocity.
            </p>
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => qbRef.current?.click()}
            >
              <input
                ref={qbRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  setQbFile(e.target.files?.[0] ?? null);
                  setQbParseResult(null);
                }}
              />
              {qbFile ? (
                <div className="flex items-center justify-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium text-foreground">
                    {qbFile.name}
                  </span>
                </div>
              ) : (
                <div>
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    Click to select a QuickBooks sales export
                  </p>
                </div>
              )}
            </div>
            <Button
              onClick={handleQbUpload}
              disabled={!qbFile || qbUpload.isPending}
              className="w-full"
            >
              {qbUpload.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Parsing & Analyzing...
                </>
              ) : (
                <>
                  <BookOpen className="h-4 w-4 mr-2" />
                  Upload QuickBooks Export
                </>
              )}
            </Button>
            <ValidationReport validation={qbValidation} />
          </CardContent>
        </Card>

        {/* Legacy Sales Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Sales Data (Other Format)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload a non-QuickBooks sales spreadsheet (.xlsx). AI will analyze
              the data and calculate daily velocity.
            </p>
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => salesRef.current?.click()}
            >
              <input
                ref={salesRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => setSalesFile(e.target.files?.[0] ?? null)}
              />
              {salesFile ? (
                <div className="flex items-center justify-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium text-foreground">
                    {salesFile.name}
                  </span>
                </div>
              ) : (
                <div>
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    Click to select a sales spreadsheet
                  </p>
                </div>
              )}
            </div>
            <Button
              onClick={handleSalesUpload}
              disabled={!salesFile || salesUpload.isPending}
              className="w-full"
            >
              {salesUpload.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing with AI...
                </>
              ) : (
                <>
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Upload & Analyze
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* QB Parse Results */}
      {qbParseResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              QuickBooks Parse Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold text-foreground">{qbParseResult.totalRows}</p>
                <p className="text-xs text-muted-foreground">Total Rows</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold text-primary">{qbParseResult.matchedItems}</p>
                <p className="text-xs text-muted-foreground">SKUs Matched</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold text-muted-foreground">{qbParseResult.excludedRows}</p>
                <p className="text-xs text-muted-foreground">Rows Excluded</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold text-foreground">{qbParseResult.months?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Months Detected</p>
              </div>
            </div>
            {qbParseResult.unmatchedRows?.length > 0 && (
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Unmatched QB Products</p>
                    <ul className="mt-2 space-y-1">
                      {qbParseResult.unmatchedRows.map((row, i) => (
                        <li key={i} className="text-xs text-amber-700 dark:text-amber-300">
                          "{row.name}" — {row.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* AI Analysis Results */}
      {aiAnalysis && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-primary" />
              AI Velocity Analysis Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              {aiAnalysis.summary}
            </p>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 font-medium text-muted-foreground">SKU</th>
                    <th className="pb-3 font-medium text-muted-foreground text-right">Velocity</th>
                    <th className="pb-3 font-medium text-muted-foreground text-right">Months</th>
                    <th className="pb-3 font-medium text-muted-foreground text-right">Total Units</th>
                    <th className="pb-3 font-medium text-muted-foreground">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {aiAnalysis.velocities?.map((v, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-3 font-medium text-foreground">{v.skuName}</td>
                      <td className="py-3 text-right tabular-nums">{v.dailyVelocity.toFixed(1)}</td>
                      <td className="py-3 text-right tabular-nums">{v.monthsAnalyzed}</td>
                      <td className="py-3 text-right tabular-nums">{v.totalUnits.toLocaleString()}</td>
                      <td className="py-3 text-muted-foreground text-xs">{v.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile card layout */}
            <div className="md:hidden space-y-2">
              {aiAnalysis.velocities?.map((v, i) => (
                <div key={i} className="border rounded-lg p-2.5 space-y-2">
                  <div className="font-medium text-sm">{v.skuName}</div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div><span className="text-muted-foreground block">Vel/Day</span><span className="tabular-nums">{v.dailyVelocity.toFixed(1)}</span></div>
                    <div><span className="text-muted-foreground block">Months</span><span className="tabular-nums">{v.monthsAnalyzed}</span></div>
                    <div><span className="text-muted-foreground block">Total</span><span className="tabular-nums">{v.totalUnits.toLocaleString()}</span></div>
                  </div>
                  {v.notes && <div className="text-[10px] text-muted-foreground">{v.notes}</div>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Inventory Upload History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!snapshots?.length ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No inventory uploads yet.
              </p>
            ) : (
              <div className="space-y-2">
                {snapshots.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {s.fileName || "Unnamed upload"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(
                          new Date(s.snapshotDate),
                          "MMM d, yyyy h:mm a"
                        )}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {String(s.fileName ?? "").startsWith("[METRC]")
                        ? "METRC"
                        : "Manual"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sales Upload History</CardTitle>
          </CardHeader>
          <CardContent>
            {!salesUploads?.length ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No sales uploads yet.
              </p>
            ) : (
              <div className="space-y-2">
                {salesUploads.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {s.fileName || "Unnamed upload"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(s.createdAt), "MMM d, yyyy h:mm a")}
                      </p>
                    </div>
                    <Badge
                      variant={
                        s.status === "completed"
                          ? "default"
                          : s.status === "failed"
                            ? "destructive"
                            : "outline"
                      }
                      className="text-xs"
                    >
                      {s.status === "completed" && (
                        <CheckCircle className="h-3 w-3 mr-1" />
                      )}
                      {s.status === "failed" && (
                        <XCircle className="h-3 w-3 mr-1" />
                      )}
                      {s.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
