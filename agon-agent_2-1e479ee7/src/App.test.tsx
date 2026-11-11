// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { MedicineWithBatches } from './domain/types';

/**
 * UI smoke tests: the whole app rendered in a simulated DOM, in browser-preview
 * mode, with the preview API replaced by an in-memory fake.
 *
 * These prove that screens render, navigate, validate and call the data layer.
 * They do not prove how the app looks, and they do not exercise Tauri.
 */

const timestamps = { createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z' };

function seed(): MedicineWithBatches[] {
  return [
    {
      id: 'm-1',
      name: 'Paracetamol',
      genericName: 'Acetaminophen',
      manufacturer: null,
      dosageForm: 'tablet',
      strength: '500 mg',
      unit: 'strip',
      barcode: null,
      requiresPrescription: false,
      reorderLevel: 20,
      rack: 'A',
      shelf: '1',
      drawer: null,
      notes: null,
      ...timestamps,
      batches: [
        {
          id: 'b-1',
          medicineId: 'm-1',
          batchNumber: 'PCM-1',
          expiryDate: '2099-12-31',
          quantity: 120,
          purchasePriceMinor: 850,
          sellingPriceMinor: 1200,
          receivedAt: null,
          ...timestamps,
        },
      ],
    },
    {
      id: 'm-2',
      name: 'Ondansetron',
      genericName: null,
      manufacturer: null,
      dosageForm: 'tablet',
      strength: '4 mg',
      unit: 'strip',
      barcode: null,
      requiresPrescription: true,
      reorderLevel: 15,
      rack: null,
      shelf: null,
      drawer: null,
      notes: null,
      ...timestamps,
      batches: [],
    },
  ];
}

interface RecordedRequest {
  method: string;
  path: string;
  body: unknown;
}

/** Stands in for the preview API. Returns the list of requests it received. */
function installFakeApi(medicines: MedicineWithBatches[]): RecordedRequest[] {
  const requests: RecordedRequest[] = [];
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const path = input.split('?')[0];
      const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      requests.push({ method, path, body });

      if (path === '/api/medicines' && method === 'GET') return json(200, medicines);
      if (path === '/api/medicines' && method === 'POST') {
        const { medicine, openingBatch } = body as { medicine: MedicineWithBatches; openingBatch: object | null };
        const created = {
          ...medicine,
          id: 'm-new',
          ...timestamps,
          batches: openingBatch ? [{ ...openingBatch, id: 'b-new', medicineId: 'm-new', ...timestamps }] : [],
        } as MedicineWithBatches;
        medicines.push(created);
        return json(201, created);
      }
      if (path === '/api/medicines' && method === 'DELETE') {
        const { id } = body as { id: string };
        medicines.splice(medicines.findIndex((medicine) => medicine.id === id), 1);
        return json(200, { ok: true });
      }
      if (path === '/api/assistant' && method === 'GET') {
        return json(200, input.includes('resource=status') ? { mode: 'data_lookup', model: null } : []);
      }
      return json(404, { error: 'Not found in fake API' });
    }),
  );
  return requests;
}

