import { Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/core/database/db';
import { products, productGrowthDiary, shops, users } from '@/core/database/schema';
import type { ApproveProductDto, RejectProductDto } from './dto/review-product.dto';
import type { UpdateShopStatusDto } from './dto/update-shop-status.dto';

type UpdateUserRoleDto = {
  role: 'buyer' | 'seller';
};

@Injectable()
export class AdminService {
  async getDashboard() {
    const [userCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users);
    const [shopCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(shops);
    const [productCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(products);
    const [pendingProductCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(products)
      .where(eq(products.status, 'pending_review'));

    const [activeShopCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(shops)
      .where(eq(shops.isActive, true));

    const [inactiveShopCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(shops)
      .where(eq(shops.isActive, false));

    const [buyerCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.role, 'buyer'));

    const [sellerCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.role, 'seller'));

    const [adminCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.role, 'admin'));

    const recentPendingProducts = await this.getProductsForReview('pending_review', 5);

    return {
      totals: {
        users: userCount.count,
        shops: shopCount.count,
        activeShops: activeShopCount.count,
        inactiveShops: inactiveShopCount.count,
        buyers: buyerCount.count,
        sellers: sellerCount.count,
        admins: adminCount.count,
        products: productCount.count,
        pendingProducts: pendingProductCount.count,
      },
      recentPendingProducts,
    };
  }

  async getUsers(role = 'all', limit = 200) {
    const whereClause =
      role === 'buyer'
        ? eq(users.role, 'buyer')
        : role === 'seller'
          ? eq(users.role, 'seller')
          : role === 'admin'
            ? eq(users.role, 'admin')
            : undefined;

    return db
      .select({
        id: users.id,
        firebaseUid: users.firebaseUid,
        phone: users.phone,
        fullName: users.fullName,
        avatar: users.avatar,
        role: users.role,
        createdAt: users.createdAt,
        shopCount: sql<number>`count(${shops.id})::int`,
        productCount: sql<number>`count(${products.id})::int`,
      })
      .from(users)
      .leftJoin(shops, eq(shops.ownerId, users.id))
      .leftJoin(products, eq(products.shopId, shops.id))
      .where(whereClause)
      .groupBy(users.id)
      .orderBy(desc(users.createdAt))
      .limit(limit);
  }

  async updateUserRole(userId: string, payload: UpdateUserRoleDto) {
    const [updated] = await db
      .update(users)
      .set({
        role: payload.role,
      })
      .where(eq(users.id, userId))
      .returning();

    if (!updated) {
      throw new NotFoundException('User not found');
    }

    return updated;
  }

  async getShops(status = 'all', limit = 100) {
    const whereClause =
      status === 'active'
        ? eq(shops.isActive, true)
        : status === 'inactive'
          ? eq(shops.isActive, false)
          : undefined;

    return db
      .select({
        id: shops.id,
        name: shops.name,
        description: shops.description,
        displayAddress: shops.displayAddress,
        logo: shops.logo,
        isActive: shops.isActive,
        rating: shops.rating,
        createdAt: shops.createdAt,
        updatedAt: shops.updatedAt,
        ownerId: users.id,
        ownerName: users.fullName,
        ownerPhone: users.phone,
        productCount: sql<number>`count(${products.id})::int`,
        activeProductCount: sql<number>`sum(case when ${products.status} = 'active' then 1 else 0 end)::int`,
      })
      .from(shops)
      .leftJoin(users, eq(shops.ownerId, users.id))
      .leftJoin(products, eq(products.shopId, shops.id))
      .where(whereClause)
      .groupBy(shops.id, users.id)
      .orderBy(desc(shops.createdAt))
      .limit(limit);
  }

  async updateShopStatus(shopId: string, payload: UpdateShopStatusDto) {
    const [updated] = await db
      .update(shops)
      .set({
        isActive: payload.isActive,
        updatedAt: new Date(),
      })
      .where(eq(shops.id, shopId))
      .returning();

    if (!updated) {
      throw new NotFoundException('Shop not found');
    }

    return updated;
  }

  async getProductsForReview(status = 'pending_review', limit = 50) {
    return db
      .select({
        id: products.id,
        name: products.name,
        origin: products.origin,
        price: products.price,
        stock: products.stock,
        unit: products.unit,
        coverImage: products.coverImage,
        status: products.status,
        rejectionReason: products.rejectionReason,
        trustScore: products.trustScore,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
        shopId: shops.id,
        shopName: shops.name,
        shopOwnerPhone: users.phone,
      })
      .from(products)
      .leftJoin(shops, eq(products.shopId, shops.id))
      .leftJoin(users, eq(shops.ownerId, users.id))
      .where(eq(products.status, status as typeof products.status.enumValues[number]))
      .orderBy(desc(products.createdAt))
      .limit(limit);
  }

  async getProductDetail(productId: string) {
    const [product] = await db
      .select({
        id: products.id,
        shopId: products.shopId,
        categoryId: products.categoryId,
        name: products.name,
        description: products.description,
        origin: products.origin,
        price: products.price,
        stock: products.stock,
        unit: products.unit,
        coverImage: products.coverImage,
        images: products.images,
        videos: products.videos,
        shippingMethods: products.shippingMethods,
        pickupAddressSnapshot: products.pickupAddressSnapshot,
        preferredShippingServiceId: products.preferredShippingServiceId,
        status: products.status,
        rejectionReason: products.rejectionReason,
        moderationScore: products.moderationScore,
        moderationResult: products.moderationResult,
        moderatedAt: products.moderatedAt,
        trustScore: products.trustScore,
        verifiedBadge: products.verifiedBadge,
        isAvailable: products.isAvailable,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
        shopName: shops.name,
        shopOwnerPhone: users.phone,
      })
      .from(products)
      .leftJoin(shops, eq(products.shopId, shops.id))
      .leftJoin(users, eq(shops.ownerId, users.id))
      .where(eq(products.id, productId))
      .limit(1);

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const growthDiary = await db
      .select()
      .from(productGrowthDiary)
      .where(eq(productGrowthDiary.productId, productId))
      .orderBy(productGrowthDiary.stageOrder);

    return {
      ...product,
      growthDiary,
    };
  }

  async approveProduct(productId: string, payload: ApproveProductDto) {
    const [updated] = await db
      .update(products)
      .set({
        status: 'active',
        rejectionReason: null,
        moderatedAt: new Date(),
        moderationResult: {
          decision: 'approved',
          note: payload.note,
        },
        updatedAt: new Date(),
      })
      .where(eq(products.id, productId))
      .returning();

    if (!updated) {
      throw new NotFoundException('Product not found');
    }

    return updated;
  }

  async rejectProduct(productId: string, payload: RejectProductDto) {
    const [updated] = await db
      .update(products)
      .set({
        status: 'rejected',
        rejectionReason: payload.reason,
        moderatedAt: new Date(),
        moderationResult: {
          decision: 'rejected',
          reason: payload.reason,
        },
        updatedAt: new Date(),
      })
      .where(eq(products.id, productId))
      .returning();

    if (!updated) {
      throw new NotFoundException('Product not found');
    }

    return updated;
  }
}
