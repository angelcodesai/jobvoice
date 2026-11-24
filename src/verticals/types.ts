// Pure data only — this module is imported by app.config.ts (Node) and app code (RN).
export interface VerticalConfig {
  key: string;
  appName: string;
  tagline: string;
  primaryColor: string;
  recordHint: string;
  terminology: {
    job: string;
    jobPlural: string;
    quote: string;
    client: string;
    clientPlural: string;
    newNoteCta: string;
    emptyState: string;
  };
  documents: {
    pdfTitlePrefix: string; // "Quote #"
    defaultTerms: string;
  };
  legal: {
    privacyUrl: string;
    termsUrl: string;
  };
  revenuecat: {
    apiKey: string; // RC public SDK key (safe to ship; set per vertical)
    entitlement: string; // 'pro'
    monthlyId: string;
    annualId: string;
  };
  android: {
    package: string;
  };
}
