import { eq, desc, and, sql, gte, lte } from "drizzle-orm";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import {
  InsertUser,
  users,
  skuCategories,
  skus,
  inventorySnapshots,
  inventoryItems,
  salesUploads,
  velocityHistory,
  productionBatches,
  type InsertSkuCategory,
  type InsertSku,
  type InsertInventorySnapshot,
  type InsertInventoryItem,
  type InsertSalesUpload,
  type InsertVelocityHistory,
  type InsertProductionBatch,
  committedBatches,
  type InsertCommittedBatch,
  productLaunches,
  type InsertProductLaunch,
  productLaunchChecklistItems,
  type InsertProductLaunchChecklistItem,
  notificationSettings,
  type InsertNotificationSettings,
  notificationHistory,
  type InsertNotificationHistory,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
let _calendarDb: ReturnType<typeof drizzle> | null = null;
let _calendarClient: ReturnType<typeof createClient> | null = null;
let _migrationsApplied = false;

export async function getDb() {
  if (!_db && ENV.tursoDatabaseUrl) {
    try {
      const client = createClient({
        url: ENV.tursoDatabaseUrl,
        authToken: ENV.tursoAuthToken || undefined,
      });
      _db = drizzle(client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function getCalendarDb() {
  if (!ENV.tursoCalendarUrl) return getDb();

  if (!_calendarDb) {
    try {
      _calendarDb = drizzle(getCalendarClient());
    } catch (error) {
      console.warn("[Calendar Database] Failed to connect:", error);
      _calendarDb = null;
    }
  }
  return _calendarDb;
}

function getCalendarClient() {
  if (!_calendarClient) {
    _calendarClient = createClient({
      url: ENV.tursoCalendarUrl,
      authToken: ENV.tursoCalendarToken || undefined,
    });
  }
  return _calendarClient;
}

export async function applyMigrations() {
  if (!_migrationsApplied) {
    const db = await getDb();
    if (!db) {
      console.warn("[Database] TURSO_DATABASE_URL is not configured; skipping migrations");
    } else {
      await migrate(db, { migrationsFolder: "./drizzle" });
      _migrationsApplied = true;
    }
  }

}

async function insertAndReturnId(insertQuery: any, idColumn: any) {
  const rows = await insertQuery.returning({ id: idColumn });
  return rows[0]?.id;
}

export type CalendarScheduleRow = {
  scheduleDate: string;
  tasks: string;
  updatedAt: string | null;
};

export async function getCalendarScheduleDays(startDate: string, endDate: string): Promise<CalendarScheduleRow[]> {
  if (!ENV.tursoCalendarUrl) {
    console.warn("[Calendar Database] TURSO_CALENDAR_URL is not configured; cannot read schedule_days");
    return [];
  }

  try {
    const result = await getCalendarClient().execute({
      sql: `
        SELECT schedule_date, tasks, updated_at
        FROM schedule_days
        WHERE schedule_date BETWEEN ? AND ?
        ORDER BY schedule_date
      `,
      args: [startDate, endDate],
    });

    return result.rows.map((row) => ({
      scheduleDate: String(row.schedule_date ?? ""),
      tasks: typeof row.tasks === "string" ? row.tasks : "",
      updatedAt: row.updated_at == null ? null : String(row.updated_at),
    }));
  } catch (error) {
    console.warn("[Calendar Database] Failed to read schedule_days:", error);
    return [];
  }
}

// ─── Users ───────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error) { console.error("[Database] Failed to upsert user:", error); throw error; }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── SKU Categories ──────────────────────────────────────────────────
export async function getAllCategories() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(skuCategories).orderBy(skuCategories.name);
}

export async function createCategory(data: InsertSkuCategory) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return insertAndReturnId(db.insert(skuCategories).values(data), skuCategories.id);
}

export async function getCategoryById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(skuCategories).where(eq(skuCategories.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateCategory(id: number, data: Partial<InsertSkuCategory>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(skuCategories).set(data).where(eq(skuCategories.id, id));
}

export async function deleteCategory(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(skuCategories).where(eq(skuCategories.id, id));
}

// ─── SKUs ────────────────────────────────────────────────────────────
export async function getAllSkus() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: skus.id,
      name: skus.name,
      categoryId: skus.categoryId,
      categoryName: skuCategories.name,
      dailyVelocity: skus.dailyVelocity,
      velocitySource: skus.velocitySource,
      parLevel: skus.parLevel,
      bufferDays: skus.bufferDays,
      leadTimeDays: skus.leadTimeDays,
      customBatchSize: skus.customBatchSize,
      metrcItemNames: skus.metrcItemNames,
      netBatchSize: skuCategories.netBatchSize,
      isActive: skus.isActive,
      createdAt: skus.createdAt,
      updatedAt: skus.updatedAt,
    })
    .from(skus)
    .leftJoin(skuCategories, eq(skus.categoryId, skuCategories.id))
    .orderBy(skus.name);
}

export async function getSkuById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(skus).where(eq(skus.id, id)).limit(1);
  return result[0];
}

export async function createSku(data: InsertSku) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return insertAndReturnId(db.insert(skus).values(data), skus.id);
}

