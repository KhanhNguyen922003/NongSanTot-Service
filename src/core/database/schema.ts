import { 
  pgTable, 
  uuid,
  text, 
  varchar, 
  timestamp, 
  integer, 
  boolean, 
  doublePrecision, 
  pgEnum,
  jsonb,
} from 'drizzle-orm/pg-core';

// --- ENUMS ---
export const userRoleEnum = pgEnum('user_role', ['buyer', 'seller', 'admin']);
export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'confirmed',
  'processing',
  'shipping',
  'delivered',
  'cancelled',
  'awaiting_buyer_address',
]);
export const negotiationOfferStatusEnum = pgEnum('negotiation_offer_status', [
  'pending',
  'accepted',
  'superseded',
  'declined',
]);
export const awaitingNegotiationPartyEnum = pgEnum('awaiting_negotiation_party', [
  'buyer',
  'seller',
]);
export const messageKindEnum = pgEnum('message_kind', ['text', 'offer']);
export const productStatusEnum = pgEnum('product_status', [
  'draft', 'pending_review', 'active', 'rejected', 'archived'
]);

// --- 1. NGƯỜI DÙNG & ĐỊA CHỈ (Centralized Address System) ---
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  firebaseUid: varchar('firebase_uid', { length: 128 }).unique(),
  phone: varchar('phone', { length: 15 }).unique().notNull(), // Dùng cho Firebase OTP
  fullName: text('full_name').notNull(),
  avatar: text('avatar'),
  role: userRoleEnum('role').default('buyer'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const addresses = pgTable('addresses', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  label: text('label'), // Ví dụ: "Vườn Sầu Riêng", "Nhà riêng"
  receiverName: text('receiver_name').notNull(),
  receiverPhone: varchar('receiver_phone', { length: 15 }).notNull(),
  
  // Rã nhỏ để map payload GHTK cực nhanh
  province: text('province').notNull(),
  ward: text('ward').notNull(),
  detail: text('detail').notNull(), // Số nhà, tên đường
  
  isDefault: boolean('is_default').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updateAt: timestamp('updated_at').defaultNow(),
});

// --- 2. CỬA HÀNG (Shop Module) ---
export const shops = pgTable('shops', {
  id: uuid('id').defaultRandom().primaryKey(),
  /** Mỗi user tối đa 1 shop (bán cá nhân) */
  ownerId: uuid('owner_id')
    .references(() => users.id)
    .notNull()
    .unique(),
  name: text('name').notNull(),
  description: text('description'),
  logo: text('logo'),
  
  // Địa chỉ tượng trưng để hiển thị UI
  displayAddress: text('display_address'), 
  
  // ĐỊA CHỈ MẶC ĐỊNH ĐỂ TÍNH PHÍ SHIP (FK tới bảng addresses)
  defaultPickAddressId: uuid('default_pick_address_id').references(() => addresses.id),
  
  rating: doublePrecision('rating').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at'),
});

// --- 3. SẢN PHẨM & NHẬT KÝ GIAI ĐOẠN (Growth Diary) ---
export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: varchar('slug').unique().notNull(), // SEO & Frontend Routing
  icon: text('icon'),
});

export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  shopId: uuid('shop_id').references(() => shops.id).notNull(),
  categoryId: uuid('category_id').references(() => categories.id),
  name: text('name').notNull(),
  description: text('description'),
  origin: text('origin').notNull(), // Xuất xứ (Ví dụ: Đắk Lắk)
  price: doublePrecision('price').notNull(),
  stock: doublePrecision('stock').notNull(),
  unit: varchar('unit', { length: 20 }).default('kg'),
  tags: text('tags').array(),
  coverImage: text('cover_image'),
  images: text('images').array(),
  videos: text('videos').array(),
  shippingMethods: text('shipping_methods').array(), // ['GHTK', 'SELF_DELIVERY']
  pickupAddressSnapshot: jsonb('pickup_address_snapshot'),
  preferredShippingServiceId: integer('preferred_shipping_service_id'),
  
  // Thống kê nhanh (Denormalization)
  averageRating: doublePrecision('average_rating').default(0),
  reviewCount: integer('review_count').default(0),

  // Trạng thái đăng bán / kiểm duyệt
  status: productStatusEnum('status').default('draft').notNull(),
  rejectionReason: text('rejection_reason'),
  moderationScore: doublePrecision('moderation_score'),
  moderationResult: jsonb('moderation_result'),
  moderatedAt: timestamp('moderated_at'),
  trustScore: doublePrecision('trust_score').default(0),
  verifiedBadge: boolean('verified_badge').default(false),
  
  isAvailable: boolean('is_available').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at'),
});

