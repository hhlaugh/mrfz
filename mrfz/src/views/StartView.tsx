interface StartViewProps {
  readonly onHotseat: () => void;
  readonly onVsBot: () => void;
  readonly onOnline: () => void;
}

export function StartView({ onHotseat, onVsBot, onOnline }: StartViewProps) {
  return (
    <div className="start">
      <h1>三路攻防卡牌 Demo</h1>
      <p className="subtitle">规则版本 v0.7 · 房主权威 + 中继服务好友对战</p>
      <div className="start-actions">
        <button className="btn primary big" onClick={onVsBot}>
          单人对战（vs 机器人）
        </button>
        <button className="btn big" onClick={onHotseat}>
          本地热座（双人）
        </button>
        <button className="btn big highlight-btn" onClick={onOnline}>
          好友对战（联机房间）
        </button>
      </div>
      <p className="note">单人模式：你执玩家 A，玩家 B 由本地机器人执牌；机器人只读取合法动作列表与公开/自身状态，每个动作都经规则引擎验证。</p>
      <p className="note">热座模式：双人同屏轮流操作（起手换牌 → 对战 → 结算）。</p>
      <p className="note">好友对战：房主权威 + Node.js/Socket.IO 中继；创建 8 位房间码或输入房间码跨设备 1v1 对战。</p>
    </div>
  );
}
