import 'dotenv/config';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { inArray } from 'drizzle-orm';
import * as schema from './schema';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

// Categories from the original nong-san-tot project (9 main categories)
const categorySeeds = [
  { name: 'Bánh, kẹo, đồ ăn vặt', slug: 'banh-keo-do-an-vat', icon: 'Package' },
  { name: 'Bơ, Sữa, Trứng', slug: 'bo-sua-trung', icon: 'Milk' },
  { name: 'Đồ Khô, mắm, gia vị', slug: 'do-kho-mam-gia-vi', icon: 'Sprout' },
  { name: 'Đồ uống - giải khát', slug: 'do-uong-giai-khat', icon: 'Coffee' },
  { name: 'Rau, củ, trái cây', slug: 'rau-cu-trai-cay', icon: 'Carrot' },
  { name: 'Thịt', slug: 'thit', icon: 'Drumstick' },
  { name: 'Thực phẩm chế biến sẵn', slug: 'thuc-pham-che-bien-san', icon: 'UtensilsCrossed' },
  { name: 'Hải Sản', slug: 'hai-san', icon: 'Fish' },
  { name: 'Thực phẩm khác', slug: 'thuc-pham-khac', icon: 'Package' },
];

async function seedCategories() {
  const existingCategories = await db.query.categories.findMany({
    where: inArray(schema.categories.slug, categorySeeds.map((item) => item.slug)),
  });

  const existingSlugSet = new Set(existingCategories.map((item) => item.slug));
  const missingCategories = categorySeeds.filter((item) => !existingSlugSet.has(item.slug));

  if (missingCategories.length > 0) {
    await db.insert(schema.categories).values(missingCategories).onConflictDoNothing();
  }

  return db.query.categories.findMany({
    where: inArray(schema.categories.slug, categorySeeds.map((item) => item.slug)),
  });
}

async function seed() {
  console.log('🌱 Bắt đầu seed categories...');

  try {
    const categories = await seedCategories();
    console.log(`✅ Seed ${categories.length} categories thành công!`);
  } catch (error) {
    console.error('❌ Seed categories thất bại:', error);
    throw error;
  }
}

seed().catch((err) => {
  console.error('❌ Seed data thất bại:', err);
  process.exit(1);
});
