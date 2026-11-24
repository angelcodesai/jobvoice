// Last-write-wins on ISO-8601 strings (lexicographic order == chronological).
export type MergeDecision = 'keepLocal' | 'takeRemote';

export function resolve(
  localUpdatedAt: string | undefined,
  remoteUpdatedAt: string | undefined
): MergeDecision {
  if (!remoteUpdatedAt) return 'keepLocal';
  if (!localUpdatedAt) return 'takeRemote';
  return remoteUpdatedAt > localUpdatedAt ? 'takeRemote' : 'keepLocal';
}
