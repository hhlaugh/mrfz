import React, { useState } from 'react';
import type { ActionResult } from '../client/localGameController';
import { PLAYER_LABEL } from '../client/demoData';
import { CardView } from '../components/CardView';
import type { CardInstanceId, GameState, PlayerId } from '../game/types';
import { Panel } from '../components/ui/Panel';
import { Button } from '../components/ui/Button';

interface MulliganViewProps {
  readonly state: GameState;
  readonly playerId: PlayerId;
  readonly deckName: string;
  readonly waitingForOpponent?: boolean;
  readonly onConfirm: (selected: readonly CardInstanceId[]) => ActionResult | Promise<ActionResult>;
}

export function MulliganView({
  state,
  playerId,
  deckName,
  waitingForOpponent = false,
  onConfirm,
}: MulliganViewProps) {
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
      <div className="min-h-screen w-full bg-[#171a1d] text-[#e8e9e6] flex flex-col items-center justify-center p-4 select-none">
        <Panel variant="raised" cornerCut="lg" scanlines className="max-w-md p-6 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
          <h2 className="text-base font-bold text-white uppercase tracking-wider">
            起手调度已锁定 · {PLAYER_LABEL[playerId]}
          </h2>
          <p className="text-xs text-slate-400 font-mono">
            编制：{deckName} · 正在等待对手完成调度同步…
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#171a1d] text-[#e8e9e6] flex flex-col items-center justify-center p-4 sm:p-6 select-none">
      <Panel
        variant="raised"
        cornerCut="lg"
        scanlines
        className="w-full max-w-5xl border border-[#4a555b] shadow-2xl flex flex-col"
      >
        {/* Terminal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#14171a] border-b border-[#363f45]">
          <div className="flex items-center gap-3">
            <span className="w-2 h-5 bg-[#e5a52b]" />
            <div>
              <h2 className="text-base font-black tracking-widest text-slate-100 uppercase m-0 leading-tight">
                战术调度阶段 // MULLIGAN PHASE
              </h2>
              <span className="text-[10px] font-mono text-slate-400 tracking-wider">
                {PLAYER_LABEL[playerId]} · 当前编制: {deckName}
              </span>
            </div>
          </div>
          <span className="text-xs font-mono text-amber-300 bg-amber-950/60 px-2.5 py-1 border border-amber-500/40">
            已选择换出: {selected.size} / {hand.length} 张
          </span>
        </div>

        {/* Instructions banner */}
        <div className="px-5 py-2.5 bg-[#1a2026] border-b border-[#2e3740] text-xs text-slate-300 flex items-center justify-between">
          <span>点击勾选想要换掉的卡牌（可全不选）。换出卡牌将洗回牌库并等量抽取新手牌。</span>
          <span className="text-slate-400 text-[10px] font-mono">STEP: 01_DEPLOY_PREP</span>
        </div>

        {/* Hand Cards Selection Grid */}
        <div className="p-6 bg-gradient-to-b from-[#1b2025] to-[#14181c] flex items-center justify-center">
          <div className="flex flex-wrap gap-4 justify-center items-center max-w-4xl">
            {hand.map((id) => (
              <CardView
                key={id}
                state={state}
                instanceId={id}
                selectable
                checked={selected.has(id)}
                interactive
                onClick={() => toggle(id)}
              />
            ))}
          </div>
        </div>

        {/* Error Toast */}
        {error && (
          <div className="mx-6 mb-3 p-2.5 bg-rose-950/80 border border-rose-500 text-rose-300 text-xs text-center">
            {error}
          </div>
        )}

        {/* Bottom Actions */}
        <div className="px-5 py-3.5 bg-[#121518] border-t border-[#313b43] flex items-center justify-between">
          <div className="text-[11px] text-slate-400 font-mono">
            {selected.size === 0 ? '保持当前起手手牌不作替换' : `替换选中的 ${selected.size} 张卡牌`}
          </div>
          <Button
            variant="primary"
            size="lg"
            cornerCut
            onClick={confirm}
            loading={submitting}
            className="font-bold px-8 shadow-lg"
          >
            确认调度（换 {selected.size} 张） ▶
          </Button>
        </div>
      </Panel>
    </div>
  );
}
