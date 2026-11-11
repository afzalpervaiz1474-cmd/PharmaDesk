import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MedicinesRepository } from './medicines.repository';

/**
 * Read-only view of the cloud inventory.
 * Writes happen on the desktop and arrive through `POST /sync/push`; there
 * are deliberately no create/update/delete routes here yet.
 */
@Controller('medicines')
@UseGuards(JwtAuthGuard)
export class MedicinesController {
  constructor(private readonly medicines: MedicinesRepository) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<Record<string, unknown>[]> {
    return this.medicines.listWithBatches(user.pharmacyId);
  }
}
