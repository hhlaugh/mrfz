export const MAX_TRIGGER_DEPTH = 32;

export interface TriggerQueueEntry<T> {
  readonly payload: T;
  readonly depth: number;
}

export interface TriggerQueueResult {
  readonly processed: number;
  readonly exceededDepthLimit: boolean;
}

/** Deterministic priority queue shared by automatic event resolution and cycle-safety tests. */
export function drainTriggerQueue<T>(
  initial: readonly TriggerQueueEntry<T>[],
  process: (payload: T, depth: number) => readonly T[],
  priority: (payload: T) => number,
  stableKey: (payload: T) => string,
  maxDepth = MAX_TRIGGER_DEPTH,
): TriggerQueueResult {
  const queue = [...initial];
  let processed = 0;
  let exceededDepthLimit = false;
  while (queue.length > 0) {
    queue.sort((a, b) => priority(b.payload) - priority(a.payload) || stableKey(a.payload).localeCompare(stableKey(b.payload)));
    const entry = queue.shift()!;
    if (entry.depth >= maxDepth) {
      exceededDepthLimit = true;
      continue;
    }
    processed += 1;
    for (const payload of process(entry.payload, entry.depth)) queue.push({ payload, depth: entry.depth + 1 });
  }
  return { processed, exceededDepthLimit };
}
