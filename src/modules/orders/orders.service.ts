import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, isNull, sql, gte } from 'drizzle-orm';
import axios from 'axios';
import { db } from '@/core/database/db';
import {
  addresses,
  cartItems,
  carts,
  negotiationOffers,
  orderItems,
  orders,
  products,
  shops,
} from '@/core/database/schema';
import { AuthService } from '@/modules/auth/auth.service';
import type { AuthenticatedUser } from '@/modules/auth/interfaces/authenticated-user.interface';
import type { BuyerConfirmNegotiationOrderDto } from './dto/buyer-confirm-negotiation.dto';
import type { CheckoutOrdersDto } from './dto/checkout-orders.dto';
import type { ConfirmOrderDto } from './dto/confirm-order.dto';

type ShippingAddressSnapshot = {
  addressId: string;
  receiverName: string;
  receiverPhone: string;
  province: string;
  ward: string;
  detail: string;
};

type NegotiationAddressPlaceholder = {
  negotiationPendingAddress: true;
};

type NegotiationOfferRow = typeof negotiationOffers.$inferSelect;

type CartLine = {
  id: string;
  productId: string;
  quantity: number;
  productPrice: number;
  productName: string;
  productUnit: string | null;
  shopId: string;
  shopName: string;
};

type ShippingQuote = {
  fee: number;
  feeText: string;
  isMock: boolean;
};

@Injectable()
export class OrdersService {
  constructor(private readonly authService: AuthService) {}

  async quoteShippingForMyCart(
    currentUser: AuthenticatedUser,
    shippingAddressId: string,
    fastShipping = false,
  ) {
    const appUser = await this.authService.upsertAppUser(currentUser);
    const buyerAddress = await this.ensureAddressOfUser(shippingAddressId, appUser.id);
    const cart = await this.ensureMyCart(appUser.id);
    const items = await this.loadCartItems(cart.id);
    if (!items.length) {
      throw new BadRequestException('Giỏ hàng trống');
    }

    const groupedByShop = this.groupCartItemsByShop(items);
    const quotes = await Promise.all(
      groupedByShop.map(async (group) => {
        const pickAddress = await this.ensureShopPickAddress(group.shopId);
        const quote = await this.quoteShippingFee({
          pickAddress: pickAddress.detail,
          pickProvince: pickAddress.province,
          pickDistrict: this.resolveDistrictLikeField(
            pickAddress.detail,
            pickAddress.ward,
            pickAddress.province,
          ),
          pickWard: pickAddress.ward,
          address: buyerAddress.detail,
          province: buyerAddress.province,
          district: this.resolveDistrictLikeField(
            buyerAddress.detail,
            buyerAddress.ward,
            buyerAddress.province,
          ),
          ward: buyerAddress.ward,
          weight: this.calculateGroupWeightGram(group.items),
          fastShipping,
        });
        const itemsTotal = group.items.reduce(
          (sum, item) => sum + item.productPrice * item.quantity,
          0,
        );
        return {
          shopId: group.shopId,
          shopName: group.shopName,
          shippingFee: quote.fee,
          shippingFeeText: quote.feeText,
          isMock: quote.isMock,
          itemsTotal,
          finalTotal: itemsTotal + quote.fee,
        };
      }),
    );

    return {
      shippingAddressId,
      fastShipping,
      quotes,
      totals: {
        itemsTotal: quotes.reduce((sum, q) => sum + q.itemsTotal, 0),
        shippingTotal: quotes.reduce((sum, q) => sum + q.shippingFee, 0),
        finalTotal: quotes.reduce((sum, q) => sum + q.finalTotal, 0),
      },
    };
  }