export async function updateSku(id: number, data: Partial<InsertSku>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(skus).set(data).where(eq(skus.id, id));
}

export async function deleteSku(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(skus).set({ isActive: false }).where(eq(skus.id, id));
}

export async function updateSkuVelocity(
  id: number,
  velocity: number,
  source: "manual" | "ai" | "calculated",
  bufferDays?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const sku = await getSkuById(id);
  if (!sku) throw new Error("SKU not found");
  const buffer = bufferDays ?? sku.bufferDays ?? 14;
  const parLevel = Math.ceil(velocity * buffer);
  await db.update(skus).set({
    dailyVelocity: velocity,
    velocitySource: source,
    parLevel,
  }).where(eq(skus.id, id));
  await db.insert(velocityHistory).values({
    skuId: id,
    dailyVelocity: velocity,
    source,
  });
}

// ─── Inventory ───────────────────────────────────────────────────────
export async function createInventorySnapshot(data: InsertInventorySnapshot) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return insertAndReturnId(db.insert(inventorySnapshots).values(data), inventorySnapshots.id);
}

export async function createInventoryItems(items: InsertInventoryItem[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (items.length === 0) return;
  await db.insert(inventoryItems).values(items);
}

export async function getLatestSnapshot() {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(inventorySnapshots)
    .orderBy(desc(inventorySnapshots.snapshotDate))
    .limit(1);
  return result[0];
}

export async function getSnapshotItems(snapshotId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: inventoryItems.id,
      skuId: inventoryItems.skuId,
      skuName: skus.name,
      categoryName: skuCategories.name,
      qtyInInventory: inventoryItems.qtyInInventory,
      qtyOnHold: inventoryItems.qtyOnHold,
      totalQty: inventoryItems.totalQty,
      dailyVelocity: skus.dailyVelocity,
      parLevel: skus.parLevel,
      netBatchSize: skuCategories.netBatchSize,
      customBatchSize: skus.customBatchSize,
    })
    .from(inventoryItems)
    .leftJoin(skus, eq(inventoryItems.skuId, skus.id))
    .leftJoin(skuCategories, eq(skus.categoryId, skuCategories.id))
    .where(eq(inventoryItems.snapshotId, snapshotId))
    .orderBy(skus.name);
}

export async function getAllSnapshots() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(inventorySnapshots)
    .orderBy(desc(inventorySnapshots.snapshotDate));
}

// ─── Sales Uploads ───────────────────────────────────────────────────
export async function createSalesUpload(data: InsertSalesUpload) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return insertAndReturnId(db.insert(salesUploads).values(data), salesUploads.id);
}

export async function updateSalesUpload(id: number, data: Partial<InsertSalesUpload>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(salesUploads).set(data).where(eq(salesUploads.id, id));
}

export async function getAllSalesUploads() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(salesUploads).orderBy(desc(salesUploads.createdAt));
}

// ─── Velocity History ────────────────────────────────────────────────
export async function getVelocityHistoryForSku(skuId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(velocityHistory)
    .where(eq(velocityHistory.skuId, skuId))
    .orderBy(desc(velocityHistory.recordedAt));
}

export async function getAllVelocityHistory() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: velocityHistory.id,
      skuId: velocityHistory.skuId,
      skuName: skus.name,
      dailyVelocity: velocityHistory.dailyVelocity,
      source: velocityHistory.source,
      notes: velocityHistory.notes,
      recordedAt: velocityHistory.recordedAt,
    })
    .from(velocityHistory)
    .leftJoin(skus, eq(velocityHistory.skuId, skus.id))
    .orderBy(desc(velocityHistory.recordedAt));
}

// ─── Production Batches ──────────────────────────────────────────────
export async function createProductionBatch(data: InsertProductionBatch) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return insertAndReturnId(db.insert(productionBatches).values(data), productionBatches.id);
}

export async function updateProductionBatch(id: number, data: Partial<InsertProductionBatch>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(productionBatches).set(data).where(eq(productionBatches.id, id));
}

export async function getProductionBatches(startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: productionBatches.id,
      skuId: productionBatches.skuId,
      skuName: skus.name,
      batchSize: productionBatches.batchSize,
      startDate: productionBatches.startDate,
      endDate: productionBatches.endDate,
      status: productionBatches.status,
      notes: productionBatches.notes,
      createdAt: productionBatches.createdAt,
    })
    .from(productionBatches)
    .leftJoin(skus, eq(productionBatches.skuId, skus.id))
    .orderBy(productionBatches.startDate);
}

export async function deleteProductionBatch(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(productionBatches).where(eq(productionBatches.id, id));
}

