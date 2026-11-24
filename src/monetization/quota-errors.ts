export interface QuotaError {
  error: string;
  retryable: false;
  needsUpgrade: boolean;
}

/** Maps an extract-job 429 body to a pipeline error, or null if not a quota response. */
export function mapQuotaError(status: number, bodyText: string): QuotaError | null {
  if (status !== 429) return null;
  try {
    const body = JSON.parse(bodyText);
    if (body?.code === 'TRIAL_LIMIT' || body?.code === 'MONTHLY_LIMIT') {
      return {
        error: String(body.message ?? 'Usage limit reached.'),
        retryable: false,
        needsUpgrade: body.code === 'TRIAL_LIMIT',
      };
    }
  } catch {
    // not a JSON quota body — fall through to null
  }
  return null;
}
