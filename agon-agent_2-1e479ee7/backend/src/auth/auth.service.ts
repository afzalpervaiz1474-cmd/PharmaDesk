import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { isUniqueViolation } from '../database/database';
import type { LoginDto, RegisterDto } from './auth.dto';
import type { AuthResponse, JwtPayload, UserProfile } from './auth.types';
import { hashPassword, verifyPassword } from './password';
import { UsersRepository } from './users.repository';

// Verified against when the email is unknown, so that a wrong email and a
// wrong password take the same time and return the same error.
const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '==';

/**
 * Implemented: owner registration, login, stateless JWT access tokens.
 * Not implemented yet: refresh tokens, password reset, email verification,
 * login rate limiting, staff invitations, role-based permissions.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    if (!this.config.allowRegistration) {
      throw new ForbiddenException('Registration is disabled on this server');
    }
    const email = dto.email.trim().toLowerCase();
    if (await this.users.findWithHashByEmail(email)) {
      throw new ConflictException('An account with this email already exists');
    }
    try {
      const user = await this.users.createPharmacyWithOwner({
        pharmacyName: dto.pharmacyName.trim(),
        currencyCode: dto.currencyCode ?? 'INR',
        displayName: dto.displayName.trim(),
        email,
        passwordHash: await hashPassword(dto.password),
      });
      return this.issueToken(user);
    } catch (error) {
      // Two simultaneous registrations with the same email: the index decides.
      if (isUniqueViolation(error)) throw new ConflictException('An account with this email already exists');
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const found = await this.users.findWithHashByEmail(dto.email.trim().toLowerCase());
    const passwordMatches = await verifyPassword(dto.password, found?.passwordHash ?? DUMMY_HASH);
    if (!found || !passwordMatches) {
      throw new UnauthorizedException('Incorrect email or password');
    }
    return this.issueToken(found.profile);
  }

  async profile(userId: string): Promise<UserProfile> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('This account no longer exists');
    return user;
  }

  private async issueToken(user: UserProfile): Promise<AuthResponse> {
    const payload: JwtPayload = { sub: user.id, pharmacyId: user.pharmacyId, role: user.role };
    return { accessToken: await this.jwt.signAsync(payload), user };
  }
}
