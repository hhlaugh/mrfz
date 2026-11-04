import type { GameState, PlayerId } from '../game/types';
import { PLAYER_LABEL } from '../client/demoData';
import { cardDefinitionOf } from './CardView';

interface PlayerBarProps {
  readonly state: GameState;
  readonly playerId: PlayerId;
  readonly isActive: boolean;
  readonly roleLabel?: string;
}

export function PlayerBar({ state, playerId, isActive, roleLabel }: PlayerBarProps) {
  const player = state.players[playerId];
  return (
    <div className={`player-bar${isActive ? ' active' : ''}${roleLabel?.includes('己方') ? ' player-bar-self' : ''}`}>
      <span className="player-name">
        {PLAYER_LABEL[playerId]}
        {roleLabel && <span className={`player-role-badge ${roleLabel.includes('己方') ? 'self' : 'opponent'}`}>{roleLabel}</span>}
        {isActive && <span className="active-mark"> ◀ 行动中</span>}
      </span>
      <span className="player-stat">基本分 <b>{player.base_points}</b></span>
      <span className="player-stat">费用 <b>{player.cost}/10</b></span>
      <span className="player-stat">牌库 {player.deck.length}</span>
      <span className="player-stat">弃牌 {player.discard.length}</span>
      {player.fatigue_count > 0 && <span className="player-stat fatigue">疲劳 {player.fatigue_count}</span>}
      <span className="player-facilities">
        {player.facility_ids.map((facilityId) => {
          const definition = cardDefinitionOf(state, facilityId);
          const instance = state.card_instances[facilityId];
          return (
            <span key={facilityId} className="facility-chip">
              {definition?.card_name_zh ?? '设施'}·{instance?.support_lifecycle?.turn_start_triggers ?? 0}
            </span>
          );
        })}
      </span>
    </div>
  );
}
