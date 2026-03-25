import { 
  pgTable, 
  serial, 
  text, 
  varchar, 
  timestamp, 
  integer, 
  boolean, 
  doublePrecision, 
  pgEnum 
} from 'drizzle-orm/pg-core';

// --- ENUMS ---
export const userRoleEnum = pgEnum('user_role', ['buyer', 'seller', 'admin']);
export const orderStatusEnum = pgEnum('order_status', [
  'pending', 'confirmed', 'processing', 'shipping', 'delivered', 'cancelled'
]);

// --- 1. NGƯỜI DÙNG & ĐỊA CHỈ (Centralized Address System) ---
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  phone: varchar('phone', { length: 15 }).unique().notNull(), // Dùng cho Firebase OTP
  fullName: text('full_name').notNull(),
  avatar: text('avatar'),
  role: userRoleEnum('role').default('buyer'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const addresses = pgTable('addresses', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  label: text('label'), // Ví dụ: "Vườn Sầu Riêng", "Nhà riêng"
  receiverName: text('receiver_name').notNull(),
  receiverPhone: varchar('receiver_phone', { length: 15 }).notNull(),
  
  // Rã nhỏ để map payload GHTK cực nhanh
  province: text('province').notNull(),
  district: text('district').notNull(),
  ward: text('ward').notNull(),
  detail: text('detail').notNull(), // Số nhà, tên đường
  
  isDefault: boolean('is_default').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// --- 2. CỬA HÀNG (Shop Module) ---
export const shops = pgTable('shops', {
  id: serial('id').primaryKey(),
  ownerId: integer('owner_id').references(() => users.id).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  logo: text('logo'),
  
  // Địa chỉ tượng trưng để hiển thị UI
  displayAddress: text('display_address'), 
  
  // ĐỊA CHỈ MẶC ĐỊNH ĐỂ TÍNH PHÍ SHIP (FK tới bảng addresses)
  defaultPickAddressId: integer('default_pick_address_id').references(() => addresses.id),
  
  rating: doublePrecision('rating').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

// --- 3. SẢN PHẨM & NHẬT KÝ GIAI ĐOẠN (Growth Diary) ---
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: varchar('slug').unique().notNull(), // SEO & Frontend Routing
  icon: text('icon'),
});

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  shopId: integer('shop_id').references(() => shops.id).notNull(),
  categoryId: integer('category_id').references(() => categories.id),
  name: text('name').notNull(),
  description: text('description'),
  origin: text('origin').notNull(), // Xuất xứ (Ví dụ: Đắk Lắk)
  price: doublePrecision('price').notNull(),
  stock: doublePrecision('stock').notNull(),
  unit: varchar('unit', { length: 20 }).default('kg'),
  images: text('images').array(),
  shippingMethods: text('shipping_methods').array(), // ['GHTK', 'SELF_DELIVERY']
  
  // Thống kê nhanh (Denormalization)
  averageRating: doublePrecision('average_rating').default(0),
  reviewCount: integer('review_count').default(0),
  
  isAvailable: boolean('is_available').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

export const productGrowthDiary = pgTable('product_growth_diary', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').references(() => products.id).notNull(),
  stageName: text('stage_name').notNull(), // Ví dụ: "Nở hoa", "Kết quả"
  description: text('description'),
  images: text('images').array(),
  logDate: timestamp('log_date').defaultNow(),
});

// --- 4. GIỎ HÀNG & ĐƠN HÀNG (Cart & Transaction) ---
export const carts = pgTable('carts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).unique().notNull(),
});

export const cartItems = pgTable('cart_items', {
  id: serial('id').primaryKey(),
  cartId: integer('cart_id').references(() => carts.id).notNull(),
  productId: integer('product_id').references(() => products.id).notNull(),
  quantity: doublePrecision('quantity').notNull(),
});

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  buyerId: integer('buyer_id').references(() => users.id).notNull(),
  shopId: integer('shop_id').references(() => shops.id).notNull(),
  
  // Snapshot địa chỉ tại thời điểm đặt để tránh User đổi địa chỉ làm sai lệch lịch sử
  shippingAddressSnapshot: text('shipping_address_snapshot').notNull(),
  
  // Địa chỉ lấy hàng thực tế (Shop chọn khi bấm xác nhận)
  actualPickAddressId: integer('actual_pick_address_id').references(() => addresses.id),
  
  totalPrice: doublePrecision('total_price').notNull(),
  shippingFee: doublePrecision('shipping_fee').notNull(),
  finalPrice: doublePrecision('final_price').notNull(),
  
  status: orderStatusEnum('status').default('pending'),
  shippingCode: varchar('shipping_code'), // Tracking code từ GHTK
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').references(() => orders.id).notNull(),
  productId: integer('product_id').references(() => products.id).notNull(),
  quantity: doublePrecision('quantity').notNull(),
  priceAtPurchase: doublePrecision('price_at_purchase').notNull(),
});

// --- 5. TƯƠNG TÁC & THÔNG BÁO (Interaction & Chat) ---
export const reviews = pgTable('reviews', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').references(() => products.id).notNull(),
  buyerId: integer('buyer_id').references(() => users.id).notNull(),
  orderId: integer('order_id').references(() => orders.id).notNull(),
  rating: integer('rating').notNull(),
  comment: text('comment'),
  images: text('images').array(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const conversations = pgTable('conversations', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  shopId: integer('shop_id').references(() => shops.id).notNull(),
  lastMessage: text('last_message'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id').references(() => conversations.id).notNull(),
  senderId: integer('sender_id').references(() => users.id).notNull(),
  content: text('content').notNull(),
  isRead: boolean('is_read').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  type: varchar('type', { length: 50 }), // 'order', 'chat', 'diary_update'
  isRead: boolean('is_read').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});