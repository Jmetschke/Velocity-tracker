import {
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const timestamp = (name: string) =>
  integer(name, { mode: "timestamp" }).default(sql`(unixepoch())`).notNull();

const nullableTimestamp = (name: string) =>
  integer(name, { mode: "timestamp" });

const boolean = (name: string) => integer(name, { mode: "boolean" });

// ─── Users ───────────────────────────────────────────────────────────
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  openId: text("openId").notNull().unique(),
  name: text("name"),
  email: text("email"),
  loginMethod: text("loginMethod"),
  role: text("role", { enum: ["user", "admin"] }).default("user").notNull(),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
  lastSignedIn: timestamp("lastSignedIn"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── SKU Categories ──────────────────────────────────────────────────
export const skuCategories = sqliteTable("sku_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  theoreticalBatchSize: integer("theoreticalBatchSize").notNull(),
  lossPercent: real("lossPercent").notNull().default(5),
  netBatchSize: integer("netBatchSize").notNull(),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
});

export type SkuCategory = typeof skuCategories.$inferSelect;
export type InsertSkuCategory = typeof skuCategories.$inferInsert;

// ─── SKUs ────────────────────────────────────────────────────────────
export const skus = sqliteTable("skus", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  categoryId: integer("categoryId").notNull(),
  dailyVelocity: real("dailyVelocity").default(0),
  velocitySource: text("velocitySource", { enum: ["manual", "ai", "calculated"] }).default("manual"),
  parLevel: integer("parLevel").default(0),
  bufferDays: integer("bufferDays").default(14),
  leadTimeDays: integer("leadTimeDays").default(5),
  customBatchSize: integer("customBatchSize"),
  metrcItemNames: text("metrcItemNames"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
});

export type Sku = typeof skus.$inferSelect;
export type InsertSku = typeof skus.$inferInsert;

// ─── Inventory Snapshots ─────────────────────────────────────────────
export const inventorySnapshots = sqliteTable("inventory_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  uploadedBy: integer("uploadedBy"),
  fileName: text("fileName"),
  snapshotDate: integer("snapshotDate", { mode: "timestamp" }).notNull(),
  createdAt: timestamp("createdAt"),
});

export type InventorySnapshot = typeof inventorySnapshots.$inferSelect;
export type InsertInventorySnapshot = typeof inventorySnapshots.$inferInsert;

// ─── Inventory Items (per snapshot) ──────────────────────────────────
export const inventoryItems = sqliteTable("inventory_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  snapshotId: integer("snapshotId").notNull(),
  skuId: integer("skuId").notNull(),
  qtyInInventory: integer("qtyInInventory").default(0),
  qtyOnHold: integer("qtyOnHold").default(0),
  totalQty: integer("totalQty").default(0),
  createdAt: timestamp("createdAt"),
});

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InsertInventoryItem = typeof inventoryItems.$inferInsert;

// ─── Sales Uploads ───────────────────────────────────────────────────
export const salesUploads = sqliteTable("sales_uploads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  uploadedBy: integer("uploadedBy"),
  fileName: text("fileName"),
  status: text("status", { enum: ["pending", "processing", "completed", "failed"] }).default("pending"),
  aiAnalysis: text("aiAnalysis"),
  createdAt: timestamp("createdAt"),
});

export type SalesUpload = typeof salesUploads.$inferSelect;
export type InsertSalesUpload = typeof salesUploads.$inferInsert;

// ─── Velocity History ────────────────────────────────────────────────
export const velocityHistory = sqliteTable("velocity_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  skuId: integer("skuId").notNull(),
  dailyVelocity: real("dailyVelocity").notNull(),
  source: text("source", { enum: ["manual", "ai", "calculated"] }).default("calculated"),
  salesUploadId: integer("salesUploadId"),
  notes: text("notes"),
  recordedAt: timestamp("recordedAt"),
});

export type VelocityHistory = typeof velocityHistory.$inferSelect;
export type InsertVelocityHistory = typeof velocityHistory.$inferInsert;

