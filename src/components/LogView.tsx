import { useEffect, useMemo, useRef, useState } from 'react';
import type { CombatLogEvent, GameState, PlayerId } from '../game/types';
import { CARD_BY_ID } from '../client/demoData';

interface LogViewProps {
  readonly history: readonly CombatLogEvent[];
  readonly state?: GameState;
}

type FilterCategory = 'all' | 'player_a' | 'player_b' | 'combat' | 'skills';

const MAX_RENDERED_EVENTS = 250;

export function LogView({ history, state }: LogViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [filter, setFilter] = useState<FilterCategory>('all');
  const [autoScroll, setAutoScroll] = useState(true);

  // Map instance ID to owner player and card name
  const instanceMap = useMemo(() => {
    const map = new Map<string, { owner: PlayerId; name: string }>();
    if (state?.card_instances) {
      for (const [id, inst] of Object.entries(state.card_instances)) {
        const def = state.card_definitions?.[inst.card_id] ?? CARD_BY_ID.get(inst.card_id);
        const name = def?.card_name_zh ?? inst.card_id;
        map.set(id, { owner: inst.owner_id, name });
      }
    }
    return map;
  }, [state]);

  // Determine which side(s) are involved in an event
  const getEventSides = (event: CombatLogEvent): { primarySide: PlayerId | null; targetSide: PlayerId | null } => {
    let primarySide: PlayerId | null = null;
    let targetSide: PlayerId | null = null;

    if (event.source_instance_id) {
      const info = instanceMap.get(event.source_instance_id);
      if (info) primarySide = info.owner;
    }
    if (event.target_instance_id) {
      const info = instanceMap.get(event.target_instance_id);
      if (info) targetSide = info.owner;
    }
    if (event.player_id) {
      if (!primarySide) primarySide = event.player_id;
      else if (!targetSide && event.player_id !== primarySide) targetSide = event.player_id;
    }

    // Fallback parsing from text
    if (!primarySide) {
      if (event.detail.includes('玩家 A') || event.detail.includes('player_a')) primarySide = 'player_a';
      else if (event.detail.includes('玩家 B') || event.detail.includes('player_b')) primarySide = 'player_b';
    }

    return { primarySide, targetSide };
  };

  // Filter events
  const filteredEvents = useMemo(() => {
    return history.filter((event) => {
      const { primarySide, targetSide } = getEventSides(event);

      if (filter === 'player_a') {
        return (
          primarySide === 'player_a' ||
          targetSide === 'player_a' ||
          event.detail.includes('玩家 A') ||
          event.detail.includes('player_a')
        );
      }
      if (filter === 'player_b') {
        return (
          primarySide === 'player_b' ||
          targetSide === 'player_b' ||
          event.detail.includes('玩家 B') ||
          event.detail.includes('player_b')
        );
      }
      if (filter === 'combat') {
        return [
          'attack_declared',
          'target_selected',
          'damage_resolved',
          'base_damaged',
          'shield_absorbed',
          'unit_defeated',
        ].includes(event.type);
      }
      if (filter === 'skills') {
        return [
          'sp_gained',
          'sp_spent',
          'reaction_triggered',
          'healed',
          'status_expired',
        ].includes(event.type);
      }
      return true;
    });
  }, [history, filter, instanceMap]);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [filteredEvents.length, autoScroll]);

  const visibleEvents =
    filteredEvents.length > MAX_RENDERED_EVENTS
      ? filteredEvents.slice(filteredEvents.length - MAX_RENDERED_EVENTS)
      : filteredEvents;

  // Rich rendering of detail text
  const renderDetail = (event: CombatLogEvent) => {
    const { primarySide, targetSide } = getEventSides(event);
    const detail = event.detail;

    // Normalizing player names in detail
    const cleanDetail = detail
      .replace(/player_a/g, '玩家 A')
      .replace(/player_b/g, '玩家 B');

    // Split and highlight key terms
    // We match: [玩家 A], [玩家 B], damage numbers, heals, SP, shields, deaths, unit names
    const tokens = cleanDetail.split(
      /(玩家 A|玩家 B|造成 \d+ 点伤害|造成 \d+ 点 HP 伤害|\d+ 点 HP 伤害|\d+ 点伤害由护盾吸收|获得 \d+ SP|支付 \d+ 点反应技能费用|先支付反应技能费用|治疗 \d+ HP|发起普通攻击（\d+）|阵亡并进入弃牌堆|发动受击减伤反应|受到攻击|受到伤害|击杀|眩晕|冻结|落地|减速)/g,
    );

    return (
      <span className="log-text leading-tight">
        {tokens.map((token, i) => {
          if (!token) return null;

          if (token === '玩家 A') {
            return (
              <span
                key={i}
                className="font-bold px-1 py-0.5 rounded text-[11px] bg-sky-950/80 text-sky-300 border border-sky-500/40 mx-0.5"
              >
                玩家 A
              </span>
            );
          }
          if (token === '玩家 B') {
            return (
              <span
                key={i}
                className="font-bold px-1 py-0.5 rounded text-[11px] bg-rose-950/80 text-rose-300 border border-rose-500/40 mx-0.5"
              >
                玩家 B
              </span>
            );
          }
          if (token.includes('点 HP 伤害') || token.includes('点伤害') || token.includes('基本分造成')) {
            return (
              <span key={i} className="font-bold text-rose-400 bg-rose-950/30 px-1 rounded mx-0.5">
                💥 {token}
              </span>
            );
          }
          if (token.includes('护盾吸收')) {
            return (
              <span key={i} className="font-bold text-amber-300 bg-amber-950/30 px-1 rounded mx-0.5">
                🛡️ {token}
              </span>
            );
          }
          if (token.includes('获得') && token.includes('SP')) {
            return (
              <span key={i} className="font-bold text-cyan-300 bg-cyan-950/40 px-1 rounded mx-0.5">
                ⚡ {token}
              </span>
            );
          }
          if (token.includes('支付') && token.includes('费用')) {
            return (
              <span key={i} className="font-bold text-violet-300 bg-violet-950/40 px-1 rounded mx-0.5">
                ⚡ {token}
              </span>
            );
          }
          if (token.includes('治疗')) {
            return (
              <span key={i} className="font-bold text-emerald-400 bg-emerald-950/30 px-1 rounded mx-0.5">
                💚 {token}
              </span>
            );
          }
          if (token.includes('发起普通攻击')) {
            return (
              <span key={i} className="font-semibold text-slate-200">
                ⚔️ {token}
              </span>
            );
          }
          if (token.includes('阵亡')) {
            return (
              <span key={i} className="font-bold text-rose-500 line-through bg-rose-950/40 px-1 rounded mx-0.5">
                💀 {token}
              </span>
            );
          }
          if (token.includes('受击减伤反应')) {
            return (
              <span key={i} className="font-bold text-purple-300 bg-purple-950/40 px-1 rounded mx-0.5">
                🛡️ {token}
              </span>
            );
          }
          if (['眩晕', '冻结', '落地', '减速'].includes(token)) {
            return (
              <span key={i} className="font-bold text-amber-300 bg-amber-900/40 px-1 rounded text-[11px] mx-0.5">
                {token === '冻结' ? '❄️' : token === '眩晕' ? '💫' : token === '落地' ? '⚓' : '⏳'} {token}
              </span>
            );
          }

          // Check if token matches a unit name in the instance map
          let unitOwner: PlayerId | null = null;
          for (const info of instanceMap.values()) {
            if (info.name === token.trim()) {
              unitOwner = info.owner;
              break;
            }
          }

          if (unitOwner) {
            return (
              <span
                key={i}
                className={`font-bold px-1 rounded text-[11px] mx-0.5 ${
                  unitOwner === 'player_a'
                    ? 'text-sky-300 bg-sky-950/60 border-b border-sky-400/50'
                    : 'text-rose-300 bg-rose-950/60 border-b border-rose-400/50'
                }`}
              >
                {token}
              </span>
            );
          }

          return <span key={i}>{token}</span>;
        })}
      </span>
    );
  };

  return (
    <div className="log-container flex flex-col h-full bg-[#11151e] rounded-lg border border-[#232b3b] overflow-hidden text-xs">
      {/* Log Header with Filter Tabs & Auto-Scroll Toggle */}
      <div className="flex items-center justify-between p-1.5 bg-[#171c27] border-b border-[#232b3b] gap-1 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto text-[11px]">
          <button
            className={`px-2 py-0.5 rounded font-medium cursor-pointer transition ${
              filter === 'all'
                ? 'bg-[#29354a] text-white font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            onClick={() => setFilter('all')}
          >
            全部 ({history.length})
          </button>
          <button
            className={`px-1.5 py-0.5 rounded font-bold cursor-pointer transition border ${
              filter === 'player_a'
                ? 'bg-sky-950 text-sky-300 border-sky-500'
                : 'text-sky-400/80 border-transparent hover:bg-sky-950/40'
            }`}
            onClick={() => setFilter('player_a')}
          >
            🔵 玩家 A
          </button>
          <button
            className={`px-1.5 py-0.5 rounded font-bold cursor-pointer transition border ${
              filter === 'player_b'
                ? 'bg-rose-950 text-rose-300 border-rose-500'
                : 'text-rose-400/80 border-transparent hover:bg-rose-950/40'
            }`}
            onClick={() => setFilter('player_b')}
          >
            🔴 玩家 B
          </button>
          <button
            className={`px-1.5 py-0.5 rounded cursor-pointer transition ${
              filter === 'combat'
                ? 'bg-amber-950/70 text-amber-300 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            onClick={() => setFilter('combat')}
          >
            ⚔️ 战斗
          </button>
          <button
            className={`px-1.5 py-0.5 rounded cursor-pointer transition ${
              filter === 'skills'
                ? 'bg-cyan-950/70 text-cyan-300 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            onClick={() => setFilter('skills')}
          >
            ⚡ 技能
          </button>
        </div>

        <button
          className={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer transition shrink-0 ${
            autoScroll ? 'text-cyan-400 bg-cyan-950/60' : 'text-slate-500 hover:text-slate-300'
          }`}
          onClick={() => setAutoScroll((v) => !v)}
          title="点击切换自动滚动到底部"
        >
          {autoScroll ? '⬇ 自动滚动' : '⏸ 暂停滚动'}
        </button>
      </div>

      {/* Log Events List */}
      <div
        className="log-view flex-1 overflow-y-auto p-2 flex flex-col gap-1.5 select-text"
        ref={containerRef}
        style={{ maxHeight: '68vh' }}
      >
        {filteredEvents.length > MAX_RENDERED_EVENTS && (
          <div className="log-omitted text-slate-500 text-[10px] text-center py-1">
            （仅显示最近 {MAX_RENDERED_EVENTS} 条记录，共 {filteredEvents.length} 条）
          </div>
        )}

        {visibleEvents.map((event) => {
          const { primarySide, targetSide } = getEventSides(event);

          return (
            <div
              key={event.sequence}
              className={`log-line flex items-start gap-1.5 p-1 rounded transition text-[11px] leading-relaxed border ${
                primarySide === 'player_a'
                  ? 'bg-sky-950/20 border-sky-900/40'
                  : primarySide === 'player_b'
                  ? 'bg-rose-950/20 border-rose-900/40'
                  : 'bg-[#151924] border-[#222b3b]'
              }`}
            >
              {/* Sequence badge */}
              <span className="font-mono text-[9px] text-slate-500 w-5 shrink-0 pt-0.5">
                #{event.sequence + 1}
              </span>

              {/* Side tag */}
              {primarySide ? (
                <span
                  className={`text-[9px] font-bold px-1 py-0.2 rounded shrink-0 ${
                    primarySide === 'player_a'
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  }`}
                >
                  {primarySide === 'player_a' ? 'A方' : 'B方'}
                  {targetSide && targetSide !== primarySide
                    ? ` ➔ ${targetSide === 'player_a' ? 'A方' : 'B方'}`
                    : ''}
                </span>
              ) : (
                <span className="text-[9px] font-medium text-slate-500 bg-slate-800/60 px-1 py-0.2 rounded shrink-0">
                  战报
                </span>
              )}

              {/* Detail message */}
              <div className="flex-1">{renderDetail(event)}</div>
            </div>
          );
        })}

        {filteredEvents.length === 0 && (
          <div className="log-empty text-slate-500 text-center py-8 text-xs">
            {history.length === 0 ? '暂无战斗日志，等待回合战斗结算。' : '当前筛选分类下无日志记录。'}
          </div>
        )}
      </div>
    </div>
  );
}
