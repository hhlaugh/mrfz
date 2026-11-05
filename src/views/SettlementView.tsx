import type { LocalGameSetup, LocalGameSnapshot } from '../client/localGameController';
import { PLAYER_LABEL } from '../client/demoData';

interface SettlementViewProps {
  readonly snapshot: LocalGameSnapshot;
  readonly setup: LocalGameSetup;
  readonly modeLabel?: string;
  readonly onRestart: () => void;
  readonly onExit: () => void;
}

export function SettlementView({ snapshot, setup, modeLabel, onRestart, onExit }: SettlementViewProps) {
  const state = snapshot.state;
  const winnerText =
    state.winner === 'draw' ? '平局' : state.winner ? `${PLAYER_LABEL[state.winner]} 获胜` : '未分胜负';
  return (
    <div className="settlement">
      <h1>对局结束</h1>
      <div className="settlement-winner">{winnerText}</div>
      {modeLabel && <p className="subtitle">{modeLabel}</p>}
      <ul className="settlement-list">
        <li>回合数：{state.turn_number}</li>
        <li>
          玩家 A 基本分：{state.players.player_a.base_points}（行动 {state.players.player_a.turns_taken} 回合）
        </li>
        <li>
          玩家 B 基本分：{state.players.player_b.base_points}（行动 {state.players.player_b.turns_taken} 回合）
        </li>
        <li>
          牌组：{setup.decks.player_a.deck_name_zh} vs {setup.decks.player_b.deck_name_zh}
        </li>
        <li>随机种子：{setup.seed}（同种子可复现本局）</li>
        <li>日志事件：{snapshot.logHistory.length} 条</li>
      </ul>
      <div className="settlement-actions">
        <button className="btn primary big" onClick={onRestart}>
          再来一局（新种子）
        </button>
        <button className="btn" onClick={onExit}>
          返回标题
        </button>
      </div>
    </div>
  );
}
