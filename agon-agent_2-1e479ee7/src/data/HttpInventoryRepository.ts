import type { BatchInput, MedicineBatch, MedicineInput, MedicineWithBatches } from '../domain/types';
import { ConflictError, InvalidInputError, NotFoundError, RepositoryError } from './errors';
import type { InventoryRepository } from './InventoryRepository';

interface ErrorBody {
  error?: string;
  field?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Inventory served by the hosted preview API (`/api/*`).
 *
 * Used only when the UI runs in a normal browser, where SQLite and Tauri are
 * not available. The desktop app never uses this class.
 */
export class HttpInventoryRepository implements InventoryRepository {
  private readonly baseUrl: string;

  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl;
  }

  listMedicines(): Promise<MedicineWithBatches[]> {
    return this.request<MedicineWithBatches[]>('GET', '/medicines');
  }

  createMedicine(input: MedicineInput, openingBatch: BatchInput | null): Promise<MedicineWithBatches> {
    return this.request<MedicineWithBatches>('POST', '/medicines', { medicine: input, openingBatch });
  }

  async updateMedicine(id: string, input: MedicineInput): Promise<void> {
    await this.request('PUT', '/medicines', { id, medicine: input });
  }

  async deleteMedicine(id: string): Promise<void> {
    await this.request('DELETE', '/medicines', { id });
  }

  addBatch(medicineId: string, input: BatchInput): Promise<MedicineBatch> {
    return this.request<MedicineBatch>('POST', '/batches', { medicineId, batch: input });
  }

  async deleteBatch(batchId: string): Promise<void> {
    await this.request('DELETE', '/batches', { id: batchId });
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new RepositoryError('Could not reach the server. Check your connection and try again.');
    }

    const payload: unknown = await response.json().catch(() => null);
    if (response.ok) return payload as T;

    const errorBody = (payload ?? {}) as ErrorBody;
    const message = errorBody.error ?? `The server responded with an error (${response.status}).`;
    if (response.status === 409) throw new ConflictError(message, errorBody.field ?? null);
    if (response.status === 404) throw new NotFoundError(message);
    if (response.status === 400) throw new InvalidInputError(message, errorBody.fieldErrors ?? {});
    throw new RepositoryError(message);
  }
}