describe('App (browser-preview mode)', () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '#/';
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows dashboard figures calculated from the loaded inventory', async () => {
    installFakeApi(seed());
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    // The cards replace the loading skeleton once the inventory has arrived.
    await screen.findByRole('heading', { name: 'Medicines registered' });
    const card = (label: string) => screen.getByRole('heading', { name: label }).closest('section') as HTMLElement;

    expect(within(card('Medicines registered')).getByText('2')).toBeTruthy();
    expect(within(card('Sellable units in stock')).getByText('120')).toBeTruthy();
    // 120 units x 8.50 = 1,020.00 at cost.
    expect(within(card('Stock value at cost')).getByText(/1,020\.00/)).toBeTruthy();
    expect(within(card('Needs reorder')).getByText('1 out of stock · 0 low')).toBeTruthy();

    // Planned modules are labelled as such and show no numbers.
    expect(screen.getByText(/These modules are not built yet, so no figures are shown/)).toBeTruthy();
    expect(screen.getByText(/Web preview\./)).toBeTruthy();
  });

  it('shows an error with a retry when the inventory cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Database offline' }), { status: 500 })));
    render(<App />);
    expect(await screen.findByText('The inventory could not be loaded')).toBeTruthy();
    expect(screen.getByText('Database offline')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('lists medicines, filters them and opens the detail panel', async () => {
    const user = userEvent.setup();
    installFakeApi(seed());
    window.location.hash = '#/inventory';
    render(<App />);

    expect(await screen.findByRole('button', { name: 'Open Paracetamol' })).toBeTruthy();
    expect(screen.getByText('Showing 2 of 2 medicines')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Needs reorder/ }));
    expect(screen.queryByRole('button', { name: 'Open Paracetamol' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open Ondansetron' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /^All/ }));
    await user.type(screen.getByRole('searchbox', { name: 'Search medicines' }), 'acetamin');
    expect(screen.getByText('Showing 1 of 2 medicines')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Open Paracetamol' }));
    const panel = await screen.findByRole('dialog', { name: 'Paracetamol' });
    expect(within(panel).getByText('Rack A · Shelf 1')).toBeTruthy();
    expect(within(panel).getByText('PCM-1')).toBeTruthy();
  });

  it('validates the registration form and saves a valid medicine with its opening batch', async () => {
    const user = userEvent.setup();
    const requests = installFakeApi(seed());
    window.location.hash = '#/inventory/new';
    render(<App />);

    await screen.findByRole('heading', { name: 'Register medicine' });
    const submit = screen.getAllByRole('button', { name: 'Register medicine' }).at(-1) as HTMLElement;

    // Empty submit: errors are shown and nothing is sent.
    await user.click(submit);
    expect(await screen.findByText('Enter the medicine name.')).toBeTruthy();
    expect(screen.getByText('Enter the batch number printed on the pack.')).toBeTruthy();
    expect(requests.some((request) => request.method === 'POST')).toBe(false);

    await user.type(screen.getByLabelText(/Medicine name/), 'Cetirizine');
    await user.type(screen.getByLabelText(/Selling unit/), 'strip');
    await user.type(screen.getByLabelText(/Rack/), 'C');
    await user.type(screen.getByLabelText(/Batch number/), 'CTZ-9');
    await user.type(screen.getByLabelText(/Expiry date/), '2099-06-30');
    await user.type(screen.getByLabelText(/Quantity/), '40');
    await user.type(screen.getByLabelText(/Purchase price/), '9');
    await user.type(screen.getByLabelText(/Selling price/), '15.5');
    await user.click(submit);

    expect(await screen.findByText('Registered “Cetirizine”.')).toBeTruthy();
    const post = requests.find((request) => request.method === 'POST');
    expect(post?.body).toMatchObject({
      medicine: { name: 'Cetirizine', unit: 'strip', rack: 'C', dosageForm: 'tablet', reorderLevel: 0, barcode: null },
      openingBatch: { batchNumber: 'CTZ-9', expiryDate: '2099-06-30', quantity: 40, purchasePriceMinor: 900, sellingPriceMinor: 1550 },
    });
    expect(screen.getByRole('button', { name: 'Open Cetirizine' })).toBeTruthy();
  });

  it('asks for confirmation before deleting a medicine', async () => {
    const user = userEvent.setup();
    const requests = installFakeApi(seed());
    window.location.hash = '#/inventory';
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Open Ondansetron' }));
    await user.click(screen.getByRole('button', { name: 'Delete medicine' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete Ondansetron?' });
    expect(requests.some((request) => request.method === 'DELETE')).toBe(false);

    await user.click(within(dialog).getByRole('button', { name: 'Delete medicine' }));
    expect(await screen.findByText('Deleted “Ondansetron”.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open Ondansetron' })).toBeNull());
  });

  it('marks unfinished modules as planned instead of showing fake screens', async () => {
    installFakeApi(seed());
    window.location.hash = '#/planned/sales';
    render(<App />);
    expect(await screen.findByText('This module is not implemented yet')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Sales & billing' })).toBeTruthy();
  });

  it('labels the assistant as data-lookup mode when no AI model is connected', async () => {
    installFakeApi(seed());
    window.location.hash = '#/assistant';
    render(<App />);
    expect(await screen.findByText('Data-lookup mode: no AI model is connected')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'What was my profit this month?' })).toBeTruthy();
  });

  it('explains that sync is unavailable outside the desktop app', async () => {
    installFakeApi(seed());
    window.location.hash = '#/settings';
    render(<App />);
    expect(await screen.findByText('Not available in the web preview')).toBeTruthy();
    expect(screen.getByText('Set the backend address first. The app works fully without an account.')).toBeTruthy();
  });
});
