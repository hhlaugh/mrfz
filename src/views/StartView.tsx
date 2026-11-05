interface StartViewProps {
  readonly onHotseat: () => void;
  readonly onVsBot: () => void;
  readonly onOnline: () => void;
}

export function StartView({ onHotseat, onVsBot, onOnline }: StartViewProps) {
  return (
    <div className="start">
      <h1>明日方舟卡牌对战 Demo</h1>
      <p className="subtitle">规则版本 v0.7 · 支持单人人机 · 本地双人 · WebRTC P2P 免服好友对战</p>
      <div className="start-actions">
        <button className="btn primary big" onClick={onVsBot}>
          单人对战（vs 机器人）
        </button>
        <button className="btn big" onClick={onHotseat}>
          本地热座（双人同屏）
        </button>
        <button className="btn big highlight-btn" onClick={onOnline}>
          好友对战（P2P 联机房间）
        </button>
      </div>
      <p className="note">单人模式：你执玩家 A，玩家 B 由本地机器人执牌；机器人只读取合法动作列表与公开/自身状态，每个动作都经规则引擎严格验证。</p>
      <p className="note">热座模式：双人同屏轮流操作（起手换牌 → 对战 → 结算）。</p>
      <p className="note">好友对战：基于 WebRTC P2P 直连，无需任何后端中继服务；生成 8 位房间码或输入房间码即可跨设备 1v1 对战。</p>
    </div>
  );
}
