import 'dotenv/config';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

async function seed() {
  console.log('🌱 Bắt đầu seed data...');

  // 1. Tạo Users mẫu
  console.log('...Creating users');
  const [adminUser] = await db.insert(schema.users).values({
    phone: '0901234567',
    fullName: 'Admin NongSanTot',
    role: 'admin',
    avatar: 'https://i.pravatar.cc/300',
  }).returning();

  const [sellerUser] = await db.insert(schema.users).values({
    phone: '0909888777',
    fullName: 'Nông Dân Ba',
    role: 'seller',
    avatar: 'https://i.pravatar.cc/300',
  }).returning();

  // 2. Tạo Shop mẫu
  console.log('...Creating shops');
  const [shop] = await db.insert(schema.shops).values({
    ownerId: sellerUser.id,
    name: 'Vườn Trái Cây Ba Mập',
    description: 'Chuyên cung cấp sầu riêng, măng cụt Lái Thiêu',
    displayAddress: 'Lái Thiêu, Bình Dương',
  }).returning();

  // 3. Tạo Categories
  console.log('...Creating categories');
  const categoriesData = [
    { name: 'Trái Cây', slug: 'trai-cay', icon: 'apple' },
    { name: 'Rau Củ', slug: 'rau-cu', icon: 'carrot' },
    { name: 'Thịt Trứng', slug: 'thit-trung', icon: 'egg' },
  ];
  
  // Dùng insert ... on conflict do nothing nếu chạy lại
  const insertedCategories = await db.insert(schema.categories)
    .values(categoriesData)
    .onConflictDoNothing() 
    .returning();

  // 4. Tạo Products mẫu
  if (insertedCategories.length > 0) {
    console.log('...Creating products');
    await db.insert(schema.products).values([
      {
        shopId: shop.id,
        categoryId: insertedCategories[0].id,
        name: 'Sầu Riêng Ri6',
        description: 'Sầu riêng chín cây thơm ngon, bao ăn.',
        origin: 'Bình Dương',
        price: 150000,
        stock: 100,
        unit: 'kg',
        images: ['https://example.com/saurieng.jpg'],
      },
      {
        shopId: shop.id,
        categoryId: insertedCategories[0].id,
        name: 'Măng Cụt',
        description: 'Măng cụt ngọt thanh, không mủ.',
        origin: 'Bình Dương',
        price: 60000,
        stock: 50,
        unit: 'kg',
        images: ['https://example.com/mangcut.jpg'],
      },
    ]);
  }

  console.log('✅ Seed data thành công!');
}

seed().catch((err) => {
  console.error('❌ Seed data thất bại:', err);
  process.exit(1);
});
