import { useEffect, useRef } from 'react';
import type { CombatLogEvent } from '../game/types';

const EVENT_CLASS: Readonly<Record<string, string>> = {
  attack_declared: 'log-attack',
  target_selected: 'log-attack',
  reaction_triggered: 'log-reaction',
  sp_spent: 'log-sp',
  damage_resolved: 'log-damage',
  shield_absorbed: 'log-shield',
  base_damaged: 'log-base',
  unit_defeated: 'log-death',
  sp_gained: 'log-sp',
  status_expired: 'log-status',
  healed: 'log-heal',
  trigger_limit: 'log-limit',
};

const MAX_RENDERED_EVENTS = 200;

export function LogView({ history }: { history: readonly CombatLogEvent[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const element = containerRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [history.length]);
  const visible = history.length > MAX_RENDERED_EVENTS ? history.slice(history.length - MAX_RENDERED_EVENTS) : history;
  return (
    <div className="log-view" ref={containerRef}>
      {history.length > MAX_RENDERED_EVENTS && <div className="log-omitted">（仅显示最近 {MAX_RENDERED_EVENTS} 条，共 {history.length} 条）</div>}
      {visible.map((event) => (
        <div key={event.sequence} className={`log-line ${EVENT_CLASS[event.type] ?? ''}`}>
          {event.detail}
        </div>
      ))}
      {history.length === 0 && <div className="log-empty">暂无日志。</div>}
    </div>
  );
}
