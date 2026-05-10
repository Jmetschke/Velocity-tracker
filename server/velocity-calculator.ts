import * as db from "./db";
import { findBestSkuMatch } from "./parsers";
import type { QBParseResult } from "./quickbooks-parser";
import type { VelocityAnalysis } from "./velocity-ai";

const MONTH_DAYS: Record<string, number> = {
  Jan: 31,
  Feb: 28,
  Mar: 31,
  Apr: 30,
  May: 31,
  Jun: 30,
  Jul: 31,
  Aug: 31,
  Sep: 30,
  Oct: 31,
  Nov: 30,
  Dec: 31,
};

function daysInMonthLabel(month: string) {
  const match = month.match(/^([A-Z][a-z]{2})\s+(\d{4})$/);
  if (!match) return 0;
  const baseDays = MONTH_DAYS[match[1]] ?? 0;
  const year = Number(match[2]);
  if (match[1] === "Feb" && year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) {
    return 29;
  }
  return baseDays;
}

function selectAnalysisMonths(result: QBParseResult) {
  const fullMonths = result.months.filter((month) => !result.partialMonths.includes(month));
  return fullMonths.slice(-6);
}

export async function calculateQuickBooksVelocity(
  result: QBParseResult,
  allSkus: Awaited<ReturnType<typeof db.getAllSkus>>,
): Promise<VelocityAnalysis> {
  const analysisMonths = selectAnalysisMonths(result);
  const analysisDays = analysisMonths.reduce((sum, month) => sum + daysInMonthLabel(month), 0);

  const velocities = result.items.map((item) => {
    const totalUnits = item.monthlyData
      .filter((month) => analysisMonths.includes(month.month))
      .reduce((sum, month) => sum + month.quantity, 0);
    const dailyVelocity = analysisDays > 0 ? Number((totalUnits / analysisDays).toFixed(2)) : 0;
    return {
      skuName: item.skuName,
      dailyVelocity,
      monthsAnalyzed: analysisMonths.length,
      totalUnits,
      notes:
        analysisMonths.length > 0
          ? `Calculated from ${analysisMonths.join(", ")}.`
          : "No full months available in QuickBooks report.",
    };
  });

  for (const velocity of velocities) {
    const matchedSku = findBestSkuMatch(velocity.skuName, allSkus);
    if (matchedSku) {
      await db.updateSkuVelocity(matchedSku.id, velocity.dailyVelocity, "calculated", 14);
    }
  }

  return {
    velocities,
    summary:
      analysisMonths.length > 0
        ? `Calculated daily velocity from the most recent ${analysisMonths.length} full month(s): ${analysisMonths.join(", ")}.`
        : "No full months were available for velocity calculation.",
  };
}
