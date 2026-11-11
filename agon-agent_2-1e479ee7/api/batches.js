import supabase from './db-client.js';
import { handleCors, HttpError, requireUuid, sendError, unwrap } from './_lib/http.js';
import { assertBatchNumberFree, parseBatchInput, requireMedicine, toBatch } from './_lib/inventory.js';

/** Hosted-preview endpoint for stock batches. See api/_lib/http.js for scope. */
export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  try {
    if (req.method === 'POST') {
      const body = req.body ?? {};
      const medicineId = requireUuid(body.medicineId, 'Medicine id');
      const batchRow = parseBatchInput(body.batch);
      await requireMedicine(medicineId);
      await assertBatchNumberFree(medicineId, batchRow.batch_number);

      const now = new Date().toISOString();
      const created = await supabase
        .from('medicine_batches')
        .insert({ ...batchRow, medicine_id: medicineId, created_at: now, updated_at: now })
        .select('*')
        .single()
        .then(unwrap);
      return res.status(201).json(toBatch(created));
    }

    if (req.method === 'DELETE') {
      const id = requireUuid((req.body ?? {}).id, 'Batch id');
      const now = new Date().toISOString();
      const removed = await supabase
        .from('medicine_batches')
        .update({ deleted_at: now, updated_at: now })
        .eq('id', id)
        .is('deleted_at', null)
        .select('id')
        .then(unwrap);
      if (removed.length === 0) throw new HttpError(404, 'This batch no longer exists.');
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return sendError(res, error);
  }
}