export const productGrowthDiary = pgTable('product_growth_diary', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id').references(() => products.id).notNull(),
  stageOrder: integer('stage_order').default(0).notNull(),
  stageName: text('stage_name').notNull(), // Ví dụ: "Nở hoa", "Kết quả"
  description: text('description'),
  images: text('images').array(),
  videos: text('videos').array(),
  documents: text('documents').array(),
  logDate: timestamp('log_date').defaultNow(),
});

// --- 4. GIỎ HÀNG & ĐƠN HÀNG (Cart & Transaction) ---
export const carts = pgTable('carts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).unique().notNull(),
});

export const cartItems = pgTable('cart_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  cartId: uuid('cart_id').references(() => carts.id).notNull(),
  productId: uuid('product_id').references(() => products.id).notNull(),
  quantity: doublePrecision('quantity').notNull(),
});

export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  buyerId: uuid('buyer_id').references(() => users.id).notNull(),
  shopId: uuid('shop_id').references(() => shops.id).notNull(),
  
  // Snapshot địa chỉ tại thời điểm đặt để tránh User đổi địa chỉ làm sai lệch lịch sử
  shippingAddressSnapshot: text('shipping_address_snapshot').notNull(),
  
  // Địa chỉ lấy hàng thực tế (Shop chọn khi bấm xác nhận)
  actualPickAddressId: uuid('actual_pick_address_id').references(() => addresses.id),
  
  totalPrice: doublePrecision('total_price').notNull(),
  shippingFee: doublePrecision('shipping_fee').notNull(),
  finalPrice: doublePrecision('final_price').notNull(),
  
  status: orderStatusEnum('status').default('pending'),
  // Khi true nghĩa là hệ thống đã trừ tồn kho cho đơn này
  isStockReserved: boolean('is_stock_reserved').default(false),
  shippingCode: varchar('shipping_code'), // Tracking code từ GHTK
  /** Mã trạng thái vận đơn GHTK (services/shipment/v2), ví dụ 6 = đã giao. */
  ghtkShipmentStatus: integer('ghtk_shipment_status'),
  note: text('note'),
  /** Liên kết đơn tạo sau khi đồng ý trả giá (snapshot địa chỉ ban đầu là placeholder JSON). */
  negotiationOfferId: uuid('negotiation_offer_id'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const orderItems = pgTable('order_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').references(() => orders.id).notNull(),
  productId: uuid('product_id').references(() => products.id).notNull(),
  quantity: doublePrecision('quantity').notNull(),
  priceAtPurchase: doublePrecision('price_at_purchase').notNull(),
});

// --- 5. TƯƠNG TÁC & THÔNG BÁO (Interaction & Chat) ---
export const reviews = pgTable('reviews', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id').references(() => products.id).notNull(),
  buyerId: uuid('buyer_id').references(() => users.id).notNull(),
  orderId: uuid('order_id').references(() => orders.id).notNull(),
  rating: integer('rating').notNull(),
  comment: text('comment'),
  images: text('images').array(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  /** Buyer (always the marketplace user initiating thread from product). */
  userId: uuid('user_id').references(() => users.id).notNull(),
  shopId: uuid('shop_id').references(() => shops.id).notNull(),
  /** Sản phẩm ngữ cảnh (một luồng thương lượng gắn 1 SP). */
  productId: uuid('product_id').references(() => products.id),
  lastMessage: text('last_message'),
  updatedAt: timestamp('updated_at').defaultNow(),
  /** Mốc người mua đã xem tới (tin từ shop sau mốc này = chưa đọc với buyer). */
  buyerLastReadAt: timestamp('buyer_last_read_at'),
  /** Mốc chủ shop đã xem tới (tin từ buyer sau mốc = chưa đọc với seller). */
  sellerLastReadAt: timestamp('seller_last_read_at'),
});

/** Một đề xuất / counter giá trong cuộc hội thoại. */
export const negotiationOffers = pgTable('negotiation_offers', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id')
    .references(() => conversations.id)
    .notNull(),
  productId: uuid('product_id').references(() => products.id).notNull(),
  proposedByUserId: uuid('proposed_by_user_id')
    .references(() => users.id)
    .notNull(),
  unitPrice: doublePrecision('unit_price').notNull(),
  quantity: doublePrecision('quantity').notNull(),
  awaitingParty: awaitingNegotiationPartyEnum('awaiting_party'),
  status: negotiationOfferStatusEnum('status').default('pending').notNull(),
  parentOfferId: uuid('parent_offer_id'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').references(() => conversations.id).notNull(),
  senderId: uuid('sender_id').references(() => users.id).notNull(),
  content: text('content').notNull(),
  kind: messageKindEnum('kind').default('text').notNull(),
  negotiationOfferId: uuid('negotiation_offer_id').references(() => negotiationOffers.id),
  isRead: boolean('is_read').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  type: varchar('type', { length: 50 }), // 'order', 'chat', 'diary_update'
  isRead: boolean('is_read').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});