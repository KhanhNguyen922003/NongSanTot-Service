ALTER TABLE "products" ADD COLUMN "pickup_address_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "preferred_shipping_service_id" integer;