import { describe, expect, it } from 'vitest';
import { loadDemoData } from '../data/load-demo-data';
import { LocalGameController } from '../client/localGameController';
import { BotPlayer, botMulliganChoice } from './botPlayer';
import type { GameAction, GameState, PlayerId } from '../game/types';

const loaded = loadDemoData();
if (loaded.issues.length > 0) throw new Error(`Demo 数据无效：${JSON.stringify(loaded.issues)}`);
const [deckA, deckB] = loaded.decks;
if (!deckA || !deckB) throw new Error('必须加载两套 Demo 牌组。');

const MATCHES_PER_SEED = 2; // 同一 seed 各跑一次常规座次与互换座次（A/B 互换先手）

interface MatchRecord {
  readonly seed: number;
  readonly swapped: boolean;
  readonly winnerDeck: string;
  readonly turns: number;
  readonly deploys: number;
  readonly tactics: number;
  readonly rapidWithdrawals: number;
  readonly normalWithdrawals: number;
  readonly skills: number;
  readonly actions: number;
  readonly watchdogStops: number;
  readonly repetitionStops: number;
}

function lcg(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function runBotMatch(seed: number, swapped: boolean): MatchRecord {
  const deckForA = swapped ? deckB : deckA;
  const deckForB = swapped ? deckA : deckB;
  const controller = LocalGameController.create({ decks: { player_a: deckForA, player_b: deckForB }, cards: loaded.validCards, seed });
  const bots: Record<PlayerId, BotPlayer> = {
    player_a: new BotPlayer({ player: 'player_a', rng: lcg(seed * 2 + 1) }),
    player_b: new BotPlayer({ player: 'player_b', rng: lcg(seed * 2 + 2) }),
  };
  let state: GameState = controller.getSnapshot().state;
  for (const playerId of ['player_a', 'player_b'] as const) {
    const mulligan = controller.submitMulligan(playerId, botMulliganChoice(state, playerId));
    if (!mulligan.ok) throw new Error(`机器人换牌被拒绝：${mulligan.reason}`);
    state = controller.getSnapshot().state;
  }

  const counts = { deploys: 0, tactics: 0, rapidWithdrawals: 0, normalWithdrawals: 0, skills: 0, actions: 0 };
  let guard = 0;
  while (state.phase !== 'finished') {
    guard += 1;
    if (guard > 30_000) throw new Error(`seed=${seed} swapped=${swapped} 超过保护上限`);
    const actor = state.active_player_id;
    const action: GameAction = bots[actor].decide(state);
    const result = controller.dispatch(actor, action);
    if (!result.ok) throw new Error(`机器人动作被引擎拒绝：${result.reason} action=${JSON.stringify(action)}`);
    counts.actions += 1;
    if (action.type === 'deploy_operator') counts.deploys += 1;
    if (action.type === 'activate_skill') counts.skills += 1;
    if (action.type === 'withdraw_operator') counts.normalWithdrawals += 1;
    if (action.type === 'play_card') {
      const instance = state.card_instances[action.card_instance_id];
      const definition = instance ? state.card_definitions[instance.card_id] : undefined;
      if (definition?.effect_json.actions?.[0]?.type === 'withdraw_operator') counts.rapidWithdrawals += 1;
      else counts.tactics += 1;
    }
    state = controller.getSnapshot().state;
  }
  if (state.winner === null) throw new Error('对局结束但没有胜负。');
  const telemetry = bots.player_a.getTelemetry();
  const telemetryB = bots.player_b.getTelemetry();
  return {
    seed,
    swapped,
    winnerDeck: state.winner === 'draw' ? 'draw' : state.winner === 'player_a' ? deckForA.deck_id : deckForB.deck_id,
    turns: state.turn_number,
    ...counts,
    watchdogStops: telemetry.watchdogStops + telemetryB.watchdogStops,
    repetitionStops: telemetry.repetitionStops + telemetryB.repetitionStops,
  };
}

describe('bot vs bot simulation (A/B decks with swapped seats)', () => {
  it('plays 120 matches cleanly and reports win rate / turns / withdrawal / skill stats', { timeout: 300_000 }, () => {
    const records: MatchRecord[] = [];
    const startedAt = Date.now();
    for (let seed = 1; seed <= 60; seed += 1) {
      for (let swappedIndex = 0; swappedIndex < MATCHES_PER_SEED; swappedIndex += 1) {
        records.push(runBotMatch(seed, swappedIndex === 1));
      }
    }
    const elapsedMs = Date.now() - startedAt;

    const total = records.length;
    const deckAWins = records.filter((record) => record.winnerDeck === 'DEMO-DECK-A').length;
    const deckBWins = records.filter((record) => record.winnerDeck === 'DEMO-DECK-B').length;
    const draws = records.filter((record) => record.winnerDeck === 'draw').length;
    const avg = (selector: (record: MatchRecord) => number) => records.reduce((sum, record) => sum + selector(record), 0) / total;
    const summary = {
      matches: total,
      elapsedMs,
      msPerMatch: Math.round(elapsedMs / total),
      deckAWinRate: Number((deckAWins / total).toFixed(3)),
      deckBWinRate: Number((deckBWins / total).toFixed(3)),
      draws,
      avgTurns: Number(avg((record) => record.turns).toFixed(1)),
      maxTurns: Math.max(...records.map((record) => record.turns)),
      avgActions: Number(avg((record) => record.actions).toFixed(1)),
      deploysPerMatch: Number(avg((record) => record.deploys).toFixed(1)),
      tacticsPerMatch: Number(avg((record) => record.tactics).toFixed(2)),
      normalWithdrawalsPerMatch: Number(avg((record) => record.normalWithdrawals).toFixed(2)),
      rapidWithdrawalsPerMatch: Number(avg((record) => record.rapidWithdrawals).toFixed(2)),
      withdrawalRatePerMatch: Number(avg((record) => record.normalWithdrawals + record.rapidWithdrawals).toFixed(2)),
      skillsPerMatch: Number(avg((record) => record.skills).toFixed(2)),
      watchdogStopsTotal: records.reduce((sum, record) => sum + record.watchdogStops, 0),
      repetitionStopsTotal: records.reduce((sum, record) => sum + record.repetitionStops, 0),
    };
    console.log('bot vs bot 模拟统计（120 局，A/B 座次互换）', JSON.stringify(summary, null, 2));

    expect(total).toBe(120);
    expect(deckAWins + deckBWins + draws).toBe(total);
    expect(summary.maxTurns).toBeLessThan(299); // 没有任何一局撞上模拟保护上限
    expect(summary.watchdogStopsTotal).toBeLessThanOrEqual(Math.ceil(total * 0.05));
    expect(summary.repetitionStopsTotal).toBeLessThanOrEqual(Math.ceil(total * 0.05));
  });
});