  async checkoutFromMyCart(currentUser: AuthenticatedUser, payload: CheckoutOrdersDto) {
    const appUser = await this.authService.upsertAppUser(currentUser);
    const buyerAddress = await this.ensureAddressOfUser(payload.shippingAddressId, appUser.id);
    const cart = await this.ensureMyCart(appUser.id);
    const items = await this.loadCartItems(cart.id);
    if (!items.length) {
      throw new BadRequestException('Giỏ hàng trống');
    }

    const groupedByShop = this.groupCartItemsByShop(items);
    const createdOrders: Array<typeof orders.$inferSelect> = [];

    try {
      for (const group of groupedByShop) {
        const pickAddress = await this.ensureShopPickAddress(group.shopId);
        const quote = await this.quoteShippingFee({
          pickAddress: pickAddress.detail,
          pickProvince: pickAddress.province,
          pickDistrict: this.resolveDistrictLikeField(
            pickAddress.detail,
            pickAddress.ward,
            pickAddress.province,
          ),
          pickWard: pickAddress.ward,
          address: buyerAddress.detail,
          province: buyerAddress.province,
          district: this.resolveDistrictLikeField(
            buyerAddress.detail,
            buyerAddress.ward,
            buyerAddress.province,
          ),
          ward: buyerAddress.ward,
          weight: this.calculateGroupWeightGram(group.items),
          fastShipping: payload.fastShipping ?? false,
        });

        const itemsTotal = group.items.reduce(
          (sum, item) => sum + item.productPrice * item.quantity,
          0,
        );
        const shippingFee = quote.fee;
        const finalPrice = itemsTotal + shippingFee;
        const snapshot: ShippingAddressSnapshot = {
          addressId: buyerAddress.id,
          receiverName: buyerAddress.receiverName,
          receiverPhone: buyerAddress.receiverPhone,
          province: buyerAddress.province,
          ward: buyerAddress.ward,
          detail: buyerAddress.detail,
        };

        const createdOrder = await this.insertOrderAndReserveStock(
          {
            buyerId: appUser.id,
            shopId: group.shopId,
            shippingAddressSnapshot: JSON.stringify(snapshot),
            actualPickAddressId: pickAddress.id,
            totalPrice: itemsTotal,
            shippingFee,
            finalPrice,
            status: 'pending',
            isStockReserved: true,
            note: payload.note,
            createdAt: new Date(),
          },
          group.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            priceAtPurchase: item.productPrice,
          })),
        );

