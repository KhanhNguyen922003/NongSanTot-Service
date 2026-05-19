import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  type MessageEvent,
} from '@nestjs/common';
import { and, count, desc, eq, gt, inArray, isNull, ne, or } from 'drizzle-orm';
import { defer, from, switchMap, type Observable } from 'rxjs';
import { db } from '@/core/database/db';
import {
  conversations,
  messages,
  negotiationOffers,
  orders,
  products,
  shops,
  users,
} from '@/core/database/schema';
import { AuthService } from '@/modules/auth/auth.service';
import type { AuthenticatedUser } from '@/modules/auth/interfaces/authenticated-user.interface';
import { OrdersService } from '@/modules/orders/orders.service';
import { ChatActivityBus } from './chat-activity.bus';
import type { CreateNegotiationOfferDto } from './dto/create-offer.dto';
import type { CreateOrderFromNegotiationDto } from './dto/create-order-from-offer.dto';
import type { OpenProductConversationDto } from './dto/open-conversation.dto';
import type { SendChatMessageDto } from './dto/send-chat-message.dto';

type Party = 'buyer' | 'seller';

@Injectable()
export class MessagingService {
  constructor(
    private readonly authService: AuthService,
    private readonly ordersService: OrdersService,
    private readonly chatActivity: ChatActivityBus,
  ) {}

  private notifyChatActivity(conversationId: string, payload?: unknown) {
    this.chatActivity.notify(conversationId, payload);
  }

  /** SSE: client giữ kết nối, server đẩy khi có tin / đề xuất / đơn trong hội thoại. */
  activityEventStream(
    currentUser: AuthenticatedUser,
    conversationId: string,
  ): Observable<MessageEvent> {
    return defer(() =>
      from(
        this.authService.upsertAppUser(currentUser).then(async (appUser) => {
          await this.assertConversationParticipant(conversationId, appUser.id);
          return conversationId;
        }),
      ).pipe(switchMap((id) => this.chatActivity.stream(id))),
    );
  }

  private oppositeParty(p: Party): Party {
    return p === 'buyer' ? 'seller' : 'buyer';
  }

