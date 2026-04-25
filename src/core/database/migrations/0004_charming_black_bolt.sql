ALTER TABLE "shops" ADD COLUMN "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_owner_id_unique" UNIQUE("owner_id");