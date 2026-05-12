import {
  Body,
  Controller,
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
import { BuyerConfirmNegotiationOrderDto } from './dto/buyer-confirm-negotiation.dto';
import { CheckoutOrdersDto } from './dto/checkout-orders.dto';
import { ConfirmOrderDto } from './dto/confirm-order.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(FirebaseAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('checkout/quote')
  quoteShipping(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query('shippingAddressId') shippingAddressId: string,
    @Query('fastShipping') fastShipping?: string,
  ) {
    return this.ordersService.quoteShippingForMyCart(
      currentUser,
      shippingAddressId,
      fastShipping === 'true',
    );
  }

  @Post('checkout')
  checkout(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CheckoutOrdersDto,
  ) {
    return this.ordersService.checkoutFromMyCart(currentUser, body);
  }

  @Get('me/buy')
  getMyBuyOrders(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.ordersService.getMyBuyOrders(currentUser);
  }

  @Get('me/sell')
  getMySellOrders(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.ordersService.getMySellOrders(currentUser);
  }

  @Patch(':id/negotiation/confirm-address')
  buyerFinalizeNegotiation(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: BuyerConfirmNegotiationOrderDto,
  ) {
    return this.ordersService.buyerConfirmNegotiationOrder(currentUser, id, body);
  }

  @Get(':id')
  getOrderDetail(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.ordersService.getOrderDetail(currentUser, id);
  }

  @Patch(':id/confirm')
  confirmOrder(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: ConfirmOrderDto,
  ) {
    return this.ordersService.confirmOrderBySeller(currentUser, id, body);
  }

  @Patch(':id/cancel')
  cancelOrder(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.ordersService.cancelOrder(currentUser, id);
  }
}
