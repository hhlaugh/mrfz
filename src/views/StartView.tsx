interface StartViewProps {
  readonly onHotseat: () => void;
  readonly onVsBot: () => void;
  readonly onOnline: () => void;
  readonly onDeckEditor: () => void;
}

export function StartView({ onHotseat, onVsBot, onOnline, onDeckEditor }: StartViewProps) {
  return (
    <div className="start">
      <h1>明日方舟卡牌对战 Demo</h1>
      <p className="subtitle">规则版本 v0.8 / v1.1 卡池 · 80 位干员全量支持 · 支持人机 / 热座 / P2P 免服好友对战</p>
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
        <button className="btn big" style={{ borderColor: '#06b6d4', color: '#67e8f9' }} onClick={onDeckEditor}>
          🎴 卡组构筑 / 编辑 (Deck Builder)
        </button>
      </div>
      <p className="note">卡组构筑：支持全量 80 位干员、战术卡与支援卡自由搭配，实时校验 20 张卡牌与同名限制。</p>
      <p className="note">单人模式：你执玩家 A，玩家 B 由本地机器人执牌；机器人只读取合法动作列表与公开/自身状态，每个动作都经规则引擎严格验证。</p>
      <p className="note">热座模式：双人同屏轮流操作（起手换牌 → 对战 → 结算）。</p>
      <p className="note">好友对战：基于 WebRTC P2P 直连，无需任何后端中继服务；生成 8 位房间码或输入房间码即可跨设备 1v1 对战。</p>
    </div>
  );
}
