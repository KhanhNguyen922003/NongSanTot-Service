import { ConflictException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from './decorators/current-user.decorator';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import type { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('phone-exists')
  async phoneExists(@Query('phone') phone: string) {
    return this.authService.isPhoneRegistered(phone);
  }

  @Get('me')
  @UseGuards(FirebaseAuthGuard)
  async getMe(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query('flow') flow?: string,
  ) {
    if (flow === 'signup') {
      const phoneExists = await this.authService.isPhoneRegistered(currentUser.phoneNumber ?? '');
      if (phoneExists.exists) {
        throw new ConflictException('Số điện thoại này đã được đăng ký. Vui lòng đăng nhập.');
      }
    }

    const appUser = await this.authService.upsertAppUser(currentUser);

    return {
      user: appUser,
      firebase: {
        uid: currentUser.uid,
        phoneNumber: currentUser.phoneNumber,
        provider: currentUser.firebase?.sign_in_provider,
      },
    };
  }
}
