import { AlertTriangle, XCircle, ChevronDown, ChevronUp, ShieldAlert, ShieldCheck, Info } from "lucide-react";
import { useState } from "react";

interface ValidationIssue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  context?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
  infoCount?: number;
}

export function ValidationReport({ validation }: { validation: ValidationResult | null | undefined }) {
  const [expanded, setExpanded] = useState(true);

  if (!validation || validation.issues.length === 0) return null;

  const hasErrors = validation.errorCount > 0;
  const hasWarnings = validation.warningCount > 0;
  const infoCount = validation.infoCount ?? validation.issues.filter((i) => i.severity === "info").length;

  // Determine overall severity for styling
  const bgClass = hasErrors
    ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
    : hasWarnings
    ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800"
    : "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800";
  const iconColor = hasErrors ? "text-red-600" : hasWarnings ? "text-amber-600" : "text-blue-600";
  const titleColor = hasErrors
    ? "text-red-800 dark:text-red-200"
    : hasWarnings
    ? "text-amber-800 dark:text-amber-200"
    : "text-blue-800 dark:text-blue-200";

  // Build summary text
  const parts: string[] = [];
  if (validation.errorCount > 0) parts.push(`${validation.errorCount} error${validation.errorCount > 1 ? "s" : ""}`);
  if (validation.warningCount > 0) parts.push(`${validation.warningCount} warning${validation.warningCount > 1 ? "s" : ""}`);
  if (infoCount > 0) parts.push(`${infoCount} note${infoCount > 1 ? "s" : ""}`);
  const title = hasErrors ? `Data Validation Failed — ${parts.join(", ")}` : parts.join(", ");

  return (
    <div className={`border rounded-lg p-4 ${bgClass}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2">
          {hasErrors ? (
            <ShieldAlert className={`h-5 w-5 ${iconColor} shrink-0`} />
          ) : hasWarnings ? (
            <ShieldCheck className={`h-5 w-5 ${iconColor} shrink-0`} />
          ) : (
            <Info className={`h-5 w-5 ${iconColor} shrink-0`} />
          )}
          <div>
            <p className={`text-sm font-medium ${titleColor}`}>{title}</p>
            {hasErrors && (
              <p className="text-xs text-red-700 dark:text-red-300 mt-0.5">
                Upload blocked. Fix the errors below and re-upload.
              </p>
            )}
          </div>
        </div>
        {expanded ? (
          <ChevronUp className={`h-4 w-4 ${iconColor} shrink-0`} />
        ) : (
          <ChevronDown className={`h-4 w-4 ${iconColor} shrink-0`} />
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {validation.issues.map((issue, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              {issue.severity === "error" ? (
                <XCircle className="h-3.5 w-3.5 text-red-600 mt-0.5 shrink-0" />
              ) : issue.severity === "warning" ? (
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
              ) : (
                <Info className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
              )}
              <div>
                {issue.context && (
                  <span className="font-medium text-foreground">{issue.context}: </span>
                )}
                <span className={
                  issue.severity === "error" ? "text-red-700 dark:text-red-300" :
                  issue.severity === "warning" ? "text-amber-700 dark:text-amber-300" :
                  "text-blue-700 dark:text-blue-300"
                }>
                  {issue.message}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
