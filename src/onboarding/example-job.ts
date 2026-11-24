import { Job, LineItem } from '../types';
import { vertical } from '../verticals';

export function buildExampleJob(nowIso: string, uuid: string): { job: Job; items: LineItem[] } {
  const id = `example-${uuid}`; // 'example-' prefix: never synced (see src/sync)
  return {
    job: {
      id,
      clientName: 'Dana Sample',
      clientPhone: '555-0100',
      clientEmail: '',
      clientAddress: '12 Oak St',
      title: 'Example: fence repair (tap to explore)',
      description: 'Replace three damaged fence panels and re-hang the gate.',
      status: 'draft',
      transcript: 'This is an example voice note transcript…',
      notes: `This example ${vertical.terminology.job.toLowerCase()} shows what an AI extraction looks like. Delete it any time.`,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    items: [
      { id: `${id}-li-0`, jobId: id, kind: 'material', description: 'Fence panel', qty: 3, unit: 'ea', unitPrice: 45, lowConfidence: false, checked: false },
      { id: `${id}-li-1`, jobId: id, kind: 'labor', description: 'Install and re-hang gate', qty: 4, unit: 'hr', unitPrice: 60, lowConfidence: false, checked: false },
      { id: `${id}-li-2`, jobId: id, kind: 'material', description: 'Post mix', qty: 1, unit: '', unitPrice: null, lowConfidence: true, checked: false },
    ],
  };
}
