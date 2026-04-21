import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { firebaseAdminAuth } from '@/core/firebase/firebase-admin';
import type { AuthenticatedUser } from './interfaces/authenticated-user.interface';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException('Invalid Bearer token');
    }

    try {
      const decoded = await firebaseAdminAuth.verifyIdToken(token);
      req.user = {
        uid: decoded.uid,
        phoneNumber: decoded.phone_number,
        name: decoded.name,
        firebase: {
          sign_in_provider: decoded.firebase?.sign_in_provider,
        },
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid Firebase ID token');
    }
  }
}
