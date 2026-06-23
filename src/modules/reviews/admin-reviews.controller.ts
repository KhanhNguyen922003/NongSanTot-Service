import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '@/modules/auth/admin.guard';
import { FirebaseAuthGuard } from '@/modules/auth/firebase-auth.guard';
import { CreateDemoReviewDto } from './dto/create-demo-review.dto';
import { ReviewsService } from './reviews.service';

@Controller('admin/reviews')
@UseGuards(FirebaseAuthGuard, AdminGuard)
export class AdminReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post('demo')
  createDemoReview(@Body() body: CreateDemoReviewDto) {
    return this.reviewsService.createDemoReview(body);
  }
}