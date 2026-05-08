import { Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/core/database/db';
import { products, productGrowthDiary, shops, users } from '@/core/database/schema';
import type { ApproveProductDto, RejectProductDto } from './dto/review-product.dto';

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

    const recentPendingProducts = await this.getProductsForReview('pending_review', 5);

    return {
      totals: {
        users: userCount.count,
        shops: shopCount.count,
        products: productCount.count,
        pendingProducts: pendingProductCount.count,
      },
      recentPendingProducts,
    };
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
