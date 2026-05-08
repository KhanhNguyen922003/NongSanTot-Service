import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '@/modules/auth/firebase-auth.guard';
import type { AuthenticatedUser } from '@/modules/auth/interfaces/authenticated-user.interface';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findActiveProducts() {
    return this.productsService.findActiveProducts();
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
