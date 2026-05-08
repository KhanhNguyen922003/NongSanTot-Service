import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/core/database/db';
import { addresses, shops, users } from '@/core/database/schema';
import { AuthService } from '@/modules/auth/auth.service';
import type { AuthenticatedUser } from '@/modules/auth/interfaces/authenticated-user.interface';
import type { CreateShopDto } from './dto/create-shop.dto';
import type { UpdateShopDto } from './dto/update-shop.dto';

@Injectable()
export class ShopsService {
  constructor(private readonly authService: AuthService) {}

  async createMine(currentUser: AuthenticatedUser, payload: CreateShopDto) {
    const appUser = await this.authService.upsertAppUser(currentUser);

    const existingShop = await db.query.shops.findFirst({
      where: eq(shops.ownerId, appUser.id),
    });
    if (existingShop) {
      throw new BadRequestException('User already has a shop');
    }

    const fallbackDisplayAddress = [
      payload.detail,
      payload.ward,
      payload.province,
    ]
      .map((value) => value?.trim())
      .filter((value): value is string => !!value)
      .join(', ');

    const [address] = await db
      .insert(addresses)
      .values({
        userId: appUser.id,
        receiverName: payload.receiverName ?? appUser.fullName,
        receiverPhone: payload.receiverPhone ?? appUser.phone,
        province: payload.province ?? '',
        ward: payload.ward ?? '',
        detail: payload.detail ?? '',
      })
      .returning();

    const [created] = await db
      .insert(shops)
      .values({
        ownerId: appUser.id,
        name: payload.name,
        description: payload.description,
        logo: payload.logo,
        displayAddress: payload.displayAddress?.trim() || fallbackDisplayAddress,
        defaultPickAddressId: address.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    await db
      .update(users)
      .set({ role: 'seller' })
      .where(and(eq(users.id, appUser.id), eq(users.role, 'buyer')));

    return created;
  }

  async getMine(currentUser: AuthenticatedUser) {
    const appUser = await this.authService.upsertAppUser(currentUser);

    return db.query.shops.findFirst({
      where: eq(shops.ownerId, appUser.id),
    });
  }

  async updateMine(
    currentUser: AuthenticatedUser,
    payload: UpdateShopDto,
  ) {
    const appUser = await this.authService.upsertAppUser(currentUser);
    const existing = await db.query.shops.findFirst({
      where: eq(shops.ownerId, appUser.id),
    });
    if (!existing) {
      throw new NotFoundException('Shop not found');
    }

    const patch: {
      name?: string;
      description?: string;
      logo?: string;
      displayAddress?: string;
      isActive?: boolean;
      updatedAt: Date;
    } = { updatedAt: new Date() };
    if (payload.name !== undefined) patch.name = payload.name;
    if (payload.description !== undefined) {
      patch.description = payload.description;
    }
    if (payload.logo !== undefined) patch.logo = payload.logo;
    if (payload.displayAddress !== undefined) {
      patch.displayAddress = payload.displayAddress;
    }
    if (payload.isActive !== undefined) patch.isActive = payload.isActive;

    const [updated] = await db
      .update(shops)
      .set(patch)
      .where(eq(shops.id, existing.id))
      .returning();

    return updated;
  }

  /**
   * Đóng cửa hàng (soft): ngừng hiển thị, giữ dữ liệu & FK sản phẩm.
   */
  async deactivateMine(currentUser: AuthenticatedUser) {
    return this.updateMine(currentUser, { isActive: false });
  }
}
