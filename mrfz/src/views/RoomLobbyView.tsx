import { useState } from 'react';
import type { OnlineMatchController, OnlineMatchSnapshot } from '../client/onlineMatchController';
import { DEMO_DECKS } from '../client/demoData';

interface RoomLobbyViewProps {
  readonly controller: OnlineMatchController;
  readonly snapshot: OnlineMatchSnapshot;
  readonly onBackToTitle: () => void;
}

export function RoomLobbyView({ controller, snapshot, onBackToTitle }: RoomLobbyViewProps) {
  const [inputCode, setInputCode] = useState('');
  const [serverUrl, setServerUrl] = useState(controller.getServerUrl());
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [copied, setCopied] = useState(false);

  const roomState = snapshot.roomState;
  const isHost = snapshot.seat === 'host';
  const isGuest = snapshot.seat === 'guest';
  const inRoom = Boolean(snapshot.roomCode);

  const myReady = isHost ? Boolean(roomState?.host.ready) : Boolean(roomState?.guest?.ready);

  const copyCode = () => {
    if (!snapshot.roomCode) return;
    navigator.clipboard.writeText(snapshot.roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSelectDeck = (deckId: string) => {
    controller.selectDeck(deckId);
  };

  const toggleReady = () => {
    controller.setReady(!myReady);
  };

  const handleStart = () => {
    controller.startMatch();
  };

  const handleLeave = () => {
    controller.leaveRoom();
  };

  // 1. 未进入房间视图：创建房间 或 输入房间码加入
  if (!inRoom) {
    return (
      <div className="room-lobby">
        <h1>好友联机对战</h1>
        <p className="subtitle">基于 Node.js + Socket.IO 中继服务 · 房主权威架构</p>

        {snapshot.closedReason && (
          <div className="alert-box warn">
            <b>前次房间已关闭：</b>
            {snapshot.closedReason === 'HOST_LEFT'
              ? '房主已主动解散房间。'
              : snapshot.closedReason === 'HOST_TIMEOUT'
                ? '房主断线超时，房间已自动释放。'
                : snapshot.closedReason === 'EXPIRED'
                  ? '房间长期无操作已过期。'
                  : snapshot.closedReason}
          </div>
        )}

        {snapshot.errorMessage && (
          <div className="alert-box error">
            <span>{snapshot.errorMessage}</span>
            <button className="btn small" onClick={() => controller.clearError()}>
              知道了
            </button>
          </div>
        )}

        <div className="room-actions-card">
          <div className="room-action-block">
            <h2>创建新房间</h2>
            <p className="note">作为房主创建房间码，并邀请好友加入对战。</p>
            <button className="btn primary big" onClick={() => controller.createRoom()}>
              创建房间
            </button>
          </div>

          <div className="room-divider">或</div>

          <div className="room-action-block">
            <h2>输入房间码加入</h2>
            <p className="note">输入好友分享的 8 位房间码。</p>
            <div className="room-code-input-row">
              <input
                type="text"
                maxLength={8}
                placeholder="例如 ABCD2345"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && inputCode.trim().length === 8) {
                    controller.joinRoom(inputCode);
                  }
                }}
              />
              <button
                className="btn primary"
                disabled={inputCode.trim().length !== 8}
                onClick={() => controller.joinRoom(inputCode)}
              >
                加入
              </button>
            </div>
          </div>
        </div>

        <div className="server-config-section">
          <button className="btn link-btn" onClick={() => setShowServerConfig(!showServerConfig)}>
            {showServerConfig ? '▲ 收起中继服务配置' : '▼ 高级设置：中继服务器地址'}
          </button>
          {showServerConfig && (
            <div className="server-config-box">
              <label>
                中继服务 URL：
                <input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="http://localhost:8787"
                />
              </label>
              <button className="btn small" onClick={() => controller.setServerUrl(serverUrl.trim())}>
                更新并重连
              </button>
              <p className="hint">
                默认本机 <code>http://localhost:8787</code>。同局域网对战可填入房主局域网 IP（如 <code>http://192.168.x.x:8787</code>）。
              </p>
            </div>
          )}
        </div>

        <button className="btn" onClick={onBackToTitle}>
          返回标题页
        </button>
      </div>
    );
  }

  // 2. 房间大厅视图
  const allReady = Boolean(roomState?.host.ready && roomState?.guest?.ready);
  const guestJoined = Boolean(roomState?.guest);

  return (
    <div className="room-lobby">
      <h1>好友对战大厅</h1>

      {snapshot.errorMessage && (
        <div className="alert-box error">
          <span>{snapshot.errorMessage}</span>
          <button className="btn small" onClick={() => controller.clearError()}>
            知道了
          </button>
        </div>
      )}

      {/* 房间码与复制区 */}
      <div className="room-code-panel">
        <span className="room-code-label">房间码：</span>
        <span className="room-code-display">{snapshot.roomCode}</span>
        <button className="btn small" onClick={copyCode}>
          {copied ? '✅ 已复制' : '📋 复制房间码'}
        </button>
        <span className="hint">将房间码发给朋友，对方输入即可加入</span>
      </div>

      {/* 双方玩家座位卡片 */}
      <div className="room-players-grid">
        {/* 房主座位 */}
        <div className={`room-player-card ${isHost ? 'my-card' : ''}`}>
          <div className="card-badge">{isHost ? '👤 你（房主 · 玩家 A）' : '👑 房主（玩家 A）'}</div>
          <div className="status-indicator">
            <span className={`status-dot ${roomState?.host.connected ? 'online' : 'offline'}`} />
            <span>{roomState?.host.connected ? '在线' : '离线'}</span>
          </div>

          <div className="deck-selection-area">
            <label>选择牌组：</label>
            {isHost ? (
              <select
                value={roomState?.host.deckId ?? DEMO_DECKS[0]?.deck_id}
                disabled={myReady}
                onChange={(e) => handleSelectDeck(e.target.value)}
              >
                {DEMO_DECKS.map((d) => (
                  <option key={d.deck_id} value={d.deck_id}>
                    {d.deck_name_zh}
                  </option>
                ))}
              </select>
            ) : (
              <span className="deck-display-name">
                {DEMO_DECKS.find((d) => d.deck_id === roomState?.host.deckId)?.deck_name_zh ?? '尚未选定'}
              </span>
            )}
          </div>

          <div className={`ready-tag ${roomState?.host.ready ? 'ready' : 'waiting'}`}>
            {roomState?.host.ready ? '✅ 已准备' : '⏳ 未准备'}
          </div>
        </div>

        {/* 访客座位 */}
        <div className={`room-player-card ${isGuest ? 'my-card' : ''}`}>
          <div className="card-badge">{isGuest ? '👤 你（访客 · 玩家 B）' : '👥 访客（玩家 B）'}</div>
          {guestJoined ? (
            <>
              <div className="status-indicator">
                <span className={`status-dot ${roomState?.guest?.connected ? 'online' : 'offline'}`} />
                <span>{roomState?.guest?.connected ? '在线' : '离线'}</span>
              </div>

              <div className="deck-selection-area">
                <label>选择牌组：</label>
                {isGuest ? (
                  <select
                    value={roomState?.guest?.deckId ?? DEMO_DECKS[1]?.deck_id ?? DEMO_DECKS[0]?.deck_id}
                    disabled={myReady}
                    onChange={(e) => handleSelectDeck(e.target.value)}
                  >
                    {DEMO_DECKS.map((d) => (
                      <option key={d.deck_id} value={d.deck_id}>
                        {d.deck_name_zh}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="deck-display-name">
                    {DEMO_DECKS.find((d) => d.deck_id === roomState?.guest?.deckId)?.deck_name_zh ?? '尚未选定'}
                  </span>
                )}
              </div>

              <div className={`ready-tag ${roomState?.guest?.ready ? 'ready' : 'waiting'}`}>
                {roomState?.guest?.ready ? '✅ 已准备' : '⏳ 未准备'}
              </div>
            </>
          ) : (
            <div className="waiting-guest-placeholder">
              <span className="pulse-icon">⏳</span>
              <span>等待好友输入房间码加入…</span>
            </div>
          )}
        </div>
      </div>

      {/* 控制操作栏 */}
      <div className="lobby-actions-strip">
        <button
          className={`btn big ${myReady ? '' : 'primary'}`}
          onClick={toggleReady}
          disabled={!guestJoined}
        >
          {myReady ? '取消准备' : '点击准备'}
        </button>

        {isHost && (
          <button
            className="btn big primary"
            disabled={!allReady}
            onClick={handleStart}
          >
            {allReady ? '开始对局' : '等待双方准备…'}
          </button>
        )}

        <button className="btn big" onClick={handleLeave}>
          离开房间
        </button>
      </div>

      {!guestJoined && (
        <p className="hint">访客加入前无法准备；双方均准备后由房主点击开始对局。</p>
      )}
      {guestJoined && !allReady && (
        <p className="hint">双方都点击“准备”后，房主即可开启对局。</p>
      )}
    </div>
  );
}
