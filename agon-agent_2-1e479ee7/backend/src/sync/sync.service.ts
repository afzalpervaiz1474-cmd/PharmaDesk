import { Injectable, Logger } from '@nestjs/common';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import type { AuthUser } from '../auth/auth.types';
import { BatchDataDto, MedicineDataDto } from '../medicines/medicine.dto';
import { MedicinesRepository, type StoredChange, type UpsertOutcome } from '../medicines/medicines.repository';
import type { PullQueryDto, PushDto, PushResultDto, SyncChangeDto } from './sync.dto';

export interface PushResponse {
  results: PushResultDto[];
  serverTime: string;
}

export interface PullResponse {
  changes: StoredChange[];
  /** Pass this back as `cursor` to continue. */
  nextCursor: number;
  hasMore: boolean;
}

/**
 * Server side of the offline sync protocol.
 *
 * Push: the desktop sends the current state of each locally changed record.
 *   Records are applied one by one (not as a single transaction), so one bad
 *   record never blocks the rest, and re-sending the same batch is harmless.
 * Conflicts: last write wins, decided by the record's `updatedAt`.
 *   Known limitation: that timestamp comes from the device clock. A device
 *   with a wrong clock can win or lose conflicts it should not.
 * Pull: changes are numbered by a database sequence; clients page through
 *   them with a cursor.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(private readonly medicines: MedicinesRepository) {}

  async push(user: AuthUser, dto: PushDto): Promise<PushResponse> {
    const results = new Array<PushResultDto>(dto.changes.length);
    // Medicines first, so a batch pushed together with its new medicine finds it.
    const order = dto.changes
      .map((change, index) => ({ index, rank: change.entity === 'medicine' ? 0 : 1 }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index);

    for (const { index } of order) {
      results[index] = await this.apply(user.pharmacyId, dto.changes[index]);
    }
    return { results, serverTime: new Date().toISOString() };
  }

  async pull(user: AuthUser, query: PullQueryDto): Promise<PullResponse> {
    // One extra row tells us whether another page exists.
    const rows = await this.medicines.changesSince(user.pharmacyId, query.cursor, query.limit + 1);
    const changes = rows.slice(0, query.limit);
    return {
      changes,
      nextCursor: changes.length > 0 ? changes[changes.length - 1].serverSeq : query.cursor,
      hasMore: rows.length > query.limit,
    };
  }

  private async apply(pharmacyId: string, change: SyncChangeDto): Promise<PushResultDto> {
    const base = { entity: change.entity, id: change.id };
    const version = { id: change.id, updatedAt: change.updatedAt, deletedAt: change.deletedAt ?? null };
    try {
      let outcome: UpsertOutcome;
      if (change.entity === 'medicine') {
        const parsed = await parseData(MedicineDataDto, change.data);
        if (!parsed.ok) return { ...base, status: 'rejected', reason: parsed.reason };
        outcome = await this.medicines.upsertMedicine(pharmacyId, version, parsed.value);
      } else {
        const parsed = await parseData(BatchDataDto, change.data);
        if (!parsed.ok) return { ...base, status: 'rejected', reason: parsed.reason };
        outcome = await this.medicines.upsertBatch(pharmacyId, version, parsed.value);
      }

      if (outcome === 'applied' || outcome === 'stale') return { ...base, status: outcome };
      return {
        ...base,
        status: 'rejected',
        reason:
          outcome === 'unknown_medicine'
            ? 'The medicine this batch belongs to has not been synchronised'
            : 'This id is already used by a record outside your store',
      };
    } catch (error) {
      // Database constraint failures and similar: keep details in the server log only.
      this.logger.error(`Could not store ${change.entity} ${change.id}: ${error instanceof Error ? error.message : error}`);
      return { ...base, status: 'rejected', reason: 'The server could not store this record' };
    }
  }
}

type Parsed<T> = { ok: true; value: T } | { ok: false; reason: string };

/** Validates an untyped payload against a DTO class, rejecting unknown properties. */
async function parseData<T extends object>(dto: ClassConstructor<T>, data: unknown): Promise<Parsed<T>> {
  const value = plainToInstance(dto, data);
  const errors = await validate(value, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length === 0) return { ok: true, value };
  const messages = errors.flatMap((error) => Object.values(error.constraints ?? {}));
  return { ok: false, reason: messages.slice(0, 3).join('; ') || 'Invalid record' };
}
