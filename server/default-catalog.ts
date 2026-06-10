import * as db from "./db";
import { calculateParLevel } from "./scheduling";

type CategorySeed = {
  name: string;
  theoreticalBatchSize: number;
  lossPercent?: number;
};

type SkuSeed = {
  name: string;
  category: string;
  dailyVelocity?: number;
  bufferDays?: number;
  leadTimeDays?: number;
  customBatchSize?: number;
};

const DEFAULT_BATCH_SIZE = 1000;

export const DEFAULT_CATEGORIES: CategorySeed[] = [
  { name: "Space Chunks", theoreticalBatchSize: DEFAULT_BATCH_SIZE },
  { name: "Mini Chunks", theoreticalBatchSize: DEFAULT_BATCH_SIZE },
  { name: "Snackbar Vapes", theoreticalBatchSize: DEFAULT_BATCH_SIZE },
  { name: "Hijnx Shooters", theoreticalBatchSize: DEFAULT_BATCH_SIZE },
  { name: "Hijnx Edibles", theoreticalBatchSize: DEFAULT_BATCH_SIZE },
  { name: "Hijnx Topicals", theoreticalBatchSize: DEFAULT_BATCH_SIZE },
];

export const DEFAULT_SKUS: SkuSeed[] = [
  { name: "Alpha Chunk - 1pk", category: "Space Chunks" },
  { name: "Alpha Chunk - 2pk", category: "Space Chunks" },
  { name: "Sleep Chunk - 1pk", category: "Space Chunks" },
  { name: "Sleep Chunk - 2pk", category: "Space Chunks" },
  { name: "Chill Chunk - 1pk", category: "Space Chunks" },
  { name: "Chill Chunk - 2pk", category: "Space Chunks" },
  { name: "Rex Chunk - 2pk", category: "Space Chunks" },
  { name: "Zuul Chunk - 2pk", category: "Space Chunks" },
  { name: "MiNi's Chunks - 10pk", category: "Mini Chunks" },
  { name: "Sugar Free MiNi's - 10pk", category: "Mini Chunks" },
  { name: "Whoopie Hi", category: "Hijnx Edibles" },
  { name: "Micro Dots", category: "Hijnx Edibles" },
  { name: "Hijnx Sampler Medley Bag", category: "Hijnx Edibles" },
  { name: "Hijnx Shooter - Watermelon 2oz", category: "Hijnx Shooters" },
  { name: "Hijnx Shooter - Sour Blue Razz 2oz", category: "Hijnx Shooters" },
  { name: "Hijnx Shooter - Triple Citrus 2oz", category: "Hijnx Shooters" },
  { name: "Snackbar Vape - Lemon Yuzu 1g", category: "Snackbar Vapes" },
  { name: "Snackbar Vape - Watermelon Lychee 1g", category: "Snackbar Vapes" },
  { name: "Snackbar Vape - Mango Magic 1g", category: "Snackbar Vapes" },
  { name: "Snackbar Vape - Grape Crush 1g", category: "Snackbar Vapes" },
  {
    name: "Snackbar Vape - Strawberry Dragonfruit 2g",
    category: "Snackbar Vapes",
  },
  {
    name: "Snackbar Vape - Peach Passion Fruit 2g",
    category: "Snackbar Vapes",
  },
  {
    name: "Snackbar Vape - Cherry Pomegranate Lemon 2g",
    category: "Snackbar Vapes",
  },
];

function normalizeCatalogName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

async function ensureDefaultCategories() {
  const existingCategories = await db.getAllCategories();
  const categoriesByName = new Map(
    existingCategories.map(category => [
      normalizeCatalogName(category.name),
      category.id,
    ])
  );

  for (const category of DEFAULT_CATEGORIES) {
    const normalized = normalizeCatalogName(category.name);
    if (categoriesByName.has(normalized)) continue;

    const lossPercent = category.lossPercent ?? 0;
    const netBatchSize = Math.floor(
      category.theoreticalBatchSize * (1 - lossPercent / 100)
    );
    const id = await db.createCategory({
      name: category.name,
      theoreticalBatchSize: category.theoreticalBatchSize,
      lossPercent,
      netBatchSize,
    });
    if (id) categoriesByName.set(normalized, id);
  }

  return categoriesByName;
}

export async function ensureDefaultSkus(skuNames: string[]) {
  const connection = await db.getDb();
  if (!connection) return;

  const requested = new Set(skuNames.map(normalizeCatalogName));
  const seedSkus = DEFAULT_SKUS.filter(sku =>
    requested.has(normalizeCatalogName(sku.name))
  );
  if (seedSkus.length === 0) return;

  const categoriesByName = await ensureDefaultCategories();

  const existingSkus = await db.getAllSkus();
  const skusByName = new Map(
    existingSkus.map(sku => [normalizeCatalogName(sku.name), sku])
  );

  for (const sku of seedSkus) {
    const normalized = normalizeCatalogName(sku.name);
    const existing = skusByName.get(normalized);
    const categoryId = categoriesByName.get(normalizeCatalogName(sku.category));
    if (!categoryId) continue;

    if (existing) {
      if (!existing.isActive)
        await db.updateSku(existing.id, { isActive: true });
      continue;
    }

    const dailyVelocity = sku.dailyVelocity ?? 0;
    const bufferDays = sku.bufferDays ?? 14;
    await db.createSku({
      name: sku.name,
      categoryId,
      dailyVelocity,
      velocitySource: "manual",
      parLevel: calculateParLevel(dailyVelocity, bufferDays),
      bufferDays,
      leadTimeDays: sku.leadTimeDays ?? 5,
      customBatchSize: sku.customBatchSize ?? null,
      isActive: true,
    });
  }
}

export async function seedDefaultCatalog() {
  await ensureDefaultSkus(DEFAULT_SKUS.map(sku => sku.name));
}
