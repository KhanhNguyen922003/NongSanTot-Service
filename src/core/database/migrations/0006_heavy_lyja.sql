-- ALTER TABLE "addresses" ADD COLUMN "updated_at" timestamp DEFAULT now();--> statement-breakpoint
-- ALTER TABLE "conversations" ADD COLUMN "buyer_last_read_at" timestamp;--> statement-breakpoint
-- ALTER TABLE "conversations" ADD COLUMN "seller_last_read_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "is_stock_reserved" boolean DEFAULT false;--> statement-breakpoint
-- ALTER TABLE "orders" ADD COLUMN "ghtk_shipment_status" integer;