import supabase from './db-client.js';
import { handleCors, HttpError, requireUuid, sendError, unwrap } from './_lib/http.js';
import {
  assertBarcodeFree,
  loadInventory,
  MAX_DEMO_MEDICINES,
  parseBatchInput,
  parseMedicineInput,
  requireMedicine,
  toBatch,
  toMedicine,
} from './_lib/inventory.js';

/** Hosted-preview endpoint for medicines. See api/_lib/http.js for scope. */
export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  try {
    if (req.method === 'GET') {
      return res.status(200).json(await loadInventory());
    }

    if (req.method === 'POST') {
      const body = req.body ?? {};
      const medicineRow = parseMedicineInput(body.medicine);
      const batchRow = body.openingBatch ? parseBatchInput(body.openingBatch) : null;

      const { count, error: countError } = await supabase
        .from('medicines')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null);
      if (countError) throw countError;
      if ((count ?? 0) >= MAX_DEMO_MEDICINES) {
        throw new HttpError(409, `The demo database is limited to ${MAX_DEMO_MEDICINES} medicines. Delete one to add another.`);
      }
      await assertBarcodeFree(medicineRow.barcode);

      const now = new Date().toISOString();
      const created = await supabase
        .from('medicines')
        .insert({ ...medicineRow, created_at: now, updated_at: now })
        .select('*')
        .single()
        .then(unwrap);

      let batches = [];
      if (batchRow) {
        const batch = await supabase
          .from('medicine_batches')
          .insert({ ...batchRow, medicine_id: created.id, created_at: now, updated_at: now })
          .select('*')
          .single()
          .then(unwrap);
        batches = [toBatch(batch)];
      }
      return res.status(201).json(toMedicine(created, batches));
    }

    if (req.method === 'PUT') {
      const body = req.body ?? {};
      const id = requireUuid(body.id, 'Medicine id');
      const medicineRow = parseMedicineInput(body.medicine);
      await requireMedicine(id);
      await assertBarcodeFree(medicineRow.barcode, id);

      await supabase
        .from('medicines')
        .update({ ...medicineRow, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('id')
        .then(unwrap);
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const id = requireUuid((req.body ?? {}).id, 'Medicine id');
      await requireMedicine(id);
      const now = new Date().toISOString();
      // Soft delete, batches first - the same order the desktop repository uses.
      await supabase
        .from('medicine_batches')
        .update({ deleted_at: now, updated_at: now })
        .eq('medicine_id', id)
        .is('deleted_at', null)
        .select('id')
        .then(unwrap);
      await supabase.from('medicines').update({ deleted_at: now, updated_at: now }).eq('id', id).select('id').then(unwrap);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return sendError(res, error);
  }
}
