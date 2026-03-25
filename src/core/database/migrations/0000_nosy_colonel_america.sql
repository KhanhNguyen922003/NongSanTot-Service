CREATE TYPE "public"."order_status" AS ENUM('pending', 'confirmed', 'processing', 'shipping', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('buyer', 'seller', 'admin');--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"label" text,
	"receiver_name" text NOT NULL,
	"receiver_phone" varchar(15) NOT NULL,
	"province" text NOT NULL,
	"district" text NOT NULL,
	"ward" text NOT NULL,
	"detail" text NOT NULL,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"cart_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	CONSTRAINT "carts_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" varchar NOT NULL,
	"icon" text,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"shop_id" integer NOT NULL,
	"last_message" text,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"sender_id" integer NOT NULL,
	"content" text NOT NULL,
	"is_read" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"type" varchar(50),
	"is_read" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" double precision NOT NULL,
	"price_at_purchase" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"buyer_id" integer NOT NULL,
	"shop_id" integer NOT NULL,
	"shipping_address_snapshot" text NOT NULL,
	"actual_pick_address_id" integer,
	"total_price" double precision NOT NULL,
	"shipping_fee" double precision NOT NULL,
	"final_price" double precision NOT NULL,
	"status" "order_status" DEFAULT 'pending',
	"shipping_code" varchar,
	"note" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "product_growth_diary" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"stage_name" text NOT NULL,
	"description" text,
	"images" text[],
	"log_date" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"shop_id" integer NOT NULL,
	"category_id" integer,
	"name" text NOT NULL,
	"description" text,
	"origin" text NOT NULL,
	"price" double precision NOT NULL,
	"stock" double precision NOT NULL,
	"unit" varchar(20) DEFAULT 'kg',
	"images" text[],
	"shipping_methods" text[],
	"average_rating" double precision DEFAULT 0,
	"review_count" integer DEFAULT 0,
	"is_available" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"buyer_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"images" text[],
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shops" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"logo" text,
	"display_address" text,
	"default_pick_address_id" integer,
	"rating" double precision DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" varchar(15) NOT NULL,
	"full_name" text NOT NULL,
	"avatar" text,
	"role" "user_role" DEFAULT 'buyer',
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_actual_pick_address_id_addresses_id_fk" FOREIGN KEY ("actual_pick_address_id") REFERENCES "public"."addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_growth_diary" ADD CONSTRAINT "product_growth_diary_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_default_pick_address_id_addresses_id_fk" FOREIGN KEY ("default_pick_address_id") REFERENCES "public"."addresses"("id") ON DELETE no action ON UPDATE no action;