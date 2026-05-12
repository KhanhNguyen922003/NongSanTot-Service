ALTER TABLE "conversations" ADD COLUMN "buyer_last_read_at" timestamp;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "seller_last_read_at" timestamp;--> statement-breakpoint
UPDATE "conversations" SET "buyer_last_read_at" = COALESCE("updated_at", now()), "seller_last_read_at" = COALESCE("updated_at", now()) WHERE "buyer_last_read_at" IS NULL AND "seller_last_read_at" IS NULL;
