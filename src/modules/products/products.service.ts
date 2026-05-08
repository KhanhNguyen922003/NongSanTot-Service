import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/core/database/db';
import { productGrowthDiary, products, shops } from '@/core/database/schema';
import { AuthService } from '@/modules/auth/auth.service';
import type { AuthenticatedUser } from '@/modules/auth/interfaces/authenticated-user.interface';
import type { CreateProductDto } from './dto/create-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly authService: AuthService) {}

  async findActiveProducts() {
    return db
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
        status: products.status,
        trustScore: products.trustScore,
        verifiedBadge: products.verifiedBadge,
        averageRating: products.averageRating,
        reviewCount: products.reviewCount,
        isAvailable: products.isAvailable,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
        shopName: shops.name,
        shopDisplayAddress: shops.displayAddress,
      })
      .from(products)
      .leftJoin(shops, eq(products.shopId, shops.id))
      .where(and(eq(products.status, 'active'), eq(products.isAvailable, true)))
      .orderBy(desc(products.createdAt));
  }

  async findActiveProductDetail(productId: string) {
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
        trustScore: products.trustScore,
        verifiedBadge: products.verifiedBadge,
        averageRating: products.averageRating,
        reviewCount: products.reviewCount,
        isAvailable: products.isAvailable,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
        shopName: shops.name,
        shopDisplayAddress: shops.displayAddress,
      })
      .from(products)
      .leftJoin(shops, eq(products.shopId, shops.id))
      .where(
        and(
          eq(products.id, productId),
          eq(products.status, 'active'),
          eq(products.isAvailable, true),
        ),
      )
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

  async createMine(currentUser: AuthenticatedUser, payload: CreateProductDto) {
    const appUser = await this.authService.upsertAppUser(currentUser);
    const shop = await db.query.shops.findFirst({
      where: eq(shops.ownerId, appUser.id),
    });

    if (!shop) {
      throw new NotFoundException('Shop not found');
    }

    if (shop.isActive === false) {
      throw new ForbiddenException('Shop is inactive');
    }

    const images = payload.images ?? [];
    if (!images.length) {
      throw new BadRequestException('At least one product image is required');
    }

    const [created] = await db
      .insert(products)
      .values({
        shopId: shop.id,
        categoryId: payload.categoryId,
        name: payload.name,
        description: payload.description,
        origin: payload.origin,
        price: payload.price,
        stock: payload.stock,
        unit: payload.unit,
        coverImage: images[0],
        images,
        videos: payload.videos ?? [],
        shippingMethods: payload.shippingMethods,
        pickupAddressSnapshot: payload.pickupAddress,
        preferredShippingServiceId: payload.preferredShippingServiceId,
        status: 'pending_review',
        isAvailable: payload.isAvailable ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
        trustScore: this.calculateInitialTrustScore(payload),
        verifiedBadge: false,
      })
      .returning();

    const diary = payload.growthDiary ?? [];
    if (diary.length) {
      await db.insert(productGrowthDiary).values(
        diary.map((stage, index) => ({
          productId: created.id,
          stageOrder: index + 1,
          stageName: stage.stageName,
          description: stage.description,
          images: stage.images,
          videos: [],
          documents: [],
          logDate: new Date(stage.logDate),
        })),
      );
    }

    return {
      ...created,
      growthDiaryCount: diary.length,
    };
  }

  private calculateInitialTrustScore(payload: CreateProductDto) {
    let score = 20;
    if (payload.images?.length) score += 20;
    if (payload.description?.trim().length >= 80) score += 20;
    if (payload.growthDiary?.length) score += 30;
    if ((payload.growthDiary ?? []).some((stage) => stage.images?.length)) {
      score += 10;
    }
    return Math.min(score, 100);
  }
}
