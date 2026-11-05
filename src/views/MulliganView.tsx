import { useState } from 'react';
import type { ActionResult } from '../client/localGameController';
import { PLAYER_LABEL } from '../client/demoData';
import { CardView } from '../components/CardView';
import type { CardInstanceId, GameState, PlayerId } from '../game/types';

interface MulliganViewProps {
  readonly state: GameState;
  readonly playerId: PlayerId;
  readonly deckName: string;
  readonly waitingForOpponent?: boolean;
  readonly onConfirm: (selected: readonly CardInstanceId[]) => ActionResult | Promise<ActionResult>;
}

export function MulliganView({ state, playerId, deckName, waitingForOpponent = false, onConfirm }: MulliganViewProps) {
  const [selected, setSelected] = useState<ReadonlySet<CardInstanceId>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const hand = state.players[playerId].hand;

  const toggle = (id: CardInstanceId) => {
    if (submitting) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < hand.length) next.add(id);
      return next;
    });
  };

  const confirm = async () => {
    setSubmitting(true);
    try {
      const result = await onConfirm([...selected]);
      if (!result.ok) {
        setSubmitting(false);
        setError(result.reason ?? '换牌失败');
      }
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : '换牌异常');
    }
  };

  if (waitingForOpponent || (submitting && !error)) {
    return (
      <div className="mulligan">
        <h1>起手换牌 · {PLAYER_LABEL[playerId]}</h1>
        <p className="note">牌组：{deckName}</p>
        <div className="status-box">⏳ 已确认换牌，正在等待对手完成换牌并同步状态…</div>
      </div>
    );
  }

  return (
    <div className="mulligan">
      <h1>起手换牌 · {PLAYER_LABEL[playerId]}</h1>
      <p className="note">
        牌组：{deckName} · 基本分 20 · 点击选择要换掉的牌（可全不选），换掉后等量补牌、原牌洗回牌库，不触发疲劳。
      </p>
      <div className="hand-cards">
        {hand.map((id) => (
          <CardView key={id} state={state} instanceId={id} selectable checked={selected.has(id)} interactive onClick={() => toggle(id)} />
        ))}
      </div>
      {error && <div className="error-toast">{error}</div>}
      <div className="mulligan-actions">
        <button className="btn primary big" onClick={confirm}>
          确认（换 {selected.size} 张）
        </button>
      </div>
    </div>
  );
}
