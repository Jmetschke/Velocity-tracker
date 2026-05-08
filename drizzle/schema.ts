import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  json,
} from "drizzle-orm/mysql-core";

// ─── Users ───────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── SKU Categories ──────────────────────────────────────────────────
export const skuCategories = mysqlTable("sku_categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  theoreticalBatchSize: int("theoreticalBatchSize").notNull(),
  lossPercent: decimal("lossPercent", { precision: 5, scale: 2 }).notNull().default("5.00"),
  netBatchSize: int("netBatchSize").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SkuCategory = typeof skuCategories.$inferSelect;
export type InsertSkuCategory = typeof skuCategories.$inferInsert;

// ─── SKUs ────────────────────────────────────────────────────────────
export const skus = mysqlTable("skus", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  categoryId: int("categoryId").notNull(),
  dailyVelocity: decimal("dailyVelocity", { precision: 10, scale: 2 }).default("0"),
  velocitySource: mysqlEnum("velocitySource", ["manual", "ai", "calculated"]).default("manual"),
  parLevel: int("parLevel").default(0),
  bufferDays: int("bufferDays").default(14),
  leadTimeDays: int("leadTimeDays").default(5),
  customBatchSize: int("customBatchSize"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Sku = typeof skus.$inferSelect;
export type InsertSku = typeof skus.$inferInsert;

// ─── Inventory Snapshots ─────────────────────────────────────────────
export const inventorySnapshots = mysqlTable("inventory_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  uploadedBy: int("uploadedBy"),
  fileName: varchar("fileName", { length: 512 }),
  snapshotDate: timestamp("snapshotDate").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type InventorySnapshot = typeof inventorySnapshots.$inferSelect;
export type InsertInventorySnapshot = typeof inventorySnapshots.$inferInsert;

// ─── Inventory Items (per snapshot) ──────────────────────────────────
export const inventoryItems = mysqlTable("inventory_items", {
  id: int("id").autoincrement().primaryKey(),
  snapshotId: int("snapshotId").notNull(),
  skuId: int("skuId").notNull(),
  qtyInInventory: int("qtyInInventory").default(0),
  qtyOnHold: int("qtyOnHold").default(0),
  totalQty: int("totalQty").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InsertInventoryItem = typeof inventoryItems.$inferInsert;

// ─── Sales Uploads ───────────────────────────────────────────────────
export const salesUploads = mysqlTable("sales_uploads", {
  id: int("id").autoincrement().primaryKey(),
  uploadedBy: int("uploadedBy"),
  fileName: varchar("fileName", { length: 512 }),
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending"),
  aiAnalysis: text("aiAnalysis"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SalesUpload = typeof salesUploads.$inferSelect;
export type InsertSalesUpload = typeof salesUploads.$inferInsert;

// ─── Velocity History ────────────────────────────────────────────────
export const velocityHistory = mysqlTable("velocity_history", {
  id: int("id").autoincrement().primaryKey(),
  skuId: int("skuId").notNull(),
  dailyVelocity: decimal("dailyVelocity", { precision: 10, scale: 2 }).notNull(),
  source: mysqlEnum("source", ["manual", "ai", "calculated"]).default("calculated"),
  salesUploadId: int("salesUploadId"),
  notes: text("notes"),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
});

export type VelocityHistory = typeof velocityHistory.$inferSelect;
export type InsertVelocityHistory = typeof velocityHistory.$inferInsert;

// ─── Production Batches ──────────────────────────────────────────────
export const productionBatches = mysqlTable("production_batches", {
  id: int("id").autoincrement().primaryKey(),
  skuId: int("skuId").notNull(),
  batchSize: int("batchSize").notNull(),
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate").notNull(),
  status: mysqlEnum("status", ["suggested", "scheduled", "in_progress", "completed", "cancelled"]).default("suggested"),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProductionBatch = typeof productionBatches.$inferSelect;
export type InsertProductionBatch = typeof productionBatches.$inferInsert;

// ─── Committed Batches (user-planned production runs) ───────────────
export const committedBatches = mysqlTable("committed_batches", {
  id: int("id").autoincrement().primaryKey(),
  skuId: int("skuId").notNull(),
  quantity: int("quantity").notNull(),
  calendarWeek: int("calendarWeek").notNull(), // ISO week number (1-53)
  calendarYear: int("calendarYear").notNull(),
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  status: mysqlEnum("status", ["planned", "in_progress", "completed", "cancelled"]).default("planned"),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CommittedBatch = typeof committedBatches.$inferSelect;
export type InsertCommittedBatch = typeof committedBatches.$inferInsert;

// --- Notification Settings ---
export const notificationSettings = mysqlTable("notification_settings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  stockoutThresholdDays: int("stockoutThresholdDays").default(7).notNull(),
  emailEnabled: boolean("emailEnabled").default(true).notNull(),
  notificationFrequency: mysqlEnum("notificationFrequency", ["immediate", "daily", "weekly"]).default("daily").notNull(),
  lastNotificationSentAt: timestamp("lastNotificationSentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type NotificationSettings = typeof notificationSettings.$inferSelect;
export type InsertNotificationSettings = typeof notificationSettings.$inferInsert;

// --- Notification History ---
export const notificationHistory = mysqlTable("notification_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  skuId: int("skuId").notNull(),
  currentStock: int("currentStock").notNull(),
  daysUntilStockout: decimal("daysUntilStockout", { precision: 8, scale: 2 }).notNull(),
  dailyVelocity: decimal("dailyVelocity", { precision: 10, scale: 2 }).notNull(),
  notificationType: mysqlEnum("notificationType", ["stockout_warning", "critical_alert"]).notNull(),
  emailSent: boolean("emailSent").default(false),
  emailSentAt: timestamp("emailSentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type NotificationHistory = typeof notificationHistory.$inferSelect;
export type InsertNotificationHistory = typeof notificationHistory.$inferInsert;

// ─── LLM Usage Telemetry ────────────────────────────────────────────
export const llmUsage = mysqlTable("llm_usage", {
  id: int("id").autoincrement().primaryKey(),
  userId: varchar("userId", { length: 128 }),
  action: varchar("action", { length: 128 }).notNull(),
  model: varchar("model", { length: 128 }),
  promptTokens: int("promptTokens").default(0),
  completionTokens: int("completionTokens").default(0),
  totalTokens: int("totalTokens").default(0),
  durationMs: int("durationMs").default(0),
  success: boolean("success").default(true).notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LlmUsage = typeof llmUsage.$inferSelect;
export type InsertLlmUsage = typeof llmUsage.$inferInsert;
