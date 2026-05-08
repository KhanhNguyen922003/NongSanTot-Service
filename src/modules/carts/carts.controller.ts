import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '@/modules/auth/firebase-auth.guard';
import type { AuthenticatedUser } from '@/modules/auth/interfaces/authenticated-user.interface';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { CartsService } from './carts.service';

@Controller('carts')
@UseGuards(FirebaseAuthGuard)
export class CartsController {
  constructor(private readonly cartsService: CartsService) {}

  @Get('me')
  getMyCart(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.cartsService.getMyCart(currentUser);
  }

  @Post('me/items')
  addItem(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: AddCartItemDto,
  ) {
    return this.cartsService.addItem(currentUser, body);
  }

  @Patch('me/items/:itemId')
  updateItemQuantity(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('itemId') itemId: string,
    @Body() body: UpdateCartItemDto,
  ) {
    return this.cartsService.updateMyCartItemQuantity(currentUser, itemId, body);
  }

  @Delete('me/items/:itemId')
  removeItem(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('itemId') itemId: string,
  ) {
    return this.cartsService.removeMyCartItem(currentUser, itemId);
  }
}