// ─── Committed Batches ──────────────────────────────────────────────
export async function createCommittedBatch(data: InsertCommittedBatch) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return insertAndReturnId(db.insert(committedBatches).values(data), committedBatches.id);
}

export async function getAllCommittedBatches() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: committedBatches.id,
      skuId: committedBatches.skuId,
      skuName: skus.name,
      categoryName: skuCategories.name,
      quantity: committedBatches.quantity,
      calendarWeek: committedBatches.calendarWeek,
      calendarYear: committedBatches.calendarYear,
      startDate: committedBatches.startDate,
      endDate: committedBatches.endDate,
      status: committedBatches.status,
      notes: committedBatches.notes,
      createdAt: committedBatches.createdAt,
    })
    .from(committedBatches)
    .leftJoin(skus, eq(committedBatches.skuId, skus.id))
    .leftJoin(skuCategories, eq(skus.categoryId, skuCategories.id))
    .orderBy(desc(committedBatches.calendarYear), desc(committedBatches.calendarWeek));
}

export async function getActiveCommittedBatchesBySku() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      skuId: committedBatches.skuId,
      quantity: committedBatches.quantity,
      calendarWeek: committedBatches.calendarWeek,
      calendarYear: committedBatches.calendarYear,
      status: committedBatches.status,
    })
    .from(committedBatches)
    .where(
      sql`${committedBatches.status} IN ('planned', 'in_progress')`
    )
    .orderBy(committedBatches.calendarYear, committedBatches.calendarWeek);
}

export async function updateCommittedBatch(id: number, data: Partial<InsertCommittedBatch>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(committedBatches).set(data).where(eq(committedBatches.id, id));
}

export async function deleteCommittedBatch(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(committedBatches).where(eq(committedBatches.id, id));
}

// ─── Product Launch Roadmaps ────────────────────────────────────────
export async function getAllProductLaunches() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(productLaunches)
    .orderBy(desc(productLaunches.updatedAt), desc(productLaunches.createdAt));
}

export async function getProductLaunchById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(productLaunches)
    .where(eq(productLaunches.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getProductLaunchChecklistItems(productLaunchId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(productLaunchChecklistItems)
    .where(eq(productLaunchChecklistItems.productLaunchId, productLaunchId))
    .orderBy(productLaunchChecklistItems.stageNumber, productLaunchChecklistItems.id);
}

export async function createProductLaunch(
  data: InsertProductLaunch,
  checklistItems: Omit<InsertProductLaunchChecklistItem, "productLaunchId">[]
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const id = await insertAndReturnId(db.insert(productLaunches).values(data), productLaunches.id);
  if (!id) throw new Error("Failed to create product launch");

  if (checklistItems.length > 0) {
    await db.insert(productLaunchChecklistItems).values(
      checklistItems.map((item) => ({
        ...item,
        productLaunchId: id,
      }))
    );
  }

  return id;
}

export async function updateProductLaunch(id: number, data: Partial<InsertProductLaunch>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(productLaunches)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(productLaunches.id, id));
}

export async function updateProductLaunchChecklistItem(
  id: number,
  data: Partial<InsertProductLaunchChecklistItem>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(productLaunchChecklistItems)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(productLaunchChecklistItems.id, id));
}

export async function deleteProductLaunch(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(productLaunchChecklistItems)
    .where(eq(productLaunchChecklistItems.productLaunchId, id));
  await db.delete(productLaunches).where(eq(productLaunches.id, id));
}

// --- Notification Settings ---
export async function getNotificationSettings(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(notificationSettings)
    .where(eq(notificationSettings.userId, userId))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function createOrUpdateNotificationSettings(data: InsertNotificationSettings) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getNotificationSettings(data.userId);
  if (existing) {
    await db.update(notificationSettings)
      .set(data)
      .where(eq(notificationSettings.userId, data.userId));
  } else {
    await db.insert(notificationSettings).values(data);
  }
}

// --- Notification History ---
export async function createNotificationHistory(data: InsertNotificationHistory) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return insertAndReturnId(db.insert(notificationHistory).values(data), notificationHistory.id);
}

export async function getNotificationHistory(userId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: notificationHistory.id,
      skuId: notificationHistory.skuId,
      skuName: skus.name,
      currentStock: notificationHistory.currentStock,
      daysUntilStockout: notificationHistory.daysUntilStockout,
      dailyVelocity: notificationHistory.dailyVelocity,
      notificationType: notificationHistory.notificationType,
      emailSent: notificationHistory.emailSent,
      emailSentAt: notificationHistory.emailSentAt,
      createdAt: notificationHistory.createdAt,
    })
    .from(notificationHistory)
    .leftJoin(skus, eq(notificationHistory.skuId, skus.id))
    .where(eq(notificationHistory.userId, userId))
    .orderBy(desc(notificationHistory.createdAt))
    .limit(limit);
}

export async function updateNotificationHistory(id: number, data: Partial<InsertNotificationHistory>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(notificationHistory).set(data).where(eq(notificationHistory.id, id));
}
