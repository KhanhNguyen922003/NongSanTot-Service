import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import slugify from 'slugify';
import { db } from '@/core/database/db';
import { categories, products } from '@/core/database/schema';
import type { CreateCategoryDto } from './dto/create-category.dto';
import type { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  private buildSlug(name: string) {
    return slugify(name, { lower: true, strict: true, trim: true });
  }

  async findAll() {
    return db.select().from(categories).orderBy(categories.name);
  }

  async findOne(id: string) {
    const category = await db.query.categories.findFirst({
      where: eq(categories.id, id),
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async create(payload: CreateCategoryDto) {
    const slug = payload.slug?.trim() || this.buildSlug(payload.name);

    const existing = await db.query.categories.findFirst({
      where: eq(categories.slug, slug),
    });
    if (existing) {
      throw new BadRequestException('Category slug already exists');
    }

    const [created] = await db
      .insert(categories)
      .values({
        name: payload.name,
        slug,
        icon: payload.icon,
      })
      .returning();

    return created;
  }

  async update(id: string, payload: UpdateCategoryDto) {
    const existing = await db.query.categories.findFirst({
      where: eq(categories.id, id),
    });

    if (!existing) {
      throw new NotFoundException('Category not found');
    }

    const nextName = payload.name ?? existing.name;
    const nextSlug = payload.slug?.trim() || (payload.name ? this.buildSlug(nextName) : existing.slug);

    if (nextSlug !== existing.slug) {
      const slugOwner = await db.query.categories.findFirst({
        where: eq(categories.slug, nextSlug),
      });

      if (slugOwner && slugOwner.id !== existing.id) {
        throw new BadRequestException('Category slug already exists');
      }
    }

    const [updated] = await db
      .update(categories)
      .set({
        name: payload.name ?? existing.name,
        slug: nextSlug,
        icon: payload.icon ?? existing.icon,
      })
      .where(eq(categories.id, id))
      .returning();

    return updated;
  }

  async remove(id: string) {
    const existing = await this.findOne(id);

    const categoryInUse = await db.query.products.findFirst({
      where: eq(products.categoryId, existing.id),
    });

    if (categoryInUse) {
      throw new BadRequestException('Category is being used by products');
    }

    const [removed] = await db
      .delete(categories)
      .where(eq(categories.id, id))
      .returning();

    return removed;
  }
}