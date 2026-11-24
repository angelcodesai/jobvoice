import { z } from 'zod';

export const lineItemSchema = z.object({
  kind: z.enum(['labor', 'material', 'fee']),
  description: z.string().default(''),
  qty: z.number().default(1),
  unit: z.string().default(''),
  unit_price: z.number().nullable().default(null),
  confidence: z.enum(['high', 'low']).default('low'),
});

// Keep in sync with RESPONSE_SCHEMA in supabase/functions/extract-job/index.ts
// (Gemini response schema in the edge function).
export const extractionSchema = z.object({
  client: z
    .object({
      name: z.string().default(''),
      phone: z.string().default(''),
      email: z.string().default(''),
      address: z.string().default(''),
    })
    .prefault({}),
  job: z
    .object({
      title: z.string().default(''),
      description: z.string().default(''),
      job_type: z.string().default(''),
    })
    .prefault({}),
  line_items: z.array(lineItemSchema).default([]),
  materials_mentioned_without_price: z.array(z.string()).default([]),
  labor_estimate: z
    .object({
      hours: z.number().nullable().default(null),
      rate: z.number().nullable().default(null),
    })
    .prefault({}),
  follow_ups: z.array(z.string()).default([]),
  unclassified_notes: z.string().default(''),
  transcript: z.string().default(''),
});

export type Extraction = z.infer<typeof extractionSchema>;
export type ExtractedLineItem = z.infer<typeof lineItemSchema>;

export function parseExtraction(raw: unknown): Extraction {
  return extractionSchema.parse(raw);
}
