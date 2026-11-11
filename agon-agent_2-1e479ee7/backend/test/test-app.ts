import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { API_PREFIX, configureApp } from '../src/app.setup';
import { APP_CONFIG, type AppConfig } from '../src/config/app-config';
import { Database } from '../src/database/database';
import { runMigrations } from '../src/database/migration-runner';
import { PgliteDatabase } from './pglite-database';

export const api = (path: string): string => `/${API_PREFIX}${path}`;

export interface TestApp {
  app: INestApplication;
  database: PgliteDatabase;
  appliedMigrations: string[];
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

/**
 * Starts the real application (all modules, pipes and filters) against an
 * in-memory PostgreSQL with the real migrations applied.
 */
export async function createTestApp(overrides: Partial<AppConfig> = {}): Promise<TestApp> {
  const config: AppConfig = {
    nodeEnv: 'test',
    port: 0,
    corsOrigins: ['http://localhost:1420'],
    databaseUrl: 'postgresql://not-used-in-tests',
    databaseSsl: false,
    jwtSecret: 'test-only-secret-test-only-secret-test-only',
    jwtExpiresInSeconds: 600,
    allowRegistration: true,
    omniroute: null,
    ...overrides,
  };
  const database = await PgliteDatabase.create();
  const appliedMigrations = await runMigrations(database);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(APP_CONFIG)
    .useValue(config)
    .overrideProvider(Database)
    .useValue(database)
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, config);
  await app.init();

  return {
    app,
    database,
    appliedMigrations,
    http: () => request(app.getHttpServer()),
    close: async () => {
      await app.close();
      await database.close();
    },
  };
}

export interface Account {
  token: string;
  auth: { Authorization: string };
  pharmacyId: string;
}

export async function registerAccount(testApp: TestApp, label: string, currencyCode: string = 'INR'): Promise<Account> {
  const response = await testApp
    .http()
    .post(api('/auth/register'))
    .send({
      pharmacyName: `${label} Pharmacy`,
      displayName: `${label} Owner`,
      email: `${label.toLowerCase()}@example.test`,
      password: 'a-long-test-password',
      currencyCode,
    })
    .expect(201);
  return {
    token: response.body.accessToken,
    auth: { Authorization: `Bearer ${response.body.accessToken}` },
    pharmacyId: response.body.user.pharmacyId,
  };
}

export const MEDICINE_ID = '11111111-1111-4111-8111-111111111111';
export const BATCH_ID = '22222222-2222-4222-8222-222222222222';
export const EXPIRED_BATCH_ID = '33333333-3333-4333-8333-333333333333';

export function medicineChange(overrides: Record<string, unknown> = {}, data: Record<string, unknown> = {}) {
  return {
    entity: 'medicine',
    id: MEDICINE_ID,
    updatedAt: '2026-11-01T10:00:00.000Z',
    deletedAt: null,
    data: {
      name: 'Paracetamol',
      genericName: 'Acetaminophen',
      manufacturer: null,
      dosageForm: 'tablet',
      strength: '500 mg',
      unit: 'strip',
      barcode: null,
      requiresPrescription: false,
      reorderLevel: 200,
      rack: 'A',
      shelf: '2',
      drawer: null,
      notes: null,
      createdAt: '2026-11-01T10:00:00.000Z',
      ...data,
    },
    ...overrides,
  };
}

export function batchChange(overrides: Record<string, unknown> = {}, data: Record<string, unknown> = {}) {
  return {
    entity: 'medicine_batch',
    id: BATCH_ID,
    updatedAt: '2026-11-01T10:00:00.000Z',
    deletedAt: null,
    data: {
      medicineId: MEDICINE_ID,
      batchNumber: 'PCM-1',
      // Far-future and far-past dates keep these tests independent of today's date.
      expiryDate: '2099-12-31',
      quantity: 120,
      purchasePriceMinor: 850,
      sellingPriceMinor: 1200,
      receivedAt: '2026-10-20',
      createdAt: '2026-11-01T10:00:00.000Z',
      ...data,
    },
    ...overrides,
  };
}
