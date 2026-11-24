import type { VerticalConfig } from './types.ts';

export const jobvoice: VerticalConfig = {
  key: 'jobvoice',
  appName: 'JobVoice',
  tagline: 'Talk about the job. Get the paperwork.',
  primaryColor: '#1a73e8',
  recordHint:
    "Say the client's name and address, what the job involves, materials, hours and prices.",
  terminology: {
    job: 'Job',
    jobPlural: 'Jobs',
    quote: 'Quote',
    client: 'Client',
    clientPlural: 'Clients',
    newNoteCta: '🎙️ New voice note',
    emptyState: 'No jobs yet.\nTap the mic and talk about your next job.',
  },
  documents: {
    pdfTitlePrefix: 'Quote #',
    defaultTerms: 'Quote valid for 30 days.',
  },
  legal: {
    privacyUrl: 'https://example.com/jobvoice/privacy',
    termsUrl: 'https://example.com/jobvoice/terms',
  },
  revenuecat: {
    apiKey: process.env.EXPO_PUBLIC_RC_API_KEY ?? '', // set in .env; empty disables billing (dev)
    entitlement: 'pro',
    monthlyId: 'jobvoice_pro_monthly',
    annualId: 'jobvoice_pro_annual',
  },
  android: {
    package: 'com.example.jobvoice',
  },
};
