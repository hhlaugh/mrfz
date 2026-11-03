import type { GameAction } from '../game/types';

/**
 * 阶段 8 协议类型（联机准备，本阶段不建网络连接）。
 * 访客只提交动作意图（ActionRequest）；房主验证后回执（ActionAck）。
 * 字段用 camelCase；playerId/座位由连接上下文决定，不信任 payload 自带身份。
 */

export interface ActionRequest {
  readonly requestId: string;
  readonly expectedStateVersion: number;
  readonly action: GameAction;
}

export interface ActionAck {
  readonly requestId: string;
  readonly ok: boolean;
  readonly reason?: string;
  readonly stateVersion: number;
}

const ACTION_TYPES: ReadonlySet<string> = new Set([
  'end_action_phase',
  'play_card',
  'deploy_operator',
  'withdraw_operator',
  'activate_skill',
  'resolve_pending_choice',
]);
const LANES: ReadonlySet<string> = new Set(['left', 'center', 'right']);
const POSITIONS: ReadonlySet<string> = new Set(['front', 'back']);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** ActionRequest 的轻量运行时 schema 校验：只查结构；规则合法性仍由引擎 validateAction 路径负责。 */
export function isActionRequest(value: unknown): value is ActionRequest {
  if (typeof value !== 'object' || value === null) return false;
  const request = value as Record<string, unknown>;
  if (!isNonEmptyString(request.requestId)) return false;
  if (!isNonNegativeInteger(request.expectedStateVersion)) return false;
  const action = request.action;
  if (typeof action !== 'object' || action === null) return false;
  const fields = action as Record<string, unknown>;
  if (typeof fields.type !== 'string' || !ACTION_TYPES.has(fields.type)) return false;
  const hasOptionalTarget = fields.target_instance_id === undefined || isNonEmptyString(fields.target_instance_id);
  switch (fields.type) {
    case 'end_action_phase':
      return true;
    case 'play_card':
    case 'withdraw_operator':
    case 'activate_skill':
      return isNonEmptyString(fields.card_instance_id) && hasOptionalTarget;
    case 'deploy_operator':
      return (
        isNonEmptyString(fields.card_instance_id) &&
        typeof fields.lane === 'string' &&
        LANES.has(fields.lane) &&
        typeof fields.position === 'string' &&
        POSITIONS.has(fields.position)
      );
    case 'resolve_pending_choice':
      return isNonEmptyString(fields.source_instance_id) && hasOptionalTarget;
    default:
      return false;
  }
}

/** ActionAck 的轻量运行时 schema 校验。 */
export function isActionAck(value: unknown): value is ActionAck {
  if (typeof value !== 'object' || value === null) return false;
  const ack = value as Record<string, unknown>;
  if (!isNonEmptyString(ack.requestId)) return false;
  if (typeof ack.ok !== 'boolean') return false;
  if (ack.reason !== undefined && typeof ack.reason !== 'string') return false;
  return isNonNegativeInteger(ack.stateVersion);
}
