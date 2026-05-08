import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '@/modules/auth/admin.guard';
import { FirebaseAuthGuard } from '@/modules/auth/firebase-auth.guard';
import { AdminService } from './admin.service';
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

  @Patch('products/:id/approve')
  approveProduct(@Param('id') id: string, @Body() body: ApproveProductDto) {
    return this.adminService.approveProduct(id, body);
  }

  @Patch('products/:id/reject')
  rejectProduct(@Param('id') id: string, @Body() body: RejectProductDto) {
    return this.adminService.rejectProduct(id, body);
  }
}
