import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '@/modules/auth/firebase-auth.guard';
import type { AuthenticatedUser } from '@/modules/auth/interfaces/authenticated-user.interface';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateSellerProductDto } from './dto/update-seller-product.dto';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('me/list')
  @UseGuards(FirebaseAuthGuard)
  listMineForSeller(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.productsService.listMineForSeller(currentUser);
  }

  @Patch('me/:productId')
  @UseGuards(FirebaseAuthGuard)
  updateMineForSeller(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('productId') productId: string,
    @Body() body: UpdateSellerProductDto,
  ) {
    return this.productsService.updateMineForSeller(currentUser, productId, body);
  }

  @Delete('me/:productId')
  @UseGuards(FirebaseAuthGuard)
  archiveMineForSeller(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('productId') productId: string,
  ) {
    return this.productsService.archiveMineForSeller(currentUser, productId);
  }

  @Get()
  findActiveProducts(
    @Query('q') q?: string,
    @Query('categorySlug') categorySlug?: string,
    @Query('categoryId') categoryId?: string,
    @Query('tags') tags?: string,
    @Query('minRating') minRating?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
  ) {
    return this.productsService.findActiveProducts({
      q,
      categorySlug: categorySlug?.split(',').map((s) => s.trim()).filter(Boolean),
      categoryId: categoryId?.split(',').map((s) => s.trim()).filter(Boolean),
      tags: tags?.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
      minRating: minRating ? Number(minRating) : undefined,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
    });
  }

  @Get(':id')
  findActiveProductDetail(@Param('id') id: string) {
    return this.productsService.findActiveProductDetail(id);
  }

  @Post()
  @UseGuards(FirebaseAuthGuard)
  createMine(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateProductDto,
  ) {
    return this.productsService.createMine(currentUser, body);
  }
}
