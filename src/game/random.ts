export interface RandomStep {
  readonly value: number;
  readonly state: number;
}

/** Pure xorshift32 source. Keep the state in GameState so the same inputs replay identically. */
export type RandomSource = (state: number) => RandomStep;

export const seededRandomSource: RandomSource = (state) => {
  let next = state >>> 0;
  if (next === 0) next = 0x6d2b79f5;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  const unsigned = next >>> 0;
  return { value: unsigned / 0x1_0000_0000, state: unsigned };
};

export function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed) || !Number.isInteger(seed)) throw new RangeError('seed 必须是有限整数。');
  const normalized = seed >>> 0;
  return normalized === 0 ? 0x6d2b79f5 : normalized;
}

export function shuffleDeck<T>(items: readonly T[], initialState: number, randomSource: RandomSource = seededRandomSource): { readonly deck: T[]; readonly randomState: number } {
  const deck = [...items];
  let randomState = normalizeSeed(initialState);
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const step = randomSource(randomState);
    if (!Number.isFinite(step.value) || step.value < 0 || step.value >= 1 || !Number.isInteger(step.state)) {
      throw new RangeError('randomSource 必须返回 [0, 1) 范围内的 value 和整数 state。');
    }
    randomState = normalizeSeed(step.state);
    const swapIndex = Math.floor(step.value * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return { deck, randomState };
}
