import {
  getNotificationSettings,
  createNotificationHistory,
  getAllSnapshots,
  getSnapshotItems,
} from "./db";
import { Resend } from "resend";
import type { User } from "../drizzle/schema";

// ─── Lazy Resend init (avoids crash if API key is missing at import time) ───
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not configured");
    _resend = new Resend(key);
  }
  return _resend;
}

// ─── Types ──────────────────────────────────────────────────────────

export interface StockoutAlert {
  skuId: number;
  skuName: string;
  currentStock: number;
  dailyVelocity: number;
  daysUntilStockout: number;
  stockoutDate: Date;
  notificationType: "stockout_warning" | "critical_alert";
}

// ─── Core Logic ─────────────────────────────────────────────────────

/**
 * Check all SKUs for stockout risk and send notifications if needed.
 */
export async function checkAndNotifyStockoutRisks(user: User): Promise<void> {
  if (!user.email) {
    console.warn(`[Notifications] User ${user.id} has no email, skipping`);
    return;
  }

  const settings = await getNotificationSettings(user.id);
  if (!settings || !settings.emailEnabled) {
    console.log(`[Notifications] Notifications disabled for user ${user.id}`);
    return;
  }

  const threshold = settings.stockoutThresholdDays;
  const snapshots = await getAllSnapshots();
  const snapshot = snapshots[0];
  if (!snapshot) {
    console.log(`[Notifications] No inventory snapshot found`);
    return;
  }

  const items = await getSnapshotItems(snapshot.id);
  const alerts: StockoutAlert[] = [];

  for (const item of items) {
    const velocity = Number(item.dailyVelocity);
    if (!velocity || velocity <= 0 || !item.skuName) continue;

    const daysUntilStockout = (item.totalQty ?? 0) / velocity;
    if (daysUntilStockout > threshold) continue;

    const notificationType: StockoutAlert["notificationType"] =
      daysUntilStockout <= 5 ? "critical_alert" : "stockout_warning";

    const stockoutDate = new Date();
    stockoutDate.setDate(stockoutDate.getDate() + daysUntilStockout);

    alerts.push({
      skuId: item.skuId,
      skuName: item.skuName || "Unknown SKU",
      currentStock: item.totalQty ?? 0,
      dailyVelocity: velocity,
      daysUntilStockout,
      stockoutDate,
      notificationType,
    });

    await createNotificationHistory({
      userId: user.id,
      skuId: item.skuId,
      currentStock: item.totalQty ?? 0,
      daysUntilStockout: (Math.round(daysUntilStockout * 100) / 100).toString(),
      dailyVelocity: velocity.toString(),
      notificationType,
      emailSent: false,
    } as any);
  }

  if (alerts.length > 0) {
    await sendStockoutNotificationEmail(user, alerts, threshold);
  }
}

// ─── Email ──────────────────────────────────────────────────────────

async function sendStockoutNotificationEmail(
  user: User,
  alerts: StockoutAlert[],
  threshold: number,
): Promise<void> {
  if (!user.email) return;

  const criticalAlerts = alerts.filter((a) => a.notificationType === "critical_alert");
  const warningAlerts = alerts.filter((a) => a.notificationType === "stockout_warning");
  const emailHtml = formatStockoutEmail(user.name || "User", criticalAlerts, warningAlerts, threshold);

  try {
    const resend = getResend();
    const response = await resend.emails.send({
      from: "Elevated Production Scheduler <notifications@resend.dev>",
      to: user.email,
      subject: `Stockout Alert: ${alerts.length} SKU(s) at risk`,
      html: emailHtml,
    });

    if (response.error) {
      console.error(`[Notifications] Resend error:`, response.error);
    } else {
      console.log(`[Notifications] Email sent to ${user.email} for ${alerts.length} SKU(s)`);
    }
  } catch (error) {
    console.error(`[Notifications] Error sending email:`, error);
  }
}

// ─── Email Template ─────────────────────────────────────────────────

/** Exported for testing. */
export function formatStockoutEmail(
  userName: string,
  criticalAlerts: StockoutAlert[],
  warningAlerts: StockoutAlert[],
  threshold: number,
): string {
  const totalCount = criticalAlerts.length + warningAlerts.length;

  const alertTableRows = (alerts: StockoutAlert[]) =>
    alerts
      .map(
        (a) => `
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 12px; color: #1f2937;">${a.skuName}</td>
        <td style="padding: 12px; text-align: right; color: #1f2937;">${a.currentStock.toLocaleString()}</td>
        <td style="padding: 12px; text-align: right; color: #1f2937;">${a.dailyVelocity.toFixed(1)}/day</td>
        <td style="padding: 12px; text-align: right; font-weight: bold;">${a.daysUntilStockout.toFixed(1)}</td>
        <td style="padding: 12px; text-align: center; color: #1f2937; font-weight: 600;">${a.stockoutDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
      </tr>`,
      )
      .join("");

  const tableHeaders = `
    <thead><tr>
      <th style="padding: 12px; text-align: left; font-weight: 600;">SKU</th>
      <th style="padding: 12px; text-align: right; font-weight: 600;">Stock</th>
      <th style="padding: 12px; text-align: right; font-weight: 600;">Velocity</th>
      <th style="padding: 12px; text-align: right; font-weight: 600;">Days Left</th>
      <th style="padding: 12px; text-align: center; font-weight: 600;">Stockout Date</th>
    </tr></thead>`;

  let sections = "";

  if (criticalAlerts.length > 0) {
    sections += `
  <h3 style="color: #dc2626; margin-bottom: 12px; font-size: 16px;">Critical Alerts (5 days or less)</h3>
  <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; background-color: #fef2f2; border: 1px solid #fca5a5;">
    ${tableHeaders}<tbody>${alertTableRows(criticalAlerts)}</tbody>
  </table>`;
  }

  if (warningAlerts.length > 0) {
    sections += `
  <h3 style="color: #d97706; margin-bottom: 12px; font-size: 16px;">Warnings (6-${threshold} days)</h3>
  <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; background-color: #fffbeb; border: 1px solid #fcd34d;">
    ${tableHeaders}<tbody>${alertTableRows(warningAlerts)}</tbody>
  </table>`;
  }

  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #1f2937; margin-bottom: 16px;">Elevated Organics - Production Alert</h2>
  <p style="color: #4b5563; margin-bottom: 16px;">Hi ${userName},</p>
  <p style="color: #4b5563; margin-bottom: 24px;">Your inventory monitoring system has detected <strong>${totalCount} SKU(s)</strong> at risk of stockout within the next ${threshold} days.</p>
  ${sections}
  <p style="color: #4b5563; margin-bottom: 16px;"><strong>Recommended Action:</strong> Review the Production Dashboard to schedule batches for the critical SKUs immediately.</p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
  <p style="color: #9ca3af; font-size: 12px; margin-bottom: 0;">This is an automated notification from your Elevated Production Scheduler.</p>
</div>`;
}
