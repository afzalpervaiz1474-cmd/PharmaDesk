import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Keep in sync with src/domain/types.ts (desktop).
export const DOSAGE_FORMS = [
  'tablet', 'capsule', 'syrup', 'suspension', 'injection', 'cream',
  'ointment', 'drops', 'inhaler', 'powder', 'other',
] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_QUANTITY = 1_000_000;
const MAX_PRICE_MINOR = 2_000_000_000;

/** Field values of a medicine as sent by the desktop app. Same limits as the desktop form. */
export class MedicineDataDto {
  @IsString() @IsNotEmpty() @MaxLength(120)
  name!: string;

  @IsOptional() @IsString() @MaxLength(120)
  genericName?: string | null;

  @IsOptional() @IsString() @MaxLength(120)
  manufacturer?: string | null;

  @IsIn(DOSAGE_FORMS)
  dosageForm!: string;

  @IsOptional() @IsString() @MaxLength(30)
  strength?: string | null;

  @IsString() @IsNotEmpty() @MaxLength(30)
  unit!: string;

  @IsOptional() @Matches(/^[A-Za-z0-9-]{4,32}$/, { message: 'barcode must be 4-32 letters, digits or hyphens' })
  barcode?: string | null;

  @IsBoolean()
  requiresPrescription!: boolean;

  @IsInt() @Min(0) @Max(MAX_QUANTITY)
  reorderLevel!: number;

  @IsOptional() @IsString() @MaxLength(20)
  rack?: string | null;

  @IsOptional() @IsString() @MaxLength(20)
  shelf?: string | null;

  @IsOptional() @IsString() @MaxLength(20)
  drawer?: string | null;

  @IsOptional() @IsString() @MaxLength(500)
  notes?: string | null;

  @IsISO8601({ strict: true })
  createdAt!: string;
}

/** Field values of a stock batch as sent by the desktop app. */
export class BatchDataDto {
  @IsUUID()
  medicineId!: string;

  @IsString() @IsNotEmpty() @MaxLength(40)
  batchNumber!: string;

  @Matches(ISO_DATE, { message: 'expiryDate must be YYYY-MM-DD' }) @IsISO8601({ strict: true })
  expiryDate!: string;

  @IsInt() @Min(0) @Max(MAX_QUANTITY)
  quantity!: number;

  @IsInt() @Min(0) @Max(MAX_PRICE_MINOR)
  purchasePriceMinor!: number;

  @IsInt() @Min(0) @Max(MAX_PRICE_MINOR)
  sellingPriceMinor!: number;

  @IsOptional() @Matches(ISO_DATE, { message: 'receivedAt must be YYYY-MM-DD' }) @IsISO8601({ strict: true })
  receivedAt?: string | null;

  @IsISO8601({ strict: true })
  createdAt!: string;
}
