import { describe, expect, it } from 'vitest';
import { drainTriggerQueue, MAX_TRIGGER_DEPTH } from './trigger-queue';

describe('automatic trigger queue', () => {
  it('processes higher priority first and uses stable identifiers for ties', () => {
    const seen: string[] = [];
    const result = drainTriggerQueue(
      [{ payload: { id: 'z', priority: 2 }, depth: 0 }, { payload: { id: 'b', priority: 5 }, depth: 0 }, { payload: { id: 'a', priority: 5 }, depth: 0 }],
      payload => { seen.push(payload.id); return []; },
      payload => payload.priority,
      payload => payload.id,
    );
    expect(seen).toEqual(['a', 'b', 'z']);
    expect(result).toEqual({ processed: 3, exceededDepthLimit: false });
  });

  it('cuts a recursively re-enqueuing effect chain at depth 32', () => {
    const result = drainTriggerQueue(
      [{ payload: 'repeat', depth: 0 }],
      payload => [payload],
      () => 0,
      payload => payload,
    );
    expect(MAX_TRIGGER_DEPTH).toBe(32);
    expect(result.processed).toBe(32);
    expect(result.exceededDepthLimit).toBe(true);
  });
});
