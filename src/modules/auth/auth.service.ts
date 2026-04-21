import { Injectable, UnauthorizedException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { db } from '@/core/database/db';
import { users } from '@/core/database/schema';
import type { AuthenticatedUser } from './interfaces/authenticated-user.interface';

@Injectable()
export class AuthService {
  private buildFallbackName(user: AuthenticatedUser): string {
    return user.name?.trim() || user.phoneNumber || `User ${user.uid.slice(0, 8)}`;
  }

  async upsertAppUser(currentUser: AuthenticatedUser) {
    if (!currentUser.phoneNumber) {
      throw new UnauthorizedException('Phone auth is required');
    }

    const existingByUid = await db.query.users.findFirst({
      where: eq(users.firebaseUid, currentUser.uid),
    });
    if (existingByUid) return existingByUid;

    const existingByPhone = await db.query.users.findFirst({
      where: eq(users.phone, currentUser.phoneNumber),
    });

    if (existingByPhone) {
      const [updated] = await db
        .update(users)
        .set({ firebaseUid: currentUser.uid })
        .where(eq(users.id, existingByPhone.id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(users)
      .values({
        firebaseUid: currentUser.uid,
        phone: currentUser.phoneNumber,
        fullName: this.buildFallbackName(currentUser),
      })
      .returning();

    return created;
  }
}
