import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/core/database/db';
import { orderItems, orders, products, reviews, shops, users } from '@/core/database/schema';
import { AuthService } from '@/modules/auth/auth.service';
import type { AuthenticatedUser } from '@/modules/auth/interfaces/authenticated-user.interface';
import type { CreateDemoReviewDto } from './dto/create-demo-review.dto';
import type { CreateMyReviewDto } from './dto/create-my-review.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly authService: AuthService) {}

  async getProductReviews(productId: string) {
    const product = await db.query.products.findFirst({
      where: eq(products.id, productId),
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const items = await db
      .select({
        id: reviews.id,
        productId: reviews.productId,
        buyerId: reviews.buyerId,
        orderId: reviews.orderId,
        rating: reviews.rating,
        comment: reviews.comment,
        images: reviews.images,
        createdAt: reviews.createdAt,
        reviewerName: users.fullName,
        reviewerAvatar: users.avatar,
      })
      .from(reviews)
      .leftJoin(users, eq(reviews.buyerId, users.id))
      .where(eq(reviews.productId, productId))
      .orderBy(desc(reviews.createdAt));

    const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
    for (const item of items) {
      if (item.rating >= 1 && item.rating <= 5) {
        ratingCounts[item.rating as 1 | 2 | 3 | 4 | 5] += 1;
      }
    }
    const reviewCount = items.length;
    const averageRating = reviewCount
      ? Number((items.reduce((sum, item) => sum + item.rating, 0) / reviewCount).toFixed(2))
      : 0;

    return {
      summary: {
        reviewCount,
        averageRating,
        ratingCounts,
      },
      items,
    };
  }

  async getMyReviewEligibility(currentUser: AuthenticatedUser, productId: string) {
    const appUser = await this.authService.upsertAppUser(currentUser);
    const order = await this.findReviewableOrder(appUser.id, productId);

    return {
      canReview: !!order,
      productId,
      orderId: order?.id ?? null,
      reason: order ? null : 'Chỉ đơn đã giao mới được viết review cho sản phẩm này.',
    };
  }

  async createMyReview(currentUser: AuthenticatedUser, payload: CreateMyReviewDto) {
    const appUser = await this.authService.upsertAppUser(currentUser);
    const order = await this.findReviewableOrder(appUser.id, payload.productId);
    if (!order) {
      throw new BadRequestException('Chỉ đơn delivered mới được viết review');
    }

    return this.createReviewRecord({
      buyerId: appUser.id,
      productId: payload.productId,
      orderId: order.id,
      rating: payload.rating,
      comment: payload.comment,
    });
  }

  async createDemoReview(payload: CreateDemoReviewDto) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, payload.buyerId),
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const product = await db.query.products.findFirst({
      where: eq(products.id, payload.productId),
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const shop = await db.query.shops.findFirst({
      where: eq(shops.id, product.shopId),
    });
    if (!shop) {
      throw new NotFoundException('Shop not found');
    }

    const [createdOrder] = await db
      .insert(orders)
      .values({
        buyerId: user.id,
        shopId: shop.id,
        shippingAddressSnapshot: JSON.stringify({
          demo: true,
          receiverName: user.fullName,
          receiverPhone: user.phone,
          province: shop.displayAddress || 'Demo Province',
          ward: 'Demo Ward',
          detail: 'Địa chỉ demo để tạo review',
        }),
        actualPickAddressId: shop.defaultPickAddressId,
        totalPrice: product.price,
        shippingFee: 0,
        finalPrice: product.price,
        status: 'delivered',
        isStockReserved: false,
        shippingCode: `DEMO-${Date.now()}`,
        note: 'Demo order for review generation',
        createdAt: new Date(),
      })
      .returning();

    const [createdItem] = await db
      .insert(orderItems)
      .values({
        orderId: createdOrder.id,
        productId: product.id,
        quantity: 1,
        priceAtPurchase: product.price,
      })
      .returning();

    try {
      const review = await this.createReviewRecord({
        buyerId: user.id,
        productId: product.id,
        orderId: createdOrder.id,
        rating: payload.rating,
        comment: payload.comment,
      });

      return {
        demo: true,
        review,
        order: createdOrder,
        orderItem: createdItem,
      };
    } catch (error) {
      await db.delete(orderItems).where(eq(orderItems.id, createdItem.id));
      await db.delete(orders).where(eq(orders.id, createdOrder.id));
      throw error;
    }
  }

  private async findReviewableOrder(buyerId: string, productId: string) {
    const rows = await db
      .select({
        id: orders.id,
        status: orders.status,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
      .where(
        and(
          eq(orders.buyerId, buyerId),
          eq(orders.status, 'delivered'),
          eq(orderItems.productId, productId),
        ),
      )
      .orderBy(desc(orders.createdAt));

    for (const row of rows) {
      const existing = await db.query.reviews.findFirst({
        where: and(eq(reviews.orderId, row.id), eq(reviews.productId, productId)),
      });
      if (!existing) {
        return row;
      }
    }

    return null;
  }

  private async createReviewRecord(params: {
    buyerId: string;
    productId: string;
    orderId: string;
    rating: number;
    comment?: string;
  }) {
    const product = await db.query.products.findFirst({
      where: eq(products.id, params.productId),
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const order = await db.query.orders.findFirst({
      where: and(eq(orders.id, params.orderId), eq(orders.buyerId, params.buyerId)),
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.status !== 'delivered') {
      throw new BadRequestException('Chỉ đơn đã giao mới được viết review');
    }

    const orderItem = await db.query.orderItems.findFirst({
      where: and(eq(orderItems.orderId, order.id), eq(orderItems.productId, params.productId)),
    });
    if (!orderItem) {
      throw new BadRequestException('Đơn hàng này không chứa sản phẩm được chọn');
    }

    const existing = await db.query.reviews.findFirst({
      where: and(eq(reviews.orderId, order.id), eq(reviews.productId, params.productId)),
    });
    if (existing) {
      throw new BadRequestException('Đơn hàng này đã có review cho sản phẩm');
    }

    const [created] = await db
      .insert(reviews)
      .values({
        buyerId: params.buyerId,
        productId: params.productId,
        orderId: params.orderId,
        rating: params.rating,
        comment: params.comment?.trim() || null,
        createdAt: new Date(),
      })
      .returning();

    const [stats] = await db
      .select({
        reviewCount: sql<number>`count(*)::int`,
        averageRating: sql<number>`coalesce(round(avg(${reviews.rating})::numeric, 2), 0)::float8`,
      })
      .from(reviews)
      .where(eq(reviews.productId, params.productId));

    await db
      .update(products)
      .set({
        reviewCount: stats.reviewCount,
        averageRating: stats.averageRating,
        updatedAt: new Date(),
      })
      .where(eq(products.id, params.productId));

    return created;
  }
}