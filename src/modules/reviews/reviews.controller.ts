import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '@/modules/auth/firebase-auth.guard';
import type { AuthenticatedUser } from '@/modules/auth/interfaces/authenticated-user.interface';
import { CreateMyReviewDto } from './dto/create-my-review.dto';
import { ReviewsService } from './reviews.service';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('products/:productId')
  getProductReviews(@Param('productId') productId: string) {
    return this.reviewsService.getProductReviews(productId);
  }

  @Get('me/eligibility')
  @UseGuards(FirebaseAuthGuard)
  getMyEligibility(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query('productId') productId: string,
  ) {
    return this.reviewsService.getMyReviewEligibility(currentUser, productId);
  }

  @Post('me')
  @UseGuards(FirebaseAuthGuard)
  createMyReview(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateMyReviewDto,
  ) {
    return this.reviewsService.createMyReview(currentUser, body);
  }
}