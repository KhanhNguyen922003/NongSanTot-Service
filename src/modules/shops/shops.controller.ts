import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '@/modules/auth/firebase-auth.guard';
import type { AuthenticatedUser } from '@/modules/auth/interfaces/authenticated-user.interface';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { ShopsService } from './shops.service';

@Controller('shops')
export class ShopsController {
  constructor(private readonly shopsService: ShopsService) {}

  @UseGuards(FirebaseAuthGuard)
  @Get('me/dashboard')
  getMyDashboard(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.shopsService.getMyDashboardOverview(currentUser);
  }

  @UseGuards(FirebaseAuthGuard)
  @Get('me')
  getMyShops(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.shopsService.getMine(currentUser);
  }

  @UseGuards(FirebaseAuthGuard)
  @Post()
  createShop(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateShopDto,
  ) {
    return this.shopsService.createMine(currentUser, body);
  }

  @UseGuards(FirebaseAuthGuard)
  @Patch('me')
  updateMyShop(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: UpdateShopDto,
  ) {
    return this.shopsService.updateMine(currentUser, body);
  }

  @UseGuards(FirebaseAuthGuard)
  @Delete('me')
  deactivateMyShop(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.shopsService.deactivateMine(currentUser);
  }

  /**
   * Công khai: Lấy chi tiết cửa hàng theo shopId
   */
  @Get(':shopId')
  getShopDetail(@Param('shopId') shopId: string) {
    return this.shopsService.getShopDetail(shopId);
  }
}