  private async assertConversationParticipant(conversationId: string, userId: string) {
    const conv = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
    });
    if (!conv) throw new NotFoundException('Không thấy hội thoại');
    const shop = await db.query.shops.findFirst({
      where: eq(shops.id, conv.shopId),
    });
    if (!shop) throw new NotFoundException('Shop không tồn tại');

    const isBuyer = conv.userId === userId;
    const isSeller = shop.ownerId === userId;
    if (!isBuyer && !isSeller) {
      throw new ForbiddenException('Bạn không tham gia hội thoại này');
    }

    const role: Party = isBuyer ? 'buyer' : 'seller';
    return { conv, shop, role };
  }

  private async supersedePendingOffers(conversationId: string) {
    await db
      .update(negotiationOffers)
      .set({ status: 'superseded' })
      .where(
        and(
          eq(negotiationOffers.conversationId, conversationId),
          eq(negotiationOffers.status, 'pending'),
        ),
      );
  }

  private offerSummary(unitPrice: number, quantity: number) {
    return `Đề xuất ${quantity} × ${unitPrice.toLocaleString('vi-VN')}đ`;
  }

  async openProductConversation(
    currentUser: AuthenticatedUser,
    body: OpenProductConversationDto,
  ) {
    const appUser = await this.authService.upsertAppUser(currentUser);

    const product = await db.query.products.findFirst({
      where: eq(products.id, body.productId),
    });
    if (!product || product.status !== 'active' || product.isAvailable !== true) {
      throw new NotFoundException('Sản phẩm không khả dụng');
    }

    const shopId = product.shopId;
    const shop = await db.query.shops.findFirst({ where: eq(shops.id, shopId) });
    if (!shop || shop.ownerId === appUser.id) {
      throw new ForbiddenException('Chỉ người mua có thể mở hội thoại từ sản phẩm');
    }
    if (shop.isActive === false) {
      throw new BadRequestException('Cửa hàng đang tạm đóng');
    }

    const existing = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.userId, appUser.id),
        eq(conversations.shopId, shopId),
        eq(conversations.productId, body.productId),
      ),
    });
    if (existing) return existing;

    const now = new Date();
    const [created] = await db
      .insert(conversations)
      .values({
        userId: appUser.id,
        shopId,
        productId: body.productId,
        updatedAt: now,
        buyerLastReadAt: now,
        sellerLastReadAt: now,
      })
      .returning();

    return created;
  }

  private async unreadCountsForBuyer(convIds: string[], buyerUserId: string) {
    if (!convIds.length) return {} as Record<string, number>;
    const rows = await db
      .select({
        conversationId: messages.conversationId,
        cnt: count(),
      })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(
        and(
          inArray(messages.conversationId, convIds),
          ne(messages.senderId, buyerUserId),
          or(
            isNull(conversations.buyerLastReadAt),
            gt(messages.createdAt, conversations.buyerLastReadAt),
          ),
        ),
      )
      .groupBy(messages.conversationId);
    return Object.fromEntries(rows.map((r) => [r.conversationId, Number(r.cnt)]));
  }

  private async unreadCountsForSeller(convIds: string[], shopOwnerId: string) {
    if (!convIds.length) return {} as Record<string, number>;
    const rows = await db
      .select({
        conversationId: messages.conversationId,
        cnt: count(),
      })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(
        and(
          inArray(messages.conversationId, convIds),
          ne(messages.senderId, shopOwnerId),
          or(
            isNull(conversations.sellerLastReadAt),
            gt(messages.createdAt, conversations.sellerLastReadAt),
          ),
        ),
      )
      .groupBy(messages.conversationId);
    return Object.fromEntries(rows.map((r) => [r.conversationId, Number(r.cnt)]));
  }

  async listMyConversations(currentUser: AuthenticatedUser) {
    const appUser = await this.authService.upsertAppUser(currentUser);

    const shop = await db.query.shops.findFirst({
      where: eq(shops.ownerId, appUser.id),
    });

    const buyerConvs = await db
      .select({
        id: conversations.id,
        userId: conversations.userId,
        shopId: conversations.shopId,
        productId: conversations.productId,
        lastMessage: conversations.lastMessage,
        updatedAt: conversations.updatedAt,
        buyerLastReadAt: conversations.buyerLastReadAt,
        sellerLastReadAt: conversations.sellerLastReadAt,
        shopName: shops.name,
        productName: products.name,
      })
      .from(conversations)
      .leftJoin(shops, eq(conversations.shopId, shops.id))
      .leftJoin(products, eq(conversations.productId, products.id))
      .where(eq(conversations.userId, appUser.id))
      .orderBy(desc(conversations.updatedAt));

    const sellerRows =
      shop?.id
        ? await db
            .select({
              id: conversations.id,
              userId: conversations.userId,
              shopId: conversations.shopId,
              productId: conversations.productId,
              lastMessage: conversations.lastMessage,
              updatedAt: conversations.updatedAt,
              buyerLastReadAt: conversations.buyerLastReadAt,
              sellerLastReadAt: conversations.sellerLastReadAt,
              shopName: shops.name,
              productName: products.name,
            })
            .from(conversations)
            .leftJoin(shops, eq(conversations.shopId, shops.id))
            .leftJoin(products, eq(conversations.productId, products.id))
            .where(eq(conversations.shopId, shop.id))
            .orderBy(desc(conversations.updatedAt))
        : [];

    const buyerConvIds = buyerConvs.map((r) => r.id);
    const buyerUnread = await this.unreadCountsForBuyer(buyerConvIds, appUser.id);

    const sellerUnread =
      shop?.id && sellerRows.length
        ? await this.unreadCountsForSeller(
            sellerRows.map((r) => r.id),
            appUser.id,
          )
        : {};

    type Row = (typeof buyerConvs)[number];
    const mapRow = (row: Row, side: Party, buyerName: string | undefined, unread: Record<string, number>) => ({
      id: row.id,
      productId: row.productId,
      lastMessage: row.lastMessage,
      updatedAt: row.updatedAt,
      productName: row.productName,
      shopName: row.shopName,
      side,
      buyerId: row.userId,
      buyerHint: buyerName,
      unreadCount: unread[row.id] ?? 0,
      lastReadAt: side === 'buyer' ? row.buyerLastReadAt : row.sellerLastReadAt,
    });

    const buyerMapped = buyerConvs.map((r) => mapRow(r, 'buyer', undefined, buyerUnread));
    let sellerMapped: ReturnType<typeof mapRow>[] = [];
    if (shop?.id && sellerRows.length) {
      const buyerIds = [...new Set(sellerRows.map((r) => r.userId))];
      const buyerUsers =
        buyerIds.length > 0
          ? await db.query.users.findMany({
              where: (u, { inArray }) => inArray(u.id, buyerIds),
            })
          : [];
      const nameById = Object.fromEntries(
        buyerUsers.map((u) => [u.id, u.fullName] as const),
      );
      sellerMapped = sellerRows.map((r) =>
        mapRow(r, 'seller', nameById[r.userId] ?? undefined, sellerUnread),
      );
    }

    return { buyer: buyerMapped, seller: sellerMapped };
  }

  async markConversationRead(currentUser: AuthenticatedUser, conversationId: string) {
    const appUser = await this.authService.upsertAppUser(currentUser);
    const { role } = await this.assertConversationParticipant(conversationId, appUser.id);

    const [latest] = await db
      .select({ createdAt: messages.createdAt })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(1);
    const readAt = latest?.createdAt ?? new Date();

    if (role === 'buyer') {
      await db
        .update(conversations)
        .set({ buyerLastReadAt: readAt })
        .where(eq(conversations.id, conversationId));
    } else {
      await db
        .update(conversations)
        .set({ sellerLastReadAt: readAt })
        .where(eq(conversations.id, conversationId));
    }

    await db
      .update(messages)
      .set({ isRead: true })
      .where(and(eq(messages.conversationId, conversationId), ne(messages.senderId, appUser.id)));

    this.notifyChatActivity(conversationId, { type: 'read', readAt });
  }

  async getConversationDetail(currentUser: AuthenticatedUser, conversationId: string) {
    const appUser = await this.authService.upsertAppUser(currentUser);
    const { conv, shop, role } = await this.assertConversationParticipant(
      conversationId,
      appUser.id,
    );

    const product = conv.productId
      ? await db.query.products.findFirst({
          where: eq(products.id, conv.productId),
        })
      : null;

    const buyerUser = await db.query.users.findFirst({
      where: eq(users.id, conv.userId),
    });

    const offerRows = await db.query.negotiationOffers.findMany({
      where: eq(negotiationOffers.conversationId, conversationId),
      orderBy: (t, { desc: d }) => [d(t.createdAt)],
      limit: 80,
    });

    const offerIds = offerRows.map((o) => o.id);
    const ordersForOffers =
      offerIds.length > 0
        ? await db.query.orders.findMany({
            where: (o, { inArray, isNotNull, and: andFn }) =>
              andFn(isNotNull(o.negotiationOfferId), inArray(o.negotiationOfferId, offerIds)),
          })
        : [];

    const ordersByOfferId: Record<string, string> = {};
    for (const o of ordersForOffers) {
      if (o.negotiationOfferId) ordersByOfferId[o.negotiationOfferId] = o.id;
    }

    const [awaitingAddr] = await db
      .select({ order: orders })
      .from(orders)
      .innerJoin(negotiationOffers, eq(orders.negotiationOfferId, negotiationOffers.id))
      .where(
        and(
          eq(negotiationOffers.conversationId, conversationId),
          eq(orders.status, 'awaiting_buyer_address'),
        ),
      )
      .limit(1);

    return {
      conversation: conv,
      role,
      shop: { id: shop.id, name: shop.name, ownerId: shop.ownerId, logo: shop.logo ?? null },
      product,
      buyer: buyerUser
        ? { id: buyerUser.id, fullName: buyerUser.fullName, phone: buyerUser.phone }
        : null,
      offers: offerRows,
      ordersByOfferId,
      awaitingBuyerAddressOrder: awaitingAddr?.order ?? null,
      readReceipts: {
        myLastReadAt: role === 'buyer' ? (conv.buyerLastReadAt ?? null) : (conv.sellerLastReadAt ?? null),
        otherLastReadAt: role === 'buyer' ? (conv.sellerLastReadAt ?? null) : (conv.buyerLastReadAt ?? null),
      },
    };
  }

  async listMessages(currentUser: AuthenticatedUser, conversationId: string) {
    const appUser = await this.authService.upsertAppUser(currentUser);
    await this.assertConversationParticipant(conversationId, appUser.id);

    const rows = await db.query.messages.findMany({
      where: eq(messages.conversationId, conversationId),
      orderBy: (m, { asc }) => [asc(m.createdAt)],
      limit: 200,
    });

    const offerIds = [
      ...new Set(
        rows
          .map((r) => r.negotiationOfferId)
          .filter((id): id is string => !!id),
      ),
    ];
    const offerMap: Record<string, (typeof negotiationOffers.$inferSelect) | undefined> =
      {};
    if (offerIds.length) {
      const offs = await db.query.negotiationOffers.findMany({
        where: inArray(negotiationOffers.id, offerIds),
      });
      offs.forEach((o) => {
        offerMap[o.id] = o;
      });
    }

    return rows.map((m) => ({
      ...m,
      offer: m.negotiationOfferId ? offerMap[m.negotiationOfferId] ?? null : null,
    }));
  }

  async sendTextMessage(
    currentUser: AuthenticatedUser,
    conversationId: string,
    body: SendChatMessageDto,
  ) {
    const appUser = await this.authService.upsertAppUser(currentUser);
    await this.assertConversationParticipant(conversationId, appUser.id);

    const [msg] = await db
      .insert(messages)
      .values({
        conversationId,
        senderId: appUser.id,
        content: body.content.trim(),
        kind: 'text',
        createdAt: new Date(),
      })
      .returning();

    await db
      .update(conversations)
      .set({
        lastMessage: body.content.trim().slice(0, 500),
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId));

    this.notifyChatActivity(conversationId, { type: 'message', message: msg });
    return msg;
  }

  async createNegotiationOffer(
    currentUser: AuthenticatedUser,
    conversationId: string,
    body: CreateNegotiationOfferDto,
  ) {
    const appUser = await this.authService.upsertAppUser(currentUser);
    const { conv, role } = await this.assertConversationParticipant(conversationId, appUser.id);

    if (!conv.productId) {
      throw new BadRequestException('Hội thoại không gắn sản phẩm để trả giá');
    }

    const product = await db.query.products.findFirst({
      where: eq(products.id, conv.productId),
    });
    if (!product || product.status !== 'active' || product.isAvailable !== true) {
      throw new BadRequestException('Sản phẩm không còn để thương lượng');
    }
    if (body.quantity > product.stock) {
      throw new BadRequestException('Số lượng vượt tồn kho hiện tại');
    }

    if (body.parentOfferId) {
      const parent = await db.query.negotiationOffers.findFirst({
        where: eq(negotiationOffers.id, body.parentOfferId),
      });
      if (!parent || parent.conversationId !== conversationId) {
        throw new BadRequestException('Thẻ gốc không thuộc hội thoại này');
      }
    }

    await this.supersedePendingOffers(conversationId);

    const awaiting = this.oppositeParty(role);
    const [offer] = await db
      .insert(negotiationOffers)
      .values({
        conversationId,
        productId: conv.productId,
        proposedByUserId: appUser.id,
        unitPrice: body.unitPrice,
        quantity: body.quantity,
        awaitingParty: awaiting,
        status: 'pending',
        parentOfferId: body.parentOfferId ?? null,
        createdAt: new Date(),
      })
      .returning();

    const summary = this.offerSummary(body.unitPrice, body.quantity);
    const [msg] = await db
      .insert(messages)
      .values({
        conversationId,
        senderId: appUser.id,
        content: summary,
        kind: 'offer',
        negotiationOfferId: offer.id,
        createdAt: new Date(),
      })
      .returning();

    await db
      .update(conversations)
      .set({ lastMessage: summary, updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    this.notifyChatActivity(conversationId, { type: 'offer', offer, message: msg });

    return { offer, message: msg };
  }

  async acceptNegotiationOffer(
    currentUser: AuthenticatedUser,
    conversationId: string,
    offerId: string,
  ) {
    const appUser = await this.authService.upsertAppUser(currentUser);
    const { role } = await this.assertConversationParticipant(conversationId, appUser.id);

    const offer = await db.query.negotiationOffers.findFirst({
      where: and(
        eq(negotiationOffers.id, offerId),
        eq(negotiationOffers.conversationId, conversationId),
      ),
    });
    if (!offer) throw new NotFoundException('Không thấy thẻ đề xuất');
    if (offer.status !== 'pending') {
      throw new BadRequestException('Thẻ này không còn ở trạng thái chờ phản hồi');
    }
    if (offer.awaitingParty !== role) {
      throw new ForbiddenException('Chưa tới lượt bạn phản hồi thẻ này');
    }

    const [updated] = await db
      .update(negotiationOffers)
      .set({ status: 'accepted', awaitingParty: null })
      .where(eq(negotiationOffers.id, offerId))
      .returning();

    const note = 'Đã thống nhất giá & số lượng.';
    const [msg] = await db
      .insert(messages)
      .values({
        conversationId,
        senderId: appUser.id,
        content: note,
        kind: 'text',
        createdAt: new Date(),
      })
      .returning();

    await db
      .update(conversations)
      .set({ lastMessage: note, updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    this.notifyChatActivity(conversationId, { type: 'offer:accepted', offer: updated, message: msg });

    return { offer: updated, message: msg };
  }

  async declineNegotiationOffer(
    currentUser: AuthenticatedUser,
    conversationId: string,
    offerId: string,
  ) {
    const appUser = await this.authService.upsertAppUser(currentUser);
    const { role } = await this.assertConversationParticipant(conversationId, appUser.id);

    const offer = await db.query.negotiationOffers.findFirst({
      where: and(
        eq(negotiationOffers.id, offerId),
        eq(negotiationOffers.conversationId, conversationId),
      ),
    });
    if (!offer) throw new NotFoundException('Không thấy thẻ đề xuất');
    if (offer.status !== 'pending') {
      throw new BadRequestException('Thẻ này không còn ở trạng thái chờ phản hồi');
    }
    if (offer.awaitingParty !== role) {
      throw new ForbiddenException('Chưa tới lượt bạn phản hồi thẻ này');
    }

    const [updated] = await db
      .update(negotiationOffers)
      .set({ status: 'declined', awaitingParty: null })
      .where(eq(negotiationOffers.id, offerId))
      .returning();

    const note = 'Đã từ chối đề xuất.';
    const [msg] = await db
      .insert(messages)
      .values({
        conversationId,
        senderId: appUser.id,
        content: note,
        kind: 'text',
        createdAt: new Date(),
      })
      .returning();

    await db
      .update(conversations)
      .set({ lastMessage: note, updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    this.notifyChatActivity(conversationId, { type: 'offer:declined', offer: updated, message: msg });

    return { offer: updated, message: msg };
  }

  async createOrderFromNegotiatedOffer(
    currentUser: AuthenticatedUser,
    conversationId: string,
    offerId: string,
    body: CreateOrderFromNegotiationDto,
  ) {
    const appUser = await this.authService.upsertAppUser(currentUser);
    const { conv, shop, role } = await this.assertConversationParticipant(
      conversationId,
      appUser.id,
    );
    if (role !== 'seller') {
      throw new ForbiddenException('Chỉ shop mới tạo đơn từ thẻ đã thống nhất');
    }

    const offer = await db.query.negotiationOffers.findFirst({
      where: and(
        eq(negotiationOffers.id, offerId),
        eq(negotiationOffers.conversationId, conversationId),
      ),
    });
    if (!offer) throw new NotFoundException('Không thấy thẻ đề xuất');
    if (offer.status !== 'accepted') {
      throw new BadRequestException('Chỉ có thể tạo đơn khi đã đồng ý đề xuất');
    }
    if (conv.userId === shop.ownerId) {
      throw new BadRequestException('Người mua không hợp lệ');
    }

    const order = await this.ordersService.createOrderFromNegotiationOffer({
      sellerUserId: appUser.id,
      buyerId: conv.userId,
      shopId: shop.id,
      offer,
      note: body.note,
    });

    const noteTxt = `Shop đã tạo đơn chờ bạn nhận (${order.id.slice(0, 8)}…).`;
    const [msg] = await db
      .insert(messages)
      .values({
        conversationId,
        senderId: appUser.id,
        content: noteTxt,
        kind: 'text',
        createdAt: new Date(),
      })
      .returning();

    await db
      .update(conversations)
      .set({ lastMessage: noteTxt, updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    this.notifyChatActivity(conversationId, { type: 'order:created', order, message: msg });

    return { order, message: msg };
  }
}
