import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { SQLWrapper } from 'drizzle-orm';
import { db } from '@/core/database/db';
import { categories, productGrowthDiary, products, shops } from '@/core/database/schema';
import { AuthService } from '@/modules/auth/auth.service';
import type { AuthenticatedUser } from '@/modules/auth/interfaces/authenticated-user.interface';
import type { CreateProductDto } from './dto/create-product.dto';
import type { UpdateSellerProductDto } from './dto/update-seller-product.dto';

type ProductSearchFilters = {
  q?: string;
  categorySlug?: string[];
  categoryId?: string[];
  tags?: string[];
  minRating?: number;
  minPrice?: number;
  maxPrice?: number;
};

@Injectable()
export class ProductsService {
  constructor(private readonly authService: AuthService) {}

  async findActiveProducts(filters: ProductSearchFilters = {}) {
    const conditions: SQLWrapper[] = [
      eq(products.status, 'active'),
      eq(products.isAvailable, true),
    ];

    if (filters.q?.trim()) {
      const keyword = `%${filters.q.trim()}%`;
      conditions.push(
        sql`(
          ${products.name} ILIKE ${keyword} OR
          ${products.description} ILIKE ${keyword} OR
          ${products.origin} ILIKE ${keyword} OR
          ${shops.name} ILIKE ${keyword}
        )`,
      );
    }

    if (filters.categorySlug?.length) {
      conditions.push(inArray(categories.slug, filters.categorySlug));
    }

    if (filters.categoryId?.length) {
      conditions.push(inArray(products.categoryId, filters.categoryId));
    }

    if (typeof filters.minRating === 'number' && !Number.isNaN(filters.minRating)) {
      conditions.push(gte(products.averageRating, filters.minRating));
    }

    if (typeof filters.minPrice === 'number' && !Number.isNaN(filters.minPrice)) {
      conditions.push(gte(products.price, filters.minPrice));
    }

    if (typeof filters.maxPrice === 'number' && !Number.isNaN(filters.maxPrice)) {
      conditions.push(lte(products.price, filters.maxPrice));
    }

    if (filters.tags?.length) {
      const tagArray = filters.tags.map((tag) => tag.toLowerCase());
      const tagLikePatterns = tagArray.map((tag) => `%${tag}%`);
      conditions.push(
        sql`(
          coalesce(${products.tags}, ARRAY[]::text[]) && ARRAY[${sql.join(
            tagArray.map((tag) => sql`${tag}`),
            sql`, `,
          )}]::text[]
          OR ${sql.join(
            tagLikePatterns.map(
              (pattern) =>
                sql`(${products.name} ILIKE ${pattern} OR ${products.description} ILIKE ${pattern})`,
            ),
            sql` OR `,
          )}
        )`,
      );
    }

    return db
      .select({
        id: products.id,
        shopId: products.shopId,
        categoryId: products.categoryId,
        categorySlug: categories.slug,
        categoryName: categories.name,
        name: products.name,
        description: products.description,
        origin: products.origin,
        price: products.price,
        stock: products.stock,
        unit: products.unit,
        tags: products.tags,
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
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(and(...conditions))
      .orderBy(desc(products.createdAt));
  }

  async findActiveProductDetail(productId: string) {
    const [product] = await db
      .select({
        id: products.id,
        shopId: products.shopId,
        categoryId: products.categoryId,
        shopOwnerId: shops.ownerId,
        name: products.name,
        description: products.description,
        origin: products.origin,
        price: products.price,
        stock: products.stock,
        unit: products.unit,
        coverImage: products.coverImage,
        tags: products.tags,
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
        categorySlug: categories.slug,
        categoryName: categories.name,
      })
      .from(products)
      .leftJoin(shops, eq(products.shopId, shops.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
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

  async listMineForSeller(currentUser: AuthenticatedUser) {
    const appUser = await this.authService.upsertAppUser(currentUser);
    const shop = await db.query.shops.findFirst({
      where: eq(shops.ownerId, appUser.id),
    });
    if (!shop) {
      throw new NotFoundException('Shop not found');
    }

    return db
      .select({
        id: products.id,
        shopId: products.shopId,
        categoryId: products.categoryId,
        categorySlug: categories.slug,
        categoryName: categories.name,
        name: products.name,
        description: products.description,
        origin: products.origin,
        price: products.price,
        stock: products.stock,
        unit: products.unit,
        tags: products.tags,
        coverImage: products.coverImage,
        images: products.images,
        videos: products.videos,
        shippingMethods: products.shippingMethods,
        status: products.status,
        rejectionReason: products.rejectionReason,
        trustScore: products.trustScore,
        verifiedBadge: products.verifiedBadge,
        averageRating: products.averageRating,
        reviewCount: products.reviewCount,
        isAvailable: products.isAvailable,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(eq(products.shopId, shop.id))
      .orderBy(desc(products.createdAt));
  }

  private async ensureMineProduct(
    currentUser: AuthenticatedUser,
    productId: string,
  ) {
    const appUser = await this.authService.upsertAppUser(currentUser);
    const shop = await db.query.shops.findFirst({
      where: eq(shops.ownerId, appUser.id),
    });
    if (!shop) {
      throw new NotFoundException('Shop not found');
    }
    const product = await db.query.products.findFirst({
      where: and(eq(products.id, productId), eq(products.shopId, shop.id)),
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return { shop, product };
  }

  async updateMineForSeller(
    currentUser: AuthenticatedUser,
    productId: string,
    payload: UpdateSellerProductDto,
  ) {
    const { product } = await this.ensureMineProduct(currentUser, productId);
    if (product.status === 'archived') {
      throw new BadRequestException('Không thể chỉnh sửa sản phẩm đã lưu trữ');
    }

    if (payload.images !== undefined && !payload.images.length) {
      throw new BadRequestException('Cần ít nhất một ảnh sản phẩm');
    }

    const hasAnyField =
      payload.name !== undefined ||
      payload.description !== undefined ||
      payload.origin !== undefined ||
      payload.price !== undefined ||
      payload.stock !== undefined ||
      payload.unit !== undefined ||
      payload.tags !== undefined ||
      payload.images !== undefined ||
      payload.videos !== undefined ||
      payload.shippingMethods !== undefined ||
      payload.isAvailable !== undefined;
    if (!hasAnyField) {
      throw new BadRequestException('Không có trường cần cập nhật');
    }

    const patch: Partial<typeof products.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (payload.name !== undefined) patch.name = payload.name;
    if (payload.description !== undefined) patch.description = payload.description;
    if (payload.origin !== undefined) patch.origin = payload.origin;
    if (payload.price !== undefined) patch.price = payload.price;
    if (payload.stock !== undefined) patch.stock = payload.stock;
    if (payload.unit !== undefined) patch.unit = payload.unit;
    if (payload.tags !== undefined) patch.tags = payload.tags;
    if (payload.images !== undefined) {
      patch.images = payload.images;
      patch.coverImage = payload.images[0];
    }
    if (payload.videos !== undefined) patch.videos = payload.videos;
    if (payload.shippingMethods !== undefined) {
      patch.shippingMethods = payload.shippingMethods;
    }
    if (payload.isAvailable !== undefined) patch.isAvailable = payload.isAvailable;

    if (product.status === 'rejected') {
      patch.status = 'pending_review';
      patch.rejectionReason = null;
    }

    const [updated] = await db
      .update(products)
      .set(patch)
      .where(eq(products.id, productId))
      .returning();

    return updated;
  }

  async archiveMineForSeller(currentUser: AuthenticatedUser, productId: string) {
    const { product } = await this.ensureMineProduct(currentUser, productId);
    if (product.status === 'archived') {
      return product;
    }
    const [updated] = await db
      .update(products)
      .set({
        status: 'archived',
        isAvailable: false,
        updatedAt: new Date(),
      })
      .where(eq(products.id, productId))
      .returning();
    return updated;
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
        tags: payload.tags ?? [],
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
