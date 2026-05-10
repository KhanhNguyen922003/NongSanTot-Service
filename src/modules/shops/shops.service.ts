import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, gte, lte, ne, sql } from 'drizzle-orm';
import { db } from '@/core/database/db';
import {
  addresses,
  conversations,
  messages,
  orders,
  products,
  reviews,
  shops,
  users,
} from '@/core/database/schema';
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

  /**
   * Số liệu tổng quan cho seller: đơn theo trạng thái, sản phẩm, đánh giá mới, tin chưa đọc.
   */
  async getMyDashboardOverview(currentUser: AuthenticatedUser) {
    const appUser = await this.authService.upsertAppUser(currentUser);
    const shop = await db.query.shops.findFirst({
      where: eq(shops.ownerId, appUser.id),
    });
    if (!shop) return null;

    const shopId = shop.id;
    const LOW_STOCK_THRESHOLD = 10;

    const orderRows = await db
      .select({
        status: orders.status,
        cnt: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(eq(orders.shopId, shopId))
      .groupBy(orders.status);

    const ordersByStatus = {
      pending: 0,
      confirmed: 0,
      processing: 0,
      shipping: 0,
      delivered: 0,
      cancelled: 0,
    };
    let ordersTotal = 0;
    for (const row of orderRows) {
      const n = Number(row.cnt);
      if (row.status && row.status in ordersByStatus) {
        ordersByStatus[row.status as keyof typeof ordersByStatus] = n;
      }
      ordersTotal += n;
    }

    const productRows = await db
      .select({
        status: products.status,
        cnt: sql<number>`count(*)::int`,
      })
      .from(products)
      .where(eq(products.shopId, shopId))
      .groupBy(products.status);

    const productsByStatus = {
      draft: 0,
      pending_review: 0,
      active: 0,
      rejected: 0,
      archived: 0,
    };
    let productsTotal = 0;
    for (const row of productRows) {
      const n = Number(row.cnt);
      if (row.status && row.status in productsByStatus) {
        productsByStatus[row.status as keyof typeof productsByStatus] = n;
      }
      productsTotal += n;
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [reviewRow] = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(reviews)
      .innerJoin(products, eq(reviews.productId, products.id))
      .where(
        and(eq(products.shopId, shopId), gte(reviews.createdAt, sevenDaysAgo)),
      );

    const [unreadRow] = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(
        and(
          eq(conversations.shopId, shopId),
          ne(messages.senderId, appUser.id),
          eq(messages.isRead, false),
        ),
      );

    const [lowStockRow] = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(products)
      .where(
        and(
          eq(products.shopId, shopId),
          eq(products.status, 'active'),
          lte(products.stock, LOW_STOCK_THRESHOLD),
        ),
      );

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [revenueRow] = await db
      .select({
        total: sql<number>`coalesce(sum(${orders.finalPrice}), 0)::float`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.shopId, shopId),
          eq(orders.status, 'delivered'),
          gte(orders.createdAt, thirtyDaysAgo),
        ),
      );

    return {
      shop: {
        id: shop.id,
        name: shop.name,
        isActive: shop.isActive,
        rating: shop.rating,
        updatedAt: shop.updatedAt,
      },
      ordersByStatus,
      ordersTotal,
      productsByStatus,
      productsTotal,
      productsLowStockCount: Number(lowStockRow?.cnt ?? 0),
      lowStockThreshold: LOW_STOCK_THRESHOLD,
      newReviewsLast7Days: Number(reviewRow?.cnt ?? 0),
      unreadBuyerMessages: Number(unreadRow?.cnt ?? 0),
      revenueDeliveredLast30Days: Number(revenueRow?.total ?? 0),
    };
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
