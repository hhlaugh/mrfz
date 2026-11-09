import { useEffect, useMemo, useRef, useState } from 'react';
import type { CombatLogEvent, GameState, PlayerId } from '../game/types';
import { CARD_BY_ID } from '../client/demoData';

interface LogViewProps {
  readonly history: readonly CombatLogEvent[];
  readonly state?: GameState;
}

type FilterCategory = 'all' | 'player_a' | 'player_b' | 'combat' | 'skills' | 'moves';

const MAX_RENDERED_EVENTS = 300;

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
    let primarySide: PlayerId | null = event.source_player_id ?? null;
    let targetSide: PlayerId | null = event.target_player_id ?? null;

    if (!primarySide && event.source_instance_id) {
      const info = instanceMap.get(event.source_instance_id);
      if (info) primarySide = info.owner;
    }
    if (!targetSide && event.target_instance_id) {
      const info = instanceMap.get(event.target_instance_id);
      if (info) targetSide = info.owner;
    }
    if (event.player_id) {
      if (!primarySide) primarySide = event.player_id;
      else if (!targetSide && event.player_id !== primarySide) targetSide = event.player_id;
    }

    // Fallback parsing from text if not resolved
    if (!primarySide) {
      if (event.detail.includes('玩家 A') || event.detail.includes('player_a')) primarySide = 'player_a';
      else if (event.detail.includes('玩家 B') || event.detail.includes('player_b')) primarySide = 'player_b';
    }
    if (!targetSide) {
      if (primarySide === 'player_a' && (event.detail.includes('对 玩家 B') || event.detail.includes('攻击 玩家 B') || event.detail.includes('击杀了 玩家 B') || event.detail.includes('目标为 玩家 B'))) {
        targetSide = 'player_b';
      } else if (primarySide === 'player_b' && (event.detail.includes('对 玩家 A') || event.detail.includes('攻击 玩家 A') || event.detail.includes('击杀了 玩家 A') || event.detail.includes('目标为 玩家 A'))) {
        targetSide = 'player_a';
      }
    }

    return { primarySide, targetSide };
  };

  // Filter out redundant routine turn-start SP ticks as requested by user
  const sanitizedHistory = useMemo(() => {
    return history.filter((event) => {
      if (
        event.type === 'sp_gained' &&
        (event.detail.includes('自然回复') ||
          event.detail.includes('回合开始固定') ||
          event.detail.includes('回合固定') ||
          event.detail.includes('回合开始自然回复'))
      ) {
        return false;
      }
      return true;
    });
  }, [history]);

  // Filter events based on active category
  const filteredEvents = useMemo(() => {
    return sanitizedHistory.filter((event) => {
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
          'skill_activated',
          'reaction_triggered',
          'effect_triggered',
          'healed',
          'status_applied',
          'status_expired',
          'sp_spent',
          'sp_gained',
        ].includes(event.type);
      }
      if (filter === 'moves') {
        return ['unit_deployed', 'unit_withdrawn'].includes(event.type);
      }
      return true;
    });
  }, [sanitizedHistory, filter, instanceMap]);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [filteredEvents.length, autoScroll]);

  const visibleEvents =
    filteredEvents.length > MAX_RENDERED_EVENTS
      ? filteredEvents.slice(filteredEvents.length - MAX_RENDERED_EVENTS)
      : filteredEvents;

  // Get semantic badge for event type
  const getEventBadge = (event: CombatLogEvent) => {
    switch (event.type) {
      case 'damage_resolved':
        return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-950/70 text-rose-300 border border-rose-600/40 shrink-0">💥 伤害</span>;
      case 'unit_defeated':
        return <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-red-950/90 text-red-200 border border-red-500/60 shadow-sm shrink-0">💀 击杀</span>;
      case 'base_damaged':
        return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-950/80 text-amber-300 border border-amber-600/50 shrink-0">🏰 基地</span>;
      case 'skill_activated':
        return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-950/70 text-cyan-300 border border-cyan-500/40 shrink-0">⚡ 技能</span>;
      case 'reaction_triggered':
        return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-950/70 text-purple-300 border border-purple-500/40 shrink-0">🛡️ 反应</span>;
      case 'effect_triggered':
        return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-500/40 shrink-0">✨ 效果</span>;
      case 'unit_withdrawn':
        return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-500/40 shrink-0">🏃 撤离</span>;
      case 'unit_deployed':
        return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-950/70 text-blue-300 border border-blue-500/40 shrink-0">📍 部署</span>;
      case 'healed':
        return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-500/40 shrink-0">💚 治疗</span>;
      case 'shield_absorbed':
        return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-500/40 shrink-0">🛡️ 护盾</span>;
      case 'attack_declared':
        return <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-600/40 shrink-0">⚔️ 攻击</span>;
      case 'target_selected':
        return <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/40 shrink-0">🎯 锁定</span>;
      default:
        return <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/40 shrink-0">战报</span>;
    }
  };

  // Rich rendering of detail text
  const renderDetail = (event: CombatLogEvent) => {
    const detail = event.detail
      .replace(/player_a/g, '玩家 A')
      .replace(/player_b/g, '玩家 B');

    // Tokenizer matching brackets, factions, damage, kills, skills, retreat, lanes
    const regex = /(玩家 A|玩家 B|\[(左路|中路|右路)·(前排|后排)\]|【[^】]+】|击杀了|造成 \d+ 点(?: HP)?(?:技能)?伤害|造成 \d+ 点基本分伤害|护盾吸收了 \d+ 点伤害|（护盾吸收 \d+ 点）|主动撤离战场|部署了|直击 玩家 [AB] 基地|攻击 玩家 [AB] 基地|阵亡并进入弃牌堆|阵亡退场|获得 \d+ 点部署费用|获得 \d+ SP|消耗 \d+ SP|治疗 [^ ]+ \d+ 点 HP|为【[^】]+】治疗 \d+ 点 HP|减免 \d+ 点受击伤害|眩晕|冻结|落地|减速)/g;

    const parts: string[] = [];
    let lastIdx = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(detail)) !== null) {
      if (match.index > lastIdx) {
        parts.push(detail.substring(lastIdx, match.index));
      }
      parts.push(match[0]);
      lastIdx = regex.lastIndex;
    }
    if (lastIdx < detail.length) {
      parts.push(detail.substring(lastIdx));
    }

    // Keep context of preceding faction to color operators correctly
    let lastFactionContext: PlayerId | null = event.source_player_id ?? null;

    return (
      <span className="log-text leading-relaxed">
        {parts.map((token, i) => {
          if (!token) return null;

          if (token === '玩家 A') {
            lastFactionContext = 'player_a';
            return (
              <span
                key={i}
                className="font-bold px-1.5 py-0.5 rounded text-[11px] bg-sky-950/90 text-sky-300 border border-sky-500/50 mx-0.5 shadow-sm inline-flex items-center gap-0.5"
              >
                🔵 玩家 A
              </span>
            );
          }

          if (token === '玩家 B') {
            lastFactionContext = 'player_b';
            return (
              <span
                key={i}
                className="font-bold px-1.5 py-0.5 rounded text-[11px] bg-rose-950/90 text-rose-300 border border-rose-500/50 mx-0.5 shadow-sm inline-flex items-center gap-0.5"
              >
                🔴 玩家 B
              </span>
            );
          }

          // Phalanx / Lane position badge like [中路·前排]
          if (token.startsWith('[') && token.endsWith(']') && token.includes('·')) {
            return (
              <span
                key={i}
                className="font-mono text-[10px] font-medium px-1 py-0.5 rounded bg-[#1c2230] text-amber-200/90 border border-slate-600/40 mx-0.5"
              >
                {token}
              </span>
            );
          }

          // Bracketed operator or skill name like 【能天使】 or 【受击减伤反应】
          if (token.startsWith('【') && token.endsWith('】')) {
            const inner = token.slice(1, -1);

            // Is this a known skill / effect name?
            const isSkillOrPassive = [
              '受击减伤反应',
              '战场急救',
              '防御整备',
              '狙击支援',
              '自然震慑',
              '战术控场',
              '战术调度',
              '主动技能',
              '击杀回复',
            ].includes(inner) || inner.includes('技能') || inner.includes('反应') || inner.includes('特性');

            if (isSkillOrPassive) {
              return (
                <span
                  key={i}
                  className="font-bold px-1.5 py-0.5 rounded text-[11px] bg-amber-950/50 text-amber-300 border border-amber-500/40 mx-0.5"
                >
                  ⚡【{inner}】
                </span>
              );
            }

            // Otherwise, it's an operator name! Determine side
            let opSide: PlayerId | null = null;
            for (const info of instanceMap.values()) {
              if (info.name === inner) {
                opSide = info.owner;
                break;
              }
            }
            if (!opSide) {
              opSide = lastFactionContext;
            }

            return (
              <span
                key={i}
                className={`font-bold px-1.5 py-0.5 rounded text-[11px] mx-0.5 transition ${
                  opSide === 'player_a'
                    ? 'bg-sky-950/80 text-sky-200 border border-sky-400/50 shadow-sm'
                    : opSide === 'player_b'
                    ? 'bg-rose-950/80 text-rose-200 border border-rose-400/50 shadow-sm'
                    : 'bg-slate-800 text-slate-200 border border-slate-600'
                }`}
              >
                【{inner}】
              </span>
            );
          }

          // Kill action
          if (token === '击杀了') {
            return (
              <span
                key={i}
                className="font-black px-1.5 py-0.5 rounded text-[11px] bg-red-950 text-red-300 border border-red-500/80 shadow-md mx-1"
              >
                💀 击杀了
              </span>
            );
          }

          // Damage
          if (token.includes('点') && (token.includes('伤害') || token.includes('基本分伤害'))) {
            return (
              <span
                key={i}
                className="font-bold text-rose-400 bg-rose-950/50 px-1.5 py-0.5 rounded border border-rose-500/40 mx-0.5"
              >
                💥 {token}
              </span>
            );
          }

          // Retreat
          if (token === '主动撤离战场') {
            return (
              <span
                key={i}
                className="font-bold text-emerald-300 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/40 mx-0.5"
              >
                🏃 主动撤离战场
              </span>
            );
          }

          // Deploy
          if (token === '部署了') {
            return (
              <span
                key={i}
                className="font-bold text-blue-300 bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-500/40 mx-0.5"
              >
                📍 部署了
              </span>
            );
          }

          // Shield absorbed
          if (token.includes('护盾吸收')) {
            return (
              <span
                key={i}
                className="font-bold text-amber-300 bg-amber-950/50 px-1.5 py-0.5 rounded border border-amber-500/30 mx-0.5"
              >
                🛡️ {token}
              </span>
            );
          }

          // Heal
          if (token.includes('治疗')) {
            return (
              <span
                key={i}
                className="font-bold text-emerald-300 bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-500/40 mx-0.5"
              >
                💚 {token}
              </span>
            );
          }

          // Status effects
          if (['眩晕', '冻结', '落地', '减速'].includes(token)) {
            const icon = token === '冻结' ? '❄️' : token === '眩晕' ? '💫' : token === '落地' ? '⚓' : '⏳';
            return (
              <span
                key={i}
                className="font-bold text-amber-200 bg-amber-900/60 px-1.5 py-0.5 rounded text-[11px] border border-amber-500/40 mx-0.5"
              >
                {icon} {token}
              </span>
            );
          }

          // Defeat / Discard
          if (token.includes('阵亡并进入弃牌堆') || token.includes('阵亡退场')) {
            return (
              <span
                key={i}
                className="font-bold text-rose-400 line-through bg-rose-950/60 px-1 py-0.5 rounded mx-0.5"
              >
                💀 {token}
              </span>
            );
          }

          // Cost / SP gains
          if (token.includes('点部署费用') || token.includes('SP')) {
            return (
              <span
                key={i}
                className="font-bold text-cyan-300 bg-cyan-950/50 px-1.5 py-0.5 rounded border border-cyan-500/30 mx-0.5"
              >
                ⚡ {token}
              </span>
            );
          }

          return <span key={i}>{token}</span>;
        })}
      </span>
    );
  };

  return (
    <div className="log-container flex flex-col h-full bg-[#11151e] rounded-lg border border-[#232b3b] overflow-hidden text-xs shadow-inner">
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
            全部 ({sanitizedHistory.length})
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
                ? 'bg-amber-950/70 text-amber-300 font-bold border border-amber-600/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            onClick={() => setFilter('combat')}
          >
            ⚔️ 战斗
          </button>
          <button
            className={`px-1.5 py-0.5 rounded cursor-pointer transition ${
              filter === 'skills'
                ? 'bg-cyan-950/70 text-cyan-300 font-bold border border-cyan-600/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            onClick={() => setFilter('skills')}
          >
            ⚡ 技能
          </button>
          <button
            className={`px-1.5 py-0.5 rounded cursor-pointer transition ${
              filter === 'moves'
                ? 'bg-emerald-950/70 text-emerald-300 font-bold border border-emerald-600/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            onClick={() => setFilter('moves')}
          >
            🏃 调度/撤离
          </button>
        </div>

        <button
          className={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer transition shrink-0 ${
            autoScroll ? 'text-cyan-400 bg-cyan-950/60 border border-cyan-500/40' : 'text-slate-500 hover:text-slate-300'
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
              className={`log-line flex items-start gap-1.5 p-1.5 rounded transition text-[11px] leading-relaxed border ${
                event.type === 'unit_defeated'
                  ? 'bg-red-950/30 border-red-700/50 shadow-sm'
                  : event.type === 'damage_resolved'
                  ? 'bg-rose-950/20 border-rose-900/40'
                  : event.type === 'skill_activated' || event.type === 'reaction_triggered'
                  ? 'bg-purple-950/20 border-purple-900/40'
                  : event.type === 'unit_withdrawn'
                  ? 'bg-emerald-950/20 border-emerald-900/40'
                  : primarySide === 'player_a'
                  ? 'bg-sky-950/15 border-sky-900/35'
                  : primarySide === 'player_b'
                  ? 'bg-rose-950/15 border-rose-900/35'
                  : 'bg-[#151924] border-[#222b3b]'
              }`}
            >
              {/* Sequence badge */}
              <span className="font-mono text-[9px] text-slate-500 w-5 shrink-0 pt-0.5">
                #{event.sequence + 1}
              </span>

              {/* Event Type Badge */}
              {getEventBadge(event)}

              {/* Faction / Side Badge */}
              {primarySide ? (
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                    primarySide === 'player_a'
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/50'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/50'
                  }`}
                >
                  {primarySide === 'player_a' ? 'A方' : 'B方'}
                  {targetSide && targetSide !== primarySide
                    ? ` ➔ ${targetSide === 'player_a' ? 'A方' : 'B方'}`
                    : ''}
                </span>
              ) : null}

              {/* Detail message with phalanx and entity highlighting */}
              <div className="flex-1 break-words">{renderDetail(event)}</div>
            </div>
          );
        })}

        {filteredEvents.length === 0 && (
          <div className="log-empty text-slate-500 text-center py-8 text-xs">
            {sanitizedHistory.length === 0 ? '暂无战斗日志，等待回合战斗结算。' : '当前筛选分类下无日志记录。'}
          </div>
        )}
      </div>
    </div>
  );
}
