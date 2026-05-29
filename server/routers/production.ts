import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { generateScheduleSuggestions } from "../scheduling";

type CalendarTasksPayload = {
  batchHijnx?: Array<{ item?: unknown; units?: unknown }>;
  batchSb?: Array<{ item?: unknown; units?: unknown }>;
  events?: Array<{
    date?: unknown;
    title?: unknown;
    days?: unknown;
    times?: Array<{ start?: unknown; end?: unknown }>;
    location?: unknown;
    company?: unknown;
  }>;
  tasks?: Array<{ text?: unknown; days?: unknown }>;
  testPickups?: Array<{ time?: unknown; items?: unknown }>;
};

function text(value: unknown) {
  return value == null ? "" : String(value);
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCalendarTasks(raw: string): CalendarTasksPayload {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00`);
  parsed.setDate(parsed.getDate() + Math.max(days - 1, 0));
  return parsed.toISOString().slice(0, 10);
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addCalendarDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function normalizeProductName(value: string) {
  return value
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function findMatchingSkuId(
  calendarTitle: string,
  skus: Array<{ id: number; name: string }>
) {
  const titleKey = normalizeProductName(calendarTitle);
  if (!titleKey) return null;

  const keyedSkus = skus
    .map((sku) => ({ ...sku, key: normalizeProductName(sku.name) }))
    .filter((sku) => sku.key);

  const exact = keyedSkus.find((sku) => sku.key === titleKey);
  if (exact) return exact.id;

  const partialMatches = keyedSkus
    .filter((sku) => titleKey.includes(sku.key) || sku.key.includes(titleKey))
    .sort((a, b) => b.key.length - a.key.length);

  return partialMatches[0]?.id ?? null;
}

type CalendarCommittedBatch = {
  quantity: number;
  scheduledStartDate: Date;
};

async function getCalendarCommittedBatchesBySku(
  skus: Array<{ id: number; name: string }>,
  asOfDate: Date
) {
  const startDate = dateKey(asOfDate);
  const endDate = dateKey(addCalendarDays(asOfDate, 365));
  const rows = await db.getCalendarScheduleDays(startDate, endDate);
  const committedBySkuId = new Map<number, CalendarCommittedBatch>();

  for (const row of rows) {
    const payload = parseCalendarTasks(row.tasks);
    const batches = [...(payload.batchHijnx ?? []), ...(payload.batchSb ?? [])];
    const scheduledStartDate = new Date(`${row.scheduleDate}T00:00:00`);

    for (const batch of batches) {
      const quantity = numberOrNull(batch.units);
      if (quantity == null || quantity <= 0) continue;

      const skuId = findMatchingSkuId(text(batch.item), skus);
      if (skuId == null) continue;

      const existing = committedBySkuId.get(skuId);
      committedBySkuId.set(skuId, {
        quantity: (existing?.quantity ?? 0) + quantity,
        scheduledStartDate:
          existing && existing.scheduledStartDate <= scheduledStartDate
            ? existing.scheduledStartDate
            : scheduledStartDate,
      });
    }
  }

  return committedBySkuId;
}

function isWeekendDate(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function businessDateSpan(startDate: string, days: number) {
  const activeDates: string[] = [];
  const current = new Date(`${startDate}T00:00:00`);
  const totalDays = Math.max(Math.floor(days), 1);

  while (activeDates.length < totalDays) {
    if (!isWeekendDate(current)) {
      activeDates.push(dateKey(current));
    }
    current.setDate(current.getDate() + 1);
  }

  return activeDates;
}

export const productionRouter = router({
  suggestions: protectedProcedure.query(async () => {
    const snapshot = await db.getLatestSnapshot();
    if (!snapshot) return { suggestions: [], snapshotDate: null };

    const items = await db.getSnapshotItems(snapshot.id);
    const allSkus = await db.getAllSkus();
    const activeSkus = allSkus.filter((s) => s.isActive);
    const calendarCommittedBySkuId = await getCalendarCommittedBatchesBySku(activeSkus, new Date());

    const skuInputs = activeSkus
      .map((sku) => {
        const invItem = items.find((i) => i.skuId === sku.id);
        const committedBatch = calendarCommittedBySkuId.get(sku.id);
        return {
          skuId: sku.id,
          skuName: sku.name,
          currentStock: invItem?.qtyInInventory ?? 0,
          wipStock: invItem?.qtyOnHold ?? 0,
          dailyVelocity: parseFloat(String(sku.dailyVelocity ?? "0")),
          parLevel: sku.parLevel ?? 0,
          netBatchSize: sku.customBatchSize ?? sku.netBatchSize ?? 950,
          leadTimeDays: sku.leadTimeDays ?? 5,
          committedQuantity: committedBatch?.quantity ?? 0,
          scheduledStartDate: committedBatch?.scheduledStartDate,
          bufferDays: sku.bufferDays ?? 14,
        };
      });

    const suggestions = generateScheduleSuggestions(skuInputs);
    return { suggestions, skuInputs, snapshotDate: snapshot.snapshotDate };
  }),

  batches: protectedProcedure
    .input(
      z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .query(async ({ input }) => {
      const rows = await db.getCalendarScheduleDays(input.startDate, input.endDate);

      return rows.flatMap((row) => {
        const payload = parseCalendarTasks(row.tasks);
        const items: Array<{
          id: string;
          date: string;
          startDate: string;
          endDate: string;
          type: "batch_hijnx" | "batch_sb" | "event" | "task" | "test_pickup";
          label: string;
          title: string;
          quantity: number | null;
          details: string[];
          activeDates?: string[];
          updatedAt: string | null;
        }> = [];

        payload.batchHijnx?.forEach((batch, index) => {
          const title = text(batch.item) || "Hijnx batch";
          items.push({
            id: `${row.scheduleDate}-batch-hijnx-${index}`,
            date: row.scheduleDate,
            startDate: row.scheduleDate,
            endDate: row.scheduleDate,
            type: "batch_hijnx",
            label: "Hijnx",
            title,
            quantity: numberOrNull(batch.units),
            details: text(batch.units) ? [`${text(batch.units)} units`] : [],
            updatedAt: row.updatedAt,
          });
        });

        payload.batchSb?.forEach((batch, index) => {
          const title = text(batch.item) || "SB batch";
          items.push({
            id: `${row.scheduleDate}-batch-sb-${index}`,
            date: row.scheduleDate,
            startDate: row.scheduleDate,
            endDate: row.scheduleDate,
            type: "batch_sb",
            label: "SB",
            title,
            quantity: numberOrNull(batch.units),
            details: text(batch.units) ? [`${text(batch.units)} units`] : [],
            updatedAt: row.updatedAt,
          });
        });

        payload.events?.forEach((event, index) => {
          const eventDate = text(event.date) || row.scheduleDate;
          const days = numberOrNull(event.days) ?? 1;
          const times =
            event.times
              ?.map((time) => [text(time.start), text(time.end)].filter(Boolean).join("-"))
              .filter(Boolean) ?? [];
          items.push({
            id: `${row.scheduleDate}-event-${index}`,
            date: eventDate,
            startDate: eventDate,
            endDate: addDays(eventDate, days),
            type: "event",
            label: "Event",
            title: text(event.title) || "Event",
            quantity: null,
            details: [
              ...times,
              text(event.location),
              text(event.company),
              days > 1 ? `${days} days` : "",
            ].filter(Boolean),
            updatedAt: row.updatedAt,
          });
        });

        payload.tasks?.forEach((task, index) => {
          const days = numberOrNull(task.days) ?? 1;
          const activeDates = businessDateSpan(row.scheduleDate, days);
          items.push({
            id: `${row.scheduleDate}-task-${index}`,
            date: activeDates[0],
            startDate: activeDates[0],
            endDate: activeDates[activeDates.length - 1],
            type: "task",
            label: "Task",
            title: text(task.text) || "Task",
            quantity: null,
            details: days > 1 ? [`${days} days`] : [],
            activeDates,
            updatedAt: row.updatedAt,
          });
        });

        payload.testPickups?.forEach((pickup, index) => {
          const pickupItems = Array.isArray(pickup.items) ? pickup.items.map(text).filter(Boolean) : [];
          const pickupTitle = pickupItems.length ? pickupItems.join(", ") : "Test pickup";
          items.push({
            id: `${row.scheduleDate}-test-pickup-${index}`,
            date: row.scheduleDate,
            startDate: row.scheduleDate,
            endDate: row.scheduleDate,
            type: "test_pickup",
            label: "Pickup",
            title: pickupTitle,
            quantity: null,
            details: [text(pickup.time)].filter(Boolean),
            updatedAt: row.updatedAt,
          });
        });

        return items;
      });
    }),

  scheduleBatch: protectedProcedure.mutation(() => {
    throw new Error("Production schedule is read-only in this app");
  }),

  updateBatch: protectedProcedure.mutation(() => {
    throw new Error("Production schedule is read-only in this app");
  }),

  deleteBatch: protectedProcedure.mutation(() => {
    throw new Error("Production schedule is read-only in this app");
  }),
});
