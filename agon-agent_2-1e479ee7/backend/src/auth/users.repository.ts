import { Injectable } from '@nestjs/common';
import { Database, type Queryable } from '../database/database';
import type { UserProfile } from './auth.types';

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  role: 'owner' | 'staff';
  pharmacy_id: string;
  pharmacy_name: string;
  currency_code: string;
  password_hash: string;
}

const SELECT_USER = `
  SELECT u.id, u.email, u.display_name, u.role, u.pharmacy_id, u.password_hash,
         p.name AS pharmacy_name, p.currency_code
    FROM users u
    JOIN pharmacies p ON p.id = u.pharmacy_id`;

function toProfile(row: UserRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    pharmacyId: row.pharmacy_id,
    pharmacyName: row.pharmacy_name,
    currencyCode: row.currency_code,
  };
}

export interface NewOwner {
  pharmacyName: string;
  currencyCode: string;
  displayName: string;
  email: string;
  passwordHash: string;
}

@Injectable()
export class UsersRepository {
  constructor(private readonly database: Database) {}

  async findWithHashByEmail(email: string): Promise<{ profile: UserProfile; passwordHash: string } | null> {
    const { rows } = await this.database.query<UserRow>(`${SELECT_USER} WHERE lower(u.email) = lower($1)`, [email]);
    return rows[0] ? { profile: toProfile(rows[0]), passwordHash: rows[0].password_hash } : null;
  }

  async findById(id: string): Promise<UserProfile | null> {
    const { rows } = await this.database.query<UserRow>(`${SELECT_USER} WHERE u.id = $1`, [id]);
    return rows[0] ? toProfile(rows[0]) : null;
  }

  /** Creates a pharmacy and its first user (the owner) atomically. */
  async createPharmacyWithOwner(input: NewOwner): Promise<UserProfile> {
    const userId = await this.database.transaction(async (tx: Queryable) => {
      const pharmacy = await tx.query<{ id: string }>(
        'INSERT INTO pharmacies (name, currency_code) VALUES ($1, $2) RETURNING id',
        [input.pharmacyName, input.currencyCode],
      );
      const user = await tx.query<{ id: string }>(
        `INSERT INTO users (pharmacy_id, email, password_hash, display_name, role)
         VALUES ($1, $2, $3, $4, 'owner') RETURNING id`,
        [pharmacy.rows[0].id, input.email, input.passwordHash, input.displayName],
      );
      return user.rows[0].id;
    });
    const profile = await this.findById(userId);
    if (!profile) throw new Error('User disappeared immediately after creation');
    return profile;
  }
}
