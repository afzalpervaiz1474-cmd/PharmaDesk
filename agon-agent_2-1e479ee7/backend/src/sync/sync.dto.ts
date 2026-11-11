import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const SYNC_ENTITIES = ['medicine', 'medicine_batch'] as const;
export type SyncEntity = (typeof SYNC_ENTITIES)[number];

export const MAX_CHANGES_PER_PUSH = 500;

/** Envelope of one changed record. `data` is validated per entity by SyncService. */
export class SyncChangeDto {
  @IsIn(SYNC_ENTITIES)
  entity!: SyncEntity;

  @IsUUID()
  id!: string;

  @IsISO8601({ strict: true })
  updatedAt!: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  deletedAt?: string | null;

  @IsObject()
  data!: Record<string, unknown>;
}

export class PushDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  deviceId!: string;

  @IsArray()
  @ArrayMaxSize(MAX_CHANGES_PER_PUSH)
  @ValidateNested({ each: true })
  @Type(() => SyncChangeDto)
  changes!: SyncChangeDto[];
}

export class PullQueryDto {
  /** Return changes with a sequence number greater than this. Start at 0. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cursor: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit: number = 200;
}

export interface PushResultDto {
  entity: SyncEntity;
  id: string;
  /** applied: stored · stale: server already has a newer version · rejected: not stored. */
  status: 'applied' | 'stale' | 'rejected';
  reason?: string;
}
