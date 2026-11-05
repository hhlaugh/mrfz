import { useEffect, useState } from 'react';
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
  const [isJoining, setIsJoining] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const isGitHubPages = typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');

  useEffect(() => {
    if (snapshot.errorMessage || snapshot.roomCode) {
      setIsJoining(false);
      setIsCreating(false);
    }
  }, [snapshot.errorMessage, snapshot.roomCode]);

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

  useEffect(() => {
    controller.connect();
  }, [controller]);

  const handleStart = () => {
    controller.startMatch();
  };

  const handleLeave = () => {
    controller.leaveRoom();
  };

  const handleCreate = () => {
    setIsCreating(true);
    controller.createRoom();
    setTimeout(() => setIsCreating(false), 8000);
  };

  const handleJoin = () => {
    const code = inputCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (code.length !== 8) {
      controller.setError(`房间码必须为 8 位字符（当前已输入 ${code.length} 位）。`);
      return;
    }
    controller.clearError();
    setIsJoining(true);
    controller.joinRoom(code);
    setTimeout(() => setIsJoining(false), 7000);
  };

  // 1. 未进入房间视图：创建房间 或 输入房间码加入
  if (!inRoom) {
    return (
      <div className="room-lobby">
        <h1>好友联机对战</h1>
        <p className="subtitle">基于 Node.js + Socket.IO 中继服务 · 房主权威架构</p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', margin: '10px 0 12px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn small ${snapshot.mode === 'p2p' ? 'primary' : ''}`}
            onClick={() => controller.setMode('p2p')}
          >
            🌐 P2P 直连模式（推荐 · 免服务器 · 支持手机跨设备）
          </button>
          <button
            type="button"
            className={`btn small ${snapshot.mode === 'relay' ? 'primary' : ''}`}
            onClick={() => controller.setMode('relay')}
          >
            ⚡ Socket.IO 中继模式
          </button>
        </div>

        {snapshot.mode === 'p2p' ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', margin: '4px 0 14px', background: 'rgba(76, 195, 138, 0.1)', border: '1px solid rgba(76, 195, 138, 0.3)', padding: '6px 14px', borderRadius: '8px', color: '#68d391' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#48bb78' }} />
            <span>当前模式：<b>WebRTC P2P 直连</b> · 免搭服务器，房主创建房间后好友输入房间码即可直接对战</span>
          </div>
        ) : (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', margin: '4px 0 14px', background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '8px' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: snapshot.connected ? '#48bb78' : '#e53e3e' }} />
            <span>中继服务：{snapshot.connected ? '🟢 已连接' : '🔴 未连接（需本地 npm run relay 或配置公网中继）'}</span>
            <span style={{ color: '#718096', fontSize: '11px' }}>({snapshot.serverUrl})</span>
          </div>
        )}

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
            <button className="btn primary big" disabled={isCreating} onClick={handleCreate}>
              {isCreating ? '正在创建...' : '创建房间'}
            </button>
          </div>

          <div className="room-divider">或</div>

          <div className="room-action-block">
            <h2>输入房间码加入</h2>
            <p className="note">输入好友分享的 8 位房间码。</p>
            <div className="room-code-input-row">
              <input
                type="text"
                placeholder="例如 ABCD2345"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isJoining) {
                    handleJoin();
                  }
                }}
              />
              <button
                className="btn primary"
                disabled={isJoining}
                onClick={handleJoin}
              >
                {isJoining ? '加入中...' : '加入'}
              </button>
            </div>
          </div>
        </div>

        {snapshot.mode === 'relay' && (
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
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '6px 0' }}>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => {
                      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8787';
                      setServerUrl(origin);
                      controller.setServerUrl(origin);
                    }}
                  >
                    设为当前站点同源
                  </button>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => {
                      setServerUrl('http://localhost:8787');
                      controller.setServerUrl('http://localhost:8787');
                    }}
                  >
                    设为本地独立端 (8787)
                  </button>
                  <button className="btn small primary" onClick={() => controller.setServerUrl(serverUrl.trim())}>
                    应用并重连
                  </button>
                </div>
                <p className="hint">
                  开发服务器已内置集成中继服务（同源直连即可）。若运行了独立 <code>npm run relay</code> 服务，可切换为 <code>http://localhost:8787</code>。
                </p>
              </div>
            )}
          </div>
        )}

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
        <span style={{ fontSize: 11, background: snapshot.mode === 'p2p' ? 'rgba(76,195,138,0.2)' : 'rgba(79,140,255,0.2)', padding: '2px 8px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)' }}>
          {snapshot.mode === 'p2p' ? '🌐 P2P 直连' : '⚡ 中继模式'}
        </span>
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
