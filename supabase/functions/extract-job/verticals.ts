// Per-vertical extraction config. Prompts are server-side so they can be tuned
// without an app release. Keep each RESPONSE_SCHEMA in sync with the client zod
// schema (jobvoice/src/extraction/schema.ts).

const JOBVOICE_PROMPT = `You extract structured job data from a tradesperson's voice note.
Rules:
- NEVER invent prices, quantities, or client details. Only use what was said.
- If a price or quantity is unclear, set confidence to "low".
- Anything you cannot classify goes verbatim into unclassified_notes. Never drop content.
- transcript must contain the full verbatim transcript of the audio.
- Amounts are plain numbers (no currency symbols).`;

// Keep in sync with jobvoice/src/extraction/schema.ts (zod client schema).
const SHARED_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    client: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING' },
        phone: { type: 'STRING' },
        email: { type: 'STRING' },
        address: { type: 'STRING' },
      },
    },
    job: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING' },
        description: { type: 'STRING' },
        job_type: { type: 'STRING' },
      },
    },
    line_items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          kind: { type: 'STRING', enum: ['labor', 'material', 'fee'] },
          description: { type: 'STRING' },
          qty: { type: 'NUMBER' },
          unit: { type: 'STRING' },
          unit_price: { type: 'NUMBER', nullable: true },
          confidence: { type: 'STRING', enum: ['high', 'low'] },
        },
        required: ['kind', 'description'],
      },
    },
    materials_mentioned_without_price: { type: 'ARRAY', items: { type: 'STRING' } },
    labor_estimate: {
      type: 'OBJECT',
      properties: {
        hours: { type: 'NUMBER', nullable: true },
        rate: { type: 'NUMBER', nullable: true },
      },
    },
    follow_ups: { type: 'ARRAY', items: { type: 'STRING' } },
    unclassified_notes: { type: 'STRING' },
    transcript: { type: 'STRING' },
  },
  required: ['transcript'],
};

export interface ServerVertical {
  systemPrompt: string;
  responseSchema: unknown;
}

export const SERVER_VERTICALS: Record<string, ServerVertical> = {
  jobvoice: { systemPrompt: JOBVOICE_PROMPT, responseSchema: SHARED_RESPONSE_SCHEMA },
};