// ─── Production Batches ──────────────────────────────────────────────
export const productionBatches = sqliteTable("production_batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  skuId: integer("skuId").notNull(),
  batchSize: integer("batchSize").notNull(),
  startDate: integer("startDate", { mode: "timestamp" }).notNull(),
  endDate: integer("endDate", { mode: "timestamp" }).notNull(),
  status: text("status", { enum: ["suggested", "scheduled", "in_progress", "completed", "cancelled"] }).default("suggested"),
  notes: text("notes"),
  createdBy: integer("createdBy"),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
});

export type ProductionBatch = typeof productionBatches.$inferSelect;
export type InsertProductionBatch = typeof productionBatches.$inferInsert;

// ─── Committed Batches (user-planned production runs) ───────────────
export const committedBatches = sqliteTable("committed_batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  skuId: integer("skuId").notNull(),
  quantity: integer("quantity").notNull(),
  calendarWeek: integer("calendarWeek").notNull(), // ISO week number (1-53)
  calendarYear: integer("calendarYear").notNull(),
  startDate: nullableTimestamp("startDate"),
  endDate: nullableTimestamp("endDate"),
  status: text("status", { enum: ["planned", "in_progress", "completed", "cancelled"] }).default("planned"),
  notes: text("notes"),
  createdBy: integer("createdBy"),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
});

export type CommittedBatch = typeof committedBatches.$inferSelect;
export type InsertCommittedBatch = typeof committedBatches.$inferInsert;

// ─── Product Launch Roadmaps ────────────────────────────────────────
export const productLaunches = sqliteTable("product_launches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productName: text("productName").notNull(),
  codename: text("codename"),
  status: text("status", {
    enum: ["draft", "in_progress", "paused", "launched", "cancelled"],
  }).default("draft").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
});

export type ProductLaunch = typeof productLaunches.$inferSelect;
export type InsertProductLaunch = typeof productLaunches.$inferInsert;

export const productLaunchChecklistItems = sqliteTable("product_launch_checklist_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productLaunchId: integer("productLaunchId").notNull(),
  stageNumber: integer("stageNumber").notNull(),
  stageName: text("stageName").notNull(),
  taskText: text("taskText").notNull(),
  isComplete: boolean("isComplete").default(false).notNull(),
  completedAt: nullableTimestamp("completedAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
});

export type ProductLaunchChecklistItem = typeof productLaunchChecklistItems.$inferSelect;
export type InsertProductLaunchChecklistItem = typeof productLaunchChecklistItems.$inferInsert;

// --- Notification Settings ---
export const notificationSettings = sqliteTable("notification_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  stockoutThresholdDays: integer("stockoutThresholdDays").default(7).notNull(),
  emailEnabled: boolean("emailEnabled").default(true).notNull(),
  notificationFrequency: text("notificationFrequency", { enum: ["immediate", "daily", "weekly"] }).default("daily").notNull(),
  lastNotificationSentAt: nullableTimestamp("lastNotificationSentAt"),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
});

export type NotificationSettings = typeof notificationSettings.$inferSelect;
export type InsertNotificationSettings = typeof notificationSettings.$inferInsert;

// --- Notification History ---
export const notificationHistory = sqliteTable("notification_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  skuId: integer("skuId").notNull(),
  currentStock: integer("currentStock").notNull(),
  daysUntilStockout: real("daysUntilStockout").notNull(),
  dailyVelocity: real("dailyVelocity").notNull(),
  notificationType: text("notificationType", { enum: ["stockout_warning", "critical_alert"] }).notNull(),
  emailSent: boolean("emailSent").default(false),
  emailSentAt: nullableTimestamp("emailSentAt"),
  createdAt: timestamp("createdAt"),
});

export type NotificationHistory = typeof notificationHistory.$inferSelect;
export type InsertNotificationHistory = typeof notificationHistory.$inferInsert;

// ─── LLM Usage Telemetry ────────────────────────────────────────────
export const llmUsage = sqliteTable("llm_usage", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("userId"),
  action: text("action").notNull(),
  model: text("model"),
  promptTokens: integer("promptTokens").default(0),
  completionTokens: integer("completionTokens").default(0),
  totalTokens: integer("totalTokens").default(0),
  durationMs: integer("durationMs").default(0),
  success: boolean("success").default(true).notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt"),
});

export type LlmUsage = typeof llmUsage.$inferSelect;
export type InsertLlmUsage = typeof llmUsage.$inferInsert;