        createdOrders.push(createdOrder);
      }
    } catch (error) {
      await this.rollbackCreatedOrders(createdOrders);
      throw error;
    }

    await Promise.all(
      items.map((item) => db.delete(cartItems).where(eq(cartItems.id, item.id))),
    );

    return {
      success: true,
      orders: createdOrders,
      message: 'Đặt hàng thành công. Đơn đang chờ shop xác nhận.',
    };
  }

  async getMyBuyOrders(
    currentUser: AuthenticatedUser,
    options?: { ghtkStatus?: string },
  ) {
    const appUser = await this.authService.upsertAppUser(currentUser);
    const raw = options?.ghtkStatus?.trim();

    const whereParts = [eq(orders.buyerId, appUser.id)];
    if (raw === 'none') {
      whereParts.push(isNull(orders.ghtkShipmentStatus));
    } else if (raw && raw !== 'all') {
      const n = Number(raw);
      if (Number.isFinite(n)) {
        whereParts.push(eq(orders.ghtkShipmentStatus, n));
      }
    }

    const rows = await db
      .select({
        id: orders.id,
        buyerId: orders.buyerId,
        shopId: orders.shopId,
        shippingAddressSnapshot: orders.shippingAddressSnapshot,
        actualPickAddressId: orders.actualPickAddressId,
        totalPrice: orders.totalPrice,
        shippingFee: orders.shippingFee,
        finalPrice: orders.finalPrice,
        status: orders.status,
        shippingCode: orders.shippingCode,
        note: orders.note,
        negotiationOfferId: orders.negotiationOfferId,
        createdAt: orders.createdAt,
        ghtkShipmentStatus: orders.ghtkShipmentStatus,
        shopName: shops.name,
      })
      .from(orders)
      .innerJoin(shops, eq(orders.shopId, shops.id))
      .where(and(...whereParts))
      .orderBy(desc(orders.createdAt));

    if (!rows.length) {
      return rows.map((r) => ({ ...r, productNames: [] as string[] }));
    }

    const orderIds = rows.map((r) => r.id);
    const itemRows = await db
      .select({
        orderId: orderItems.orderId,
        productName: products.name,
      })
      .from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(inArray(orderItems.orderId, orderIds));

    const namesByOrder = new Map<string, string[]>();
    for (const row of itemRows) {
      const name = row.productName;
      if (!name) continue;
      const arr = namesByOrder.get(row.orderId) ?? [];
      if (!arr.includes(name)) arr.push(name);
      namesByOrder.set(row.orderId, arr);
    }

    return rows.map((r) => ({
      ...r,
      productNames: namesByOrder.get(r.id) ?? [],
    }));
  }

  async getMySellOrders(currentUser: AuthenticatedUser) {
    const appUser = await this.authService.upsertAppUser(currentUser);
    const shop = await db.query.shops.findFirst({
      where: eq(shops.ownerId, appUser.id),
    });
    if (!shop) return [];

    const rawOrders = await db.query.orders.findMany({
      where: eq(orders.shopId, shop.id),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
    });

    if (!rawOrders.length) return [];

    const orderIds = rawOrders.map((r) => r.id);
    const itemRows = await db
      .select({
        id: orderItems.id,
        orderId: orderItems.orderId,
        productId: orderItems.productId,
        quantity: orderItems.quantity,
        priceAtPurchase: orderItems.priceAtPurchase,
        productName: products.name,
        productCoverImage: products.coverImage,
      })
      .from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(inArray(orderItems.orderId, orderIds));

    const itemsByOrder = new Map<string, typeof itemRows>();
    for (const row of itemRows) {
      const arr = itemsByOrder.get(row.orderId) ?? [];
      arr.push(row);
      itemsByOrder.set(row.orderId, arr);
    }

    return rawOrders.map((r) => ({
      ...r,
      items: itemsByOrder.get(r.id) ?? [],
      shippingAddressSnapshot: this.safeParseSnapshot(r.shippingAddressSnapshot),
      shop,
    }));
  }

  async getOrderDetail(currentUser: AuthenticatedUser, orderId: string) {
    const appUser = await this.authService.upsertAppUser(currentUser);
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const shop = await db.query.shops.findFirst({
      where: eq(shops.id, order.shopId),
    });
    const canRead =
      order.buyerId === appUser.id || (shop && shop.ownerId === appUser.id);
    if (!canRead) {
      throw new ForbiddenException('Bạn không có quyền truy cập đơn hàng này');
    }

    const items = await db
      .select({
        id: orderItems.id,
        orderId: orderItems.orderId,
        productId: orderItems.productId,
        quantity: orderItems.quantity,
        priceAtPurchase: orderItems.priceAtPurchase,
        productName: products.name,
        productCoverImage: products.coverImage,
      })
      .from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orderItems.orderId, order.id));

    const snapshot = this.safeParseSnapshot(order.shippingAddressSnapshot);

    return {
      ...order,
      shippingAddressSnapshot: snapshot,
      items,
      shop,
      negotiationAwaitingBuyerAddress:
        order.status === 'awaiting_buyer_address' &&
        this.isNegotiationAddressPlaceholder(order.shippingAddressSnapshot),
    };
  }

  /**
   * Tra cứu trạng thái vận đơn GHTK (GET services/shipment/v2/{mã}).
   * Buyer hoặc chủ shop của đơn được gọi; mã lấy từ shippingCode sau khi seller xác nhận.
   */
  async getGhtkShipmentTracking(currentUser: AuthenticatedUser, orderId: string) {
    const appUser = await this.authService.upsertAppUser(currentUser);
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const shop = await db.query.shops.findFirst({
      where: eq(shops.id, order.shopId),
    });
    const canRead =
      order.buyerId === appUser.id || (shop && shop.ownerId === appUser.id);
    if (!canRead) {
      throw new ForbiddenException('Bạn không có quyền truy cập đơn hàng này');
    }

    const code = order.shippingCode?.trim();
    if (!code) {
      throw new BadRequestException('Đơn chưa có mã vận đơn để tra cứu GHTK');
    }

    const apiToken = process.env.GHTK_API_TOKEN;
    const apiUrl = process.env.GHTK_API_URL || 'https://services.giaohangtietkiem.vn';

    if (!apiToken || code.startsWith('MOCK-')) {
      return {
        success: true,
        isMock: true,
        message: code.startsWith('MOCK-')
          ? 'Đơn demo (MOCK): không có dữ liệu trên hệ thống GHTK thật.'
          : 'Chưa cấu hình GHTK_API_TOKEN — hiển thị dữ liệu mô phỏng.',
        order: this.buildMockGhtkTrackingPayload(order.id, code),
      };
    }

    try {
      const response = await axios.get(
        `${apiUrl}/services/shipment/v2/${encodeURIComponent(code)}`,
        {
          headers: { Token: apiToken },
        },
      );

      const body = response.data as {
        success?: boolean;
        message?: string;
        order?: Record<string, unknown>;
      };

      if (!body?.success || !body.order) {
        throw new BadRequestException(
          typeof body?.message === 'string' && body.message
            ? body.message
            : 'GHTK không trả dữ liệu đơn vận chuyển',
        );
      }

      const normalized = this.normalizeGhtkShipmentOrder(body.order);
      const ghtkSt = this.parseGhtkShipmentStatus(normalized.status);
      if (ghtkSt !== null) {
        await db
          .update(orders)
          .set({ ghtkShipmentStatus: ghtkSt })
          .where(eq(orders.id, orderId));
      }

      return {
        success: true,
        isMock: false,
        message: typeof body.message === 'string' ? body.message : '',
        order: normalized,
      };
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const data = err.response?.data as { message?: string } | undefined;
        const msg =
          data?.message ||
          err.message ||
          'Không tra cứu được vận đơn GHTK';
        throw new BadRequestException(msg);
      }
      throw err;
    }
  }

  private buildMockGhtkTrackingPayload(partnerId: string, labelId: string) {
    return {
      labelId,
      partnerId,
      status: '-1',
      statusText: 'Demo / mô phỏng',
      created: null as string | null,
      modified: null as string | null,
      message: null as string | null,
      pickDate: null as string | null,
      deliverDate: null as string | null,
      shipMoney: null as string | null,
      insurance: null as string | null,
      value: null as string | null,
      weight: null as string | null,
      pickMoney: null as number | null,
      isFreeship: null as string | null,
      customerFullname: null as string | null,
      customerTel: null as string | null,
      address: null as string | null,
      storageDay: null as string | null,
    };
  }

  private parseGhtkShipmentStatus(value: unknown): number | null {
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  private normalizeGhtkShipmentOrder(o: Record<string, unknown>) {
    const str = (v: unknown) => (v == null ? null : String(v));
    const num = (v: unknown) => {
      if (v == null || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    return {
      labelId: str(o.label_id),
      partnerId: str(o.partner_id),
      status: str(o.status),
      statusText: str(o.status_text),
      created: str(o.created),
      modified: str(o.modified),
      message: str(o.message),
      pickDate: str(o.pick_date),
      deliverDate: str(o.deliver_date),
      shipMoney: str(o.ship_money),
      insurance: str(o.insurance),
      value: str(o.value),
      weight: str(o.weight),
      pickMoney: num(o.pick_money),
      isFreeship: str(o.is_freeship),
      customerFullname: str(o.customer_fullname),
      customerTel: str(o.customer_tel),
      address: str(o.address),
      storageDay: str(o.storage_day),
    };
  }

  async confirmOrderBySeller(
    currentUser: AuthenticatedUser,
    orderId: string,
    payload: ConfirmOrderDto,
  ) {
    const appUser = await this.authService.upsertAppUser(currentUser);
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });
    if (!order) throw new NotFoundException('Order not found');

    const shop = await db.query.shops.findFirst({
      where: eq(shops.id, order.shopId),
    });
    if (!shop || shop.ownerId !== appUser.id) {
      throw new ForbiddenException('Bạn không có quyền xác nhận đơn này');
    }
    if (order.status !== 'pending') {
      throw new BadRequestException('Chỉ đơn pending mới có thể xác nhận');
    }

    const shippingSnapshot = this.safeParseSnapshot(order.shippingAddressSnapshot);
    if (!shippingSnapshot) {
      throw new BadRequestException('Đơn hàng thiếu snapshot địa chỉ giao');
    }

    const pickAddress = payload.actualPickAddressId
      ? await this.ensureAddressOfUser(payload.actualPickAddressId, appUser.id)
      : await this.ensureShopPickAddress(order.shopId);

    const quote = await this.quoteShippingFee({
      pickAddress: pickAddress.detail,
      pickProvince: pickAddress.province,
      pickDistrict: this.resolveDistrictLikeField(
        pickAddress.detail,
        pickAddress.ward,
        pickAddress.province,
      ),
      pickWard: pickAddress.ward,
      address: shippingSnapshot.detail,
      province: shippingSnapshot.province,
      district: this.resolveDistrictLikeField(
        shippingSnapshot.detail,
        shippingSnapshot.ward,
        shippingSnapshot.province,
      ),
      ward: shippingSnapshot.ward,
      weight: await this.calculateOrderWeightGram(order.id),
      fastShipping: payload.fastShipping ?? false,
    });

    const ghtkOrder = await this.createGhtkOrder({
      order,
      pickAddress,
      shippingSnapshot,
      fastShipping: payload.fastShipping ?? false,
    });

    const [updated] = await db
      .update(orders)
      .set({
        status: 'confirmed',
        actualPickAddressId: pickAddress.id,
        shippingFee: quote.fee,
        finalPrice: order.totalPrice + quote.fee,
        shippingCode: ghtkOrder.trackingCode,
        ghtkShipmentStatus: ghtkOrder.ghtkStatus,
        note: ghtkOrder.message ? `${order.note || ''}\n${ghtkOrder.message}`.trim() : order.note,
      })
      .where(eq(orders.id, orderId))
      .returning();

    return {
      ...updated,
      ghtk: ghtkOrder,
    };
  }

  async cancelOrder(currentUser: AuthenticatedUser, orderId: string) {
    const appUser = await this.authService.upsertAppUser(currentUser);
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });
    if (!order) throw new NotFoundException('Order not found');

    const shop = await db.query.shops.findFirst({
      where: eq(shops.id, order.shopId),
    });
    const canCancel =
      order.buyerId === appUser.id || (shop && shop.ownerId === appUser.id);
    if (!canCancel) {
      throw new ForbiddenException('Bạn không có quyền hủy đơn này');
    }

    if (order.status === 'delivered' || order.status === 'cancelled') {
      throw new BadRequestException('Đơn đã hoàn tất hoặc đã hủy');
    }

    // If stock was reserved for this order, restore it before marking cancelled.
    if (order.isStockReserved) {
      const items = await db
        .select({ productId: orderItems.productId, quantity: orderItems.quantity })
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));

      await this.restoreReservedStock(items);

      const [updated] = await db
        .update(orders)
        .set({ status: 'cancelled', isStockReserved: false })
        .where(eq(orders.id, orderId))
        .returning();

      return updated;
    }

    const [updated] = await db
      .update(orders)
      .set({ status: 'cancelled' })
      .where(eq(orders.id, orderId))
      .returning();
    return updated;
  }

  /**
   * Seller tạo đơn sau khi hai bên đã chấp nhận thẻ giá — chờ buyer nhập địa chỉ giao.
   */
  async createOrderFromNegotiationOffer(params: {
    sellerUserId: string;
    buyerId: string;
    shopId: string;
    offer: NegotiationOfferRow;
    note?: string;
  }) {
    const shop = await db.query.shops.findFirst({
      where: eq(shops.id, params.shopId),
    });
    if (!shop || shop.ownerId !== params.sellerUserId) {
      throw new ForbiddenException('Bạn không có quyền tạo đơn cho shop này');
    }

    const dup = await db.query.orders.findFirst({
      where: eq(orders.negotiationOfferId, params.offer.id),
    });
    if (dup) {
      throw new BadRequestException('Đã tạo đơn từ thẻ thương lượng này');
    }

    const product = await db.query.products.findFirst({
      where: eq(products.id, params.offer.productId),
    });
    if (!product || product.status !== 'active' || product.isAvailable !== true) {
      throw new BadRequestException('Sản phẩm không còn bán');
    }
    if (params.offer.quantity > product.stock) {
      throw new BadRequestException('Số lượng vượt tồn kho');
    }
    if (product.shopId !== params.shopId) {
      throw new BadRequestException('Sản phẩm không thuộc shop này');
    }

    const pickAddress = await this.ensureShopPickAddress(params.shopId);
    const itemsTotal = params.offer.unitPrice * params.offer.quantity;
    const placeholder = JSON.stringify({
      negotiationPendingAddress: true,
    } satisfies NegotiationAddressPlaceholder);

    return this.insertOrderAndReserveStock(
      {
        buyerId: params.buyerId,
        shopId: params.shopId,
        shippingAddressSnapshot: placeholder,
        actualPickAddressId: pickAddress.id,
        totalPrice: itemsTotal,
        shippingFee: 0,
        finalPrice: itemsTotal,
        status: 'awaiting_buyer_address',
        isStockReserved: true,
        note: params.note,
        negotiationOfferId: params.offer.id,
        createdAt: new Date(),
      },
      [
        {
          productId: params.offer.productId,
          quantity: params.offer.quantity,
          priceAtPurchase: params.offer.unitPrice,
        },
      ],
    );
  }

  async buyerConfirmNegotiationOrder(
    currentUser: AuthenticatedUser,
    orderId: string,
    payload: BuyerConfirmNegotiationOrderDto,
  ) {
    const appUser = await this.authService.upsertAppUser(currentUser);
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== appUser.id) {
      throw new ForbiddenException('Chỉ người mua mới xác nhận địa chỉ cho đơn này');
    }
    if (order.status !== 'awaiting_buyer_address') {
      throw new BadRequestException('Đơn không ở trạng thái chờ địa chỉ');
    }
    if (!this.isNegotiationAddressPlaceholder(order.shippingAddressSnapshot)) {
      throw new BadRequestException('Đơn đã có địa chỉ giao');
    }

    const buyerAddress = await this.ensureAddressOfUser(
      payload.shippingAddressId,
      appUser.id,
    );
    const pickAddress = order.actualPickAddressId
      ? await db.query.addresses.findFirst({
          where: eq(addresses.id, order.actualPickAddressId),
        })
      : null;
    const resolvedPick =
      pickAddress && pickAddress.id ? pickAddress : await this.ensureShopPickAddress(order.shopId);

    const quote = await this.quoteShippingFee({
      pickAddress: resolvedPick.detail,
      pickProvince: resolvedPick.province,
      pickDistrict: this.resolveDistrictLikeField(
        resolvedPick.detail,
        resolvedPick.ward,
        resolvedPick.province,
      ),
      pickWard: resolvedPick.ward,
      address: buyerAddress.detail,
      province: buyerAddress.province,
      district: this.resolveDistrictLikeField(
        buyerAddress.detail,
        buyerAddress.ward,
        buyerAddress.province,
      ),
      ward: buyerAddress.ward,
      weight: await this.calculateOrderWeightGram(order.id),
      fastShipping: payload.fastShipping ?? false,
    });

    const snapshot: ShippingAddressSnapshot = {
      addressId: buyerAddress.id,
      receiverName: buyerAddress.receiverName,
      receiverPhone: buyerAddress.receiverPhone,
      province: buyerAddress.province,
      ward: buyerAddress.ward,
      detail: buyerAddress.detail,
    };

    const shippingFee = quote.fee;
    const finalPrice = order.totalPrice + shippingFee;

    const [updated] = await db
      .update(orders)
      .set({
        shippingAddressSnapshot: JSON.stringify(snapshot),
        shippingFee,
        finalPrice,
        status: 'pending',
      })
      .where(eq(orders.id, orderId))
      .returning();

    return updated;
  }

  private isNegotiationAddressPlaceholder(value: string) {
    try {
      const o = JSON.parse(value) as NegotiationAddressPlaceholder | Record<string, unknown>;
      return o && typeof o === 'object' && o.negotiationPendingAddress === true;
    } catch {
      return false;
    }
  }

  private async ensureMyCart(userId: string) {
    const existing = await db.query.carts.findFirst({
      where: eq(carts.userId, userId),
    });
    if (existing) return existing;
    const [created] = await db.insert(carts).values({ userId }).returning();
    return created;
  }

  private async ensureAddressOfUser(addressId: string, userId: string) {
    const address = await db.query.addresses.findFirst({
      where: and(eq(addresses.id, addressId), eq(addresses.userId, userId)),
    });
    if (!address) {
      throw new NotFoundException('Address not found');
    }
    return address;
  }

  private async ensureShopPickAddress(shopId: string) {
    const shop = await db.query.shops.findFirst({
      where: eq(shops.id, shopId),
    });
    if (!shop) throw new NotFoundException('Shop not found');
    if (!shop.defaultPickAddressId) {
      throw new BadRequestException(`Shop ${shop.name} chưa cấu hình địa chỉ lấy hàng mặc định`);
    }

    const address = await db.query.addresses.findFirst({
      where: eq(addresses.id, shop.defaultPickAddressId),
    });
    if (!address) throw new NotFoundException('Shop pick address not found');
    return address;
  }

  private async loadCartItems(cartId: string): Promise<CartLine[]> {
    const rows = await db
      .select({
        id: cartItems.id,
        productId: cartItems.productId,
        quantity: cartItems.quantity,
        productPrice: products.price,
        productName: products.name,
        productUnit: products.unit,
        productStatus: products.status,
        productIsAvailable: products.isAvailable,
        shopId: shops.id,
        shopName: shops.name,
      })
      .from(cartItems)
      .leftJoin(products, eq(cartItems.productId, products.id))
      .leftJoin(shops, eq(products.shopId, shops.id))
      .where(eq(cartItems.cartId, cartId));

    const invalid = rows.find(
      (item) =>
        !item.shopId ||
        item.productStatus !== 'active' ||
        item.productIsAvailable !== true,
    );
    if (invalid) {
      throw new BadRequestException('Có sản phẩm trong giỏ không còn sẵn sàng để mua');
    }

    return rows.map((item) => ({
      id: item.id,
      productId: item.productId,
      quantity: item.quantity,
      productPrice: item.productPrice ?? 0,
      productName: item.productName ?? 'Sản phẩm',
      productUnit: item.productUnit,
      shopId: item.shopId as string,
      shopName: item.shopName ?? 'Shop',
    }));
  }

  private groupCartItemsByShop(items: CartLine[]) {
    const map = new Map<string, { shopId: string; shopName: string; items: CartLine[] }>();
    items.forEach((item) => {
      const existing = map.get(item.shopId);
      if (existing) {
        existing.items.push(item);
        return;
      }
      map.set(item.shopId, {
        shopId: item.shopId,
        shopName: item.shopName,
        items: [item],
      });
    });
    return Array.from(map.values());
  }

  private async quoteShippingFee(payload: {
    pickAddress?: string;
    pickProvince: string;
    pickDistrict: string;
    pickWard?: string;
    address?: string;
    province: string;
    district: string;
    ward?: string;
    weight: number;
    fastShipping: boolean;
  }): Promise<ShippingQuote> {
    const apiToken = process.env.GHTK_API_TOKEN;
    const apiUrl = process.env.GHTK_API_URL || 'https://services.giaohangtietkiem.vn';

    if (!apiToken) {
      const fee = payload.fastShipping ? 42000 : 32000;
      return {
        fee,
        feeText: `${fee.toLocaleString('vi-VN')}đ`,
        isMock: true,
      };
    }

    const response = await axios.get(`${apiUrl}/services/shipment/fee`, {
      headers: {
        Token: apiToken,
      },
      params: {
        pick_address: payload.pickAddress,
        pick_province: payload.pickProvince,
        pick_district: payload.pickDistrict,
        pick_ward: payload.pickWard,
        address: payload.address,
        province: payload.province,
        district: payload.district,
        ward: payload.ward,
        weight: payload.weight,
        deliver_option: payload.fastShipping ? 'xteam' : 'none',
      },
    });

    const shipMoney = response.data?.fee?.options?.shipMoney ?? response.data?.fee?.fee ?? 0;
    return {
      fee: shipMoney,
      feeText: `${shipMoney.toLocaleString('vi-VN')}đ`,
      isMock: false,
    };
  }

  private async createGhtkOrder(payload: {
    order: typeof orders.$inferSelect;
    pickAddress: typeof addresses.$inferSelect;
    shippingSnapshot: ShippingAddressSnapshot;
    fastShipping: boolean;
  }) {
    const apiToken = process.env.GHTK_API_TOKEN;
    const apiUrl = process.env.GHTK_API_URL || 'https://services.giaohangtietkiem.vn';

    if (!apiToken) {
      return {
        success: true,
        trackingCode: `MOCK-${Date.now()}`,
        message: 'Mock GHTK: chưa cấu hình GHTK_API_TOKEN.',
        ghtkStatus: null as number | null,
      };
    }

    const lines = await db
      .select({
        productName: products.name,
        quantity: orderItems.quantity,
        productUnit: products.unit,
      })
      .from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orderItems.orderId, payload.order.id));

    const requestBody = {
      products: lines.map((line, index) => ({
        name: line.productName || `product-${index + 1}`,
        weight: this.estimateProductWeightKg(line.productUnit, line.quantity),
        quantity: line.quantity,
        product_code: index + 1,
      })),
      order: {
        id: payload.order.id,
        pick_name: payload.pickAddress.receiverName,
        pick_address: payload.pickAddress.detail,
        pick_province: payload.pickAddress.province,
        pick_district: this.resolveDistrictLikeField(
          payload.pickAddress.detail,
          payload.pickAddress.ward,
          payload.pickAddress.province,
        ),
        pick_ward: payload.pickAddress.ward,
        pick_tel: payload.pickAddress.receiverPhone,
        tel: payload.shippingSnapshot.receiverPhone,
        name: payload.shippingSnapshot.receiverName,
        address: payload.shippingSnapshot.detail,
        province: payload.shippingSnapshot.province,
        district: this.resolveDistrictLikeField(
          payload.shippingSnapshot.detail,
          payload.shippingSnapshot.ward,
          payload.shippingSnapshot.province,
        ),
        ward: payload.shippingSnapshot.ward,
        hamlet: 'Khac',
        pick_money: payload.order.totalPrice,
        note: payload.order.note || `Order ${payload.order.id}`,
        value: payload.order.totalPrice,
        pick_option: 'cod',
        deliver_option: payload.fastShipping ? 'xteam' : 'none',
      },
    };

    const response = await axios.post(`${apiUrl}/services/shipment/order`, requestBody, {
      headers: {
        Token: apiToken,
        'Content-Type': 'application/json',
      },
    });

    const trackingCode =
      String(response.data?.order?.tracking_id ?? response.data?.order?.label ?? '');

    if (!trackingCode) {
      throw new BadRequestException('Tạo đơn GHTK thất bại: thiếu tracking id');
    }

    const createdOrder = response.data?.order as Record<string, unknown> | undefined;
    const parsed = this.parseGhtkShipmentStatus(createdOrder?.status);

    return {
      success: true,
      trackingCode,
      message: response.data?.message as string | undefined,
      ghtkStatus: parsed ?? 1,
    };
  }

  private safeParseSnapshot(value: string) {
    try {
      return JSON.parse(value) as ShippingAddressSnapshot;
    } catch {
      return null;
    }
  }

  /**
   * District field vẫn là required trong nhiều endpoint GHTK.
   * Trong model địa chỉ mới không có district, nên normalize theo thứ tự:
   * - tách từ chuỗi detail nếu có cấu trúc nhiều cấp
   * - fallback ward
   * - fallback province
   */
  private resolveDistrictLikeField(
    detail: string | undefined,
    ward: string | undefined,
    province: string | undefined,
  ) {
    if (detail) {
      const parts = detail
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
      if (parts.length >= 2) {
        return parts[parts.length - 2];
      }
    }

    return ward || province || 'Khac';
  }

  /**
   * GHTK fee API dùng gram.
   * Khi chưa có cột trọng lượng chuẩn theo SKU, dùng heuristic theo đơn vị.
   * TODO: thêm weightGram vào products để thay thế heuristic.
   */
  private calculateGroupWeightGram(items: CartLine[]) {
    const total = items.reduce(
      (sum, item) => sum + this.estimateItemWeightGram(item.productUnit, item.quantity),
      0,
    );
    return Math.max(total, 100);
  }

  private async calculateOrderWeightGram(orderId: string) {
    const lines = await db
      .select({
        quantity: orderItems.quantity,
        productUnit: products.unit,
      })
      .from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orderItems.orderId, orderId));

    const total = lines.reduce(
      (sum, line) => sum + this.estimateItemWeightGram(line.productUnit, line.quantity),
      0,
    );
    return Math.max(total, 100);
  }

  private estimateItemWeightGram(unit: string | null, quantity: number) {
    const normalized = (unit || '').toLowerCase();
    const qty = Math.max(quantity, 1);

    if (normalized === 'kg') return Math.round(qty * 1000);
    if (normalized === 'g') return Math.round(qty);
    if (normalized === 'mg') return Math.round(qty / 1000);
    if (normalized === 'tấn') return Math.round(qty * 1_000_000);
    if (normalized === 'tạ') return Math.round(qty * 100_000);
    if (normalized === 'yến') return Math.round(qty * 10_000);

    // Đơn vị rời: dùng default 500g / item
    return Math.round(qty * 500);
  }

  /**
   * GHTK order payload thường kỳ vọng kg cho từng dòng sản phẩm.
   */
  private estimateProductWeightKg(unit: string | null, quantity: number) {
    const gram = this.estimateItemWeightGram(unit, quantity);
    return Number((gram / 1000).toFixed(3));
  }

  private async insertOrderAndReserveStock(
    orderData: typeof orders.$inferInsert,
    items: Array<{ productId: string; quantity: number; priceAtPurchase: number }>,
  ) {
    const createdOrderRes = await db.insert(orders).values(orderData).returning();
    const createdOrder = Array.isArray(createdOrderRes) ? createdOrderRes[0] : createdOrderRes;
    if (!createdOrder) {
      throw new BadRequestException('Không thể tạo đơn hàng');
    }

    const reservedItems: Array<{ productId: string; quantity: number }> = [];

    try {
      await db.insert(orderItems).values(
        items.map((item) => ({
          orderId: createdOrder.id,
          productId: item.productId,
          quantity: item.quantity,
          priceAtPurchase: item.priceAtPurchase,
        })),
      );

      for (const item of items) {
        const updatedRes = await db
          .update(products)
          .set({ stock: sql<number>`coalesce(${products.stock}, 0) - ${item.quantity}` })
          .where(and(eq(products.id, item.productId), gte(products.stock, item.quantity)))
          .returning();
        const updated = Array.isArray(updatedRes) ? updatedRes[0] : updatedRes;
        if (!updated) {
          throw new BadRequestException('Số lượng vượt tồn kho');
        }
        reservedItems.push({ productId: item.productId, quantity: item.quantity });
      }

      return createdOrder;
    } catch (error) {
      await this.restoreReservedStock(reservedItems).catch(() => undefined);
      await db.delete(orderItems).where(eq(orderItems.orderId, createdOrder.id)).catch(() => undefined);
      await db.delete(orders).where(eq(orders.id, createdOrder.id)).catch(() => undefined);
      throw error;
    }
  }

  private async restoreReservedStock(items: Array<{ productId: string; quantity: number }>) {
    for (const item of items) {
      await db
        .update(products)
        .set({ stock: sql<number>`coalesce(${products.stock}, 0) + ${item.quantity}` })
        .where(eq(products.id, item.productId));
    }
  }

  private async rollbackCreatedOrders(ordersToRollback: Array<typeof orders.$inferSelect>) {
    for (const order of [...ordersToRollback].reverse()) {
      const items = await db
        .select({ productId: orderItems.productId, quantity: orderItems.quantity })
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));

      if (items.length) {
        await this.restoreReservedStock(items);
      }

      await db.delete(orderItems).where(eq(orderItems.orderId, order.id));
      await db.delete(orders).where(eq(orders.id, order.id));
    }
  }
}
