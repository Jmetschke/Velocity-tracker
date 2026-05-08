import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";
import { parseSalesReport } from "../parsers";
import { parseQuickBooksExport } from "../quickbooks-parser";
import { validateQuickBooks } from "../data-validation";
import { analyzeVelocityWithAI } from "../velocity-ai";

const MAX_FILE = 10_000_000;
const FILE_TOO_LARGE = "File too large (max ~7.5 MB)";

export const salesRouter = router({
  uploads: protectedProcedure.query(() => db.getAllSalesUploads()),

  upload: protectedProcedure
    .input(z.object({ fileBase64: z.string().max(MAX_FILE, FILE_TOO_LARGE), fileName: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const buffer = Buffer.from(input.fileBase64, "base64");
      const fileKey = `sales/${nanoid()}-${input.fileName}`;
      await storagePut(fileKey, buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

      const uploadId = await db.createSalesUpload({
        uploadedBy: ctx.user?.id ?? null,
        fileName: input.fileName,
        status: "processing",
      });

      const { csvForAI } = await parseSalesReport(buffer);
      const allSkus = await db.getAllSkus();
      const skuNames = allSkus.map((s) => s.name).join(", ");

      try {
        const parsed = await analyzeVelocityWithAI(csvForAI, input.fileName, skuNames, allSkus);
        await db.updateSalesUpload(uploadId, { status: "completed", aiAnalysis: JSON.stringify(parsed) });
        return { uploadId, analysis: parsed, status: "completed" };
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        await db.updateSalesUpload(uploadId, { status: "failed", aiAnalysis: msg });
        return { uploadId, analysis: null, status: "failed", error: msg };
      }
    }),

  uploadQuickBooks: protectedProcedure
    .input(z.object({ fileBase64: z.string().max(MAX_FILE, FILE_TOO_LARGE), fileName: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const buffer = Buffer.from(input.fileBase64, "base64");
      const fileKey = `sales/qb-${nanoid()}-${input.fileName}`;
      await storagePut(fileKey, buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

      const qbResult = await parseQuickBooksExport(buffer);
      const validation = validateQuickBooks(qbResult);
      if (!validation.valid) {
        return {
          uploadId: null, analysis: null, status: "validation_failed" as const,
          validation,
          parseResult: {
            totalRows: qbResult.totalRows, matchedItems: qbResult.items.length,
            excludedRows: qbResult.excludedRows.length, unmatchedRows: qbResult.unmatchedRows,
            months: qbResult.months,
          },
        };
      }

      const uploadId = await db.createSalesUpload({
        uploadedBy: ctx.user?.id ?? null,
        fileName: `[QB] ${input.fileName}`,
        status: "processing",
      });

      const allSkus = await db.getAllSkus();
      const skuNames = allSkus.map((s) => s.name).join(", ");
      const qbParseResult = {
        totalRows: qbResult.totalRows, matchedItems: qbResult.items.length,
        excludedRows: qbResult.excludedRows.length, unmatchedRows: qbResult.unmatchedRows,
        months: qbResult.months,
      };

      try {
        const parsed = await analyzeVelocityWithAI(qbResult.csvForAI, input.fileName, skuNames, allSkus);
        await db.updateSalesUpload(uploadId, { status: "completed", aiAnalysis: JSON.stringify(parsed) });
        return { uploadId, analysis: parsed, status: "completed" as const, validation, parseResult: qbParseResult };
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        await db.updateSalesUpload(uploadId, { status: "failed", aiAnalysis: msg });
        return { uploadId, analysis: null, status: "failed" as const, error: msg, validation, parseResult: qbParseResult };
      }
    }),

  velocityHistory: protectedProcedure.query(() => db.getAllVelocityHistory()),

  skuVelocityHistory: protectedProcedure
    .input(z.object({ skuId: z.number() }))
    .query(({ input }) => db.getVelocityHistoryForSku(input.skuId)),
});
