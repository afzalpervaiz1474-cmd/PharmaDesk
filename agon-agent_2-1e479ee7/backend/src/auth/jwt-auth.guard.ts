import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AuthUser, JwtPayload } from './auth.types';

export type AuthenticatedRequest = Request & { user: AuthUser };

/** Requires a valid `Authorization: Bearer <token>` header and exposes the caller as `request.user`. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Sign in to continue');
    }
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(header.slice('Bearer '.length));
      request.user = { userId: payload.sub, pharmacyId: payload.pharmacyId, role: payload.role };
      return true;
    } catch {
      throw new UnauthorizedException('Your session has expired. Sign in again');
    }
  }
}
