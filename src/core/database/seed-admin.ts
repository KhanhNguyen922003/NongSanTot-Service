import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { users } from './schema';

const adminPhone = process.env.ADMIN_SEED_PHONE || '0901234567';
const adminName = process.env.ADMIN_SEED_NAME || 'Admin NongSanTot';

async function seedAdmin() {
  const existing = await db.query.users.findFirst({
    where: eq(users.phone, adminPhone),
  });

  if (existing) {
    const [updated] = await db
      .update(users)
      .set({
        fullName: existing.fullName || adminName,
        role: 'admin',
      })
      .where(eq(users.id, existing.id))
      .returning();

    console.log(`✅ Admin account updated: ${updated.phone}`);
    return;
  }

  const [created] = await db
    .insert(users)
    .values({
      phone: adminPhone,
      fullName: adminName,
      role: 'admin',
    })
    .returning();

  console.log(`✅ Admin account seeded: ${created.phone}`);
}

seedAdmin().catch((err) => {
  console.error('❌ Seed admin thất bại:', err);
  process.exit(1);
});
