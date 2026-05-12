CREATE TYPE "public"."awaiting_negotiation_party" AS ENUM('buyer', 'seller');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('text', 'offer');--> statement-breakpoint
CREATE TYPE "public"."negotiation_offer_status" AS ENUM('pending', 'accepted', 'superseded', 'declined');--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'awaiting_buyer_address';--> statement-breakpoint
CREATE TABLE "negotiation_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"proposed_by_user_id" uuid NOT NULL,
	"unit_price" double precision NOT NULL,
	"quantity" double precision NOT NULL,
	"awaiting_party" "awaiting_negotiation_party",
	"status" "negotiation_offer_status" DEFAULT 'pending' NOT NULL,
	"parent_offer_id" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "product_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "kind" "message_kind" DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "negotiation_offer_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "negotiation_offer_id" uuid;--> statement-breakpoint
ALTER TABLE "negotiation_offers" ADD CONSTRAINT "negotiation_offers_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiation_offers" ADD CONSTRAINT "negotiation_offers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiation_offers" ADD CONSTRAINT "negotiation_offers_proposed_by_user_id_users_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_negotiation_offer_id_negotiation_offers_id_fk" FOREIGN KEY ("negotiation_offer_id") REFERENCES "public"."negotiation_offers"("id") ON DELETE no action ON UPDATE no action;