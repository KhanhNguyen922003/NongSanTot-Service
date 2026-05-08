import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { db } from '@/core/database/db';
import { cartItems, carts, products, shops } from '@/core/database/schema';
import { AuthService } from '@/modules/auth/auth.service';
import type { AuthenticatedUser } from '@/modules/auth/interfaces/authenticated-user.interface';
import type { AddCartItemDto } from './dto/add-cart-item.dto';
import type { UpdateCartItemDto } from './dto/update-cart-item.dto';

@Injectable()
export class CartsService {
  constructor(private readonly authService: AuthService) {}

  async getMyCart(currentUser: AuthenticatedUser) {
    const appUser = await this.authService.upsertAppUser(currentUser);
    const cart = await this.ensureMyCart(appUser.id);

    const items = await db
      .select({
        id: cartItems.id,
        cartId: cartItems.cartId,
        productId: cartItems.productId,
        quantity: cartItems.quantity,
        productName: products.name,
        productPrice: products.price,
        productUnit: products.unit,
        productStock: products.stock,
        productCoverImage: products.coverImage,
        productImages: products.images,
        productStatus: products.status,
        productIsAvailable: products.isAvailable,
        shopId: shops.id,
        shopName: shops.name,
        shopDisplayAddress: shops.displayAddress,
      })
      .from(cartItems)
      .leftJoin(products, eq(cartItems.productId, products.id))
      .leftJoin(shops, eq(products.shopId, shops.id))
      .where(eq(cartItems.cartId, cart.id));

    return {
      id: cart.id,
      userId: cart.userId,
      items,
    };
  }

  async addItem(currentUser: AuthenticatedUser, payload: AddCartItemDto) {
    const appUser = await this.authService.upsertAppUser(currentUser);
    const cart = await this.ensureMyCart(appUser.id);
    const product = await this.ensurePurchasableProduct(payload.productId);

    if (product.shopOwnerId === appUser.id) {
      throw new BadRequestException('Không thể thêm sản phẩm của chính bạn vào giỏ hàng');
    }

    const existing = await db.query.cartItems.findFirst({
      where: and(
        eq(cartItems.cartId, cart.id),
        eq(cartItems.productId, payload.productId),
      ),
    });

    const nextQuantity = (existing?.quantity ?? 0) + payload.quantity;
    if (nextQuantity > product.stock) {
      throw new BadRequestException('Số lượng vượt quá tồn kho hiện có');
    }

    if (existing) {
      const [updated] = await db
        .update(cartItems)
        .set({ quantity: nextQuantity })
        .where(eq(cartItems.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(cartItems)
      .values({
        cartId: cart.id,
        productId: payload.productId,
        quantity: payload.quantity,
      })
      .returning();

    return created;
  }

  async updateMyCartItemQuantity(
    currentUser: AuthenticatedUser,
    cartItemId: string,
    payload: UpdateCartItemDto,
  ) {
    const appUser = await this.authService.upsertAppUser(currentUser);
    const cart = await this.ensureMyCart(appUser.id);
    const cartItem = await db.query.cartItems.findFirst({
      where: and(eq(cartItems.id, cartItemId), eq(cartItems.cartId, cart.id)),
    });
    if (!cartItem) {
      throw new NotFoundException('Cart item not found');
    }

    const product = await this.ensurePurchasableProduct(cartItem.productId);
    if (payload.quantity > product.stock) {
      throw new BadRequestException('Số lượng vượt quá tồn kho hiện có');
    }

    const [updated] = await db
      .update(cartItems)
      .set({ quantity: payload.quantity })
      .where(eq(cartItems.id, cartItemId))
      .returning();

    return updated;
  }

  async removeMyCartItem(currentUser: AuthenticatedUser, cartItemId: string) {
    const appUser = await this.authService.upsertAppUser(currentUser);
    const cart = await this.ensureMyCart(appUser.id);
    const cartItem = await db.query.cartItems.findFirst({
      where: and(eq(cartItems.id, cartItemId), eq(cartItems.cartId, cart.id)),
    });

    if (!cartItem) {
      throw new NotFoundException('Cart item not found');
    }

    await db.delete(cartItems).where(eq(cartItems.id, cartItemId));
    return { success: true };
  }

  private async ensureMyCart(userId: string) {
    const existing = await db.query.carts.findFirst({
      where: eq(carts.userId, userId),
    });
    if (existing) return existing;

    const [created] = await db.insert(carts).values({ userId }).returning();
    return created;
  }

  private async ensurePurchasableProduct(productId: string) {
    const [product] = await db
      .select({
        id: products.id,
        stock: products.stock,
        status: products.status,
        isAvailable: products.isAvailable,
        shopOwnerId: shops.ownerId,
      })
      .from(products)
      .leftJoin(shops, eq(products.shopId, shops.id))
      .where(eq(products.id, productId))
      .limit(1);

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.status !== 'active' || product.isAvailable !== true) {
      throw new ForbiddenException('Sản phẩm chưa sẵn sàng để mua');
    }

    return product;
  }
}
