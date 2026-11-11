import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PullQueryDto, PushDto } from './sync.dto';
import { SyncService, type PullResponse, type PushResponse } from './sync.service';

@Controller('sync')
@UseGuards(JwtAuthGuard)
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  /** Desktop -> cloud. Idempotent: sending the same changes twice is safe. */
  @Post('push')
  @HttpCode(200)
  push(@CurrentUser() user: AuthUser, @Body() dto: PushDto): Promise<PushResponse> {
    return this.sync.push(user, dto);
  }

  /** Cloud -> desktop. The desktop does not consume this yet (see ROADMAP.md). */
  @Get('pull')
  pull(@CurrentUser() user: AuthUser, @Query() query: PullQueryDto): Promise<PullResponse> {
    return this.sync.pull(user, query);
  }
}
