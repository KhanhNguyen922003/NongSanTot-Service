import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '@/modules/auth/admin.guard';
import { FirebaseAuthGuard } from '@/modules/auth/firebase-auth.guard';
import { AdminService } from './admin.service';
import { UpdateShopStatusDto } from './dto/update-shop-status.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { ApproveProductDto, RejectProductDto } from './dto/review-product.dto';

@Controller('admin')
@UseGuards(FirebaseAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  getDashboard() {
    return this.adminService.getDashboard();
  }

  @Get('products')
  getProducts(@Query('status') status = 'pending_review') {
    return this.adminService.getProductsForReview(status);
  }

  @Get('products/:id')
  getProductDetail(@Param('id') id: string) {
    return this.adminService.getProductDetail(id);
  }

  @Get('users')
  getUsers(@Query('role') role = 'all') {
    return this.adminService.getUsers(role);
  }

  @Patch('users/:id/role')
  updateUserRole(@Param('id') id: string, @Body() body: UpdateUserRoleDto) {
    return this.adminService.updateUserRole(id, body);
  }

  @Get('shops')
  getShops(@Query('status') status = 'all') {
    return this.adminService.getShops(status);
  }

  @Patch('shops/:id/status')
  updateShopStatus(@Param('id') id: string, @Body() body: UpdateShopStatusDto) {
    return this.adminService.updateShopStatus(id, body);
  }

  @Patch('products/:id/approve')
  approveProduct(@Param('id') id: string, @Body() body: ApproveProductDto) {
    return this.adminService.approveProduct(id, body);
  }

  @Patch('products/:id/reject')
  rejectProduct(@Param('id') id: string, @Body() body: RejectProductDto) {
    return this.adminService.rejectProduct(id, body);
  }
}
