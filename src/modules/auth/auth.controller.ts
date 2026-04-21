import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from './decorators/current-user.decorator';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import type { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @UseGuards(FirebaseAuthGuard)
  async getMe(@CurrentUser() currentUser: AuthenticatedUser) {
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
