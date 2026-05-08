/**
 * Shared AI velocity analysis helper.
 *
 * Extracts the duplicated LLM call + JSON schema that was copy-pasted
 * between the generic sales upload and the QuickBooks upload mutations.
 *
 * Audit fixes applied:
 *   - Zod validation on LLM response (P0)
 *   - LLM telemetry logging (P3)
 */

import { z } from "zod";
import { invokeLLM } from "./_core/llm";
import { findBestSkuMatch } from "./parsers";
import * as db from "./db";

// ─── Zod Schemas ────────────────────────────────────────────────────

const VelocityResultSchema = z.object({
  skuName: z.string(),
  dailyVelocity: z.number(),
  monthsAnalyzed: z.number(),
  totalUnits: z.number(),
  notes: z.string(),
});

const VelocityAnalysisSchema = z.object({
  velocities: z.array(VelocityResultSchema),
  summary: z.string(),
});

export type VelocityResult = z.infer<typeof VelocityResultSchema>;
export type VelocityAnalysis = z.infer<typeof VelocityAnalysisSchema>;

// ─── JSON Schema (for LLM structured output) ────────────────────────

const VELOCITY_JSON_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "velocity_analysis",
    strict: true,
    schema: {
      type: "object",
      properties: {
        velocities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              skuName: { type: "string" },
              dailyVelocity: { type: "number" },
              monthsAnalyzed: { type: "number" },
              totalUnits: { type: "number" },
              notes: { type: "string" },
            },
            required: ["skuName", "dailyVelocity", "monthsAnalyzed", "totalUnits", "notes"],
            additionalProperties: false,
          },
        },
        summary: { type: "string" },
      },
      required: ["velocities", "summary"],
      additionalProperties: false,
    },
  },
};

// ─── Telemetry ──────────────────────────────────────────────────────

async function logLLMUsage(opts: {
  userId: string | null;
  action: string;
  promptTokensEst: number;
  durationMs: number;
  success: boolean;
  error?: string;
}) {
  try {
    const { getDb } = await import("./db");
    const drizzleDb = await getDb();
    if (!drizzleDb) return;
    const { llmUsage } = await import("../drizzle/schema");
    await drizzleDb.insert(llmUsage).values({
      userId: opts.userId,
      action: opts.action,
      model: "default",
      promptTokens: opts.promptTokensEst,
      completionTokens: 0,
      totalTokens: opts.promptTokensEst,
      durationMs: opts.durationMs,
      success: opts.success,
      errorMessage: opts.error ?? null,
    });
  } catch {
    // Telemetry should never break the main flow
  }
}

// ─── Core Helper ────────────────────────────────────────────────────

/**
 * Sends pre-processed sales CSV to the LLM, validates the structured
 * response with Zod, updates SKU velocities in the database, and returns
 * the parsed analysis.
 */
export async function analyzeVelocityWithAI(
  csvForAI: string,
  fileName: string,
  skuNames: string,
  allSkus: Awaited<ReturnType<typeof db.getAllSkus>>,
  userHint?: string,
  userId?: string | null,
): Promise<VelocityAnalysis> {
  const systemPrompt = `You are a sales data analyst for a cannabis products manufacturer.
Your job is to analyze historical sales data and calculate the daily wholesale velocity for each SKU.

The company's current SKUs are: ${skuNames}

Rules:
- Calculate daily velocity based on the most recent 3 full months of data
- Use calendar days (not business days) for velocity calculation
- Return results as JSON with the exact SKU names matching the list above
- If a SKU has no sales data, set velocity to 0
- Be precise with the calculations

Return a JSON object with this exact structure:
{
  "velocities": [
    { "skuName": "exact SKU name", "dailyVelocity": number, "monthsAnalyzed": number, "totalUnits": number, "notes": "brief explanation" }
  ],
  "summary": "brief overall analysis"
}`;

  const userMessage = `Here is the pre-processed sales data from "${fileName}". Each row shows the SKU name followed by monthly quantities:\n\n${csvForAI}\n\nPlease analyze this data and calculate the daily wholesale velocity for each SKU. Focus on the most recent 3 full months of quantity data. Use calendar days per month (Jan=31, Feb=28, Mar=31, Apr=30, May=31, Jun=30, Jul=31, Aug=31, Sep=30, Oct=31, Nov=30, Dec=31) when calculating daily rates.${userHint ? `\n\n${userHint}` : ""}`;

  const promptChars = systemPrompt.length + userMessage.length;
  const promptTokensEst = Math.ceil(promptChars / 4);
  const start = Date.now();

  let aiResponse;
  try {
    aiResponse = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      response_format: VELOCITY_JSON_SCHEMA,
    });
  } catch (err: unknown) {
    await logLLMUsage({
      userId: userId ?? null,
      action: "velocity_analysis",
      promptTokensEst,
      durationMs: Date.now() - start,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  const durationMs = Date.now() - start;
  const content = aiResponse.choices[0]?.message?.content;
  const raw = JSON.parse(typeof content === "string" ? content : "{}");

  // Validate with Zod — throws ZodError if LLM returned malformed data
  const parsed = VelocityAnalysisSchema.parse(raw);

  await logLLMUsage({
    userId: userId ?? null,
    action: "velocity_analysis",
    promptTokensEst,
    durationMs,
    success: true,
  });

  // Update SKU velocities in the database
  for (const vel of parsed.velocities) {
    const matchedSku = findBestSkuMatch(vel.skuName, allSkus);
    if (matchedSku && vel.dailyVelocity > 0) {
      await db.updateSkuVelocity(matchedSku.id, vel.dailyVelocity, "ai", 14);
    }
  }

  return parsed;
}
