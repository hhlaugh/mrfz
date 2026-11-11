import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { LocalGameController } from './client/localGameController';
import type { LocalGameSetup } from './client/localGameController';
import { OnlineMatchController, type OnlineMatchSnapshot } from './client/onlineMatchController';
import { BotPlayer, botMulliganChoice } from './ai/botPlayer';
import { enumerateLegalActions } from './game/legal-actions';
import { DEMO_CARDS, getAllAvailableDecks } from './client/demoData';
import { StartView } from './views/StartView';
import { DeckSelectView } from './views/DeckSelectView';
import { DeckEditorView } from './views/DeckEditorView';
import { CardLibraryView } from './views/CardLibraryView';
import { MulliganView } from './views/MulliganView';
import { BattleView } from './views/BattleView';
import { SettlementView } from './views/SettlementView';
import { RoomLobbyView } from './views/RoomLobbyView';
import type { CardInstanceId, DeckDefinition, PlayerId } from './game/types';

type Screen = 'title' | 'deckSelect' | 'game' | 'online' | 'deckEditor' | 'library';
type Mode = 'hotseat' | 'vs-bot' | 'online';

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

export function App() {
  const [screen, setScreen] = useState<Screen>('title');
  const [mode, setMode] = useState<Mode>('hotseat');
  const [controller, setController] = useState<LocalGameController | null>(null);

  const onlineController = useMemo(() => new OnlineMatchController(), []);
  const onlineSnapshot = useSyncExternalStore(onlineController.subscribe, onlineController.getSnapshot);

  if (screen === 'library') {
    return (
      <CardLibraryView
        onBack={() => setScreen('title')}
        onOpenDeckEditor={() => setScreen('deckEditor')}
      />
    );
  }

  if (screen === 'deckEditor') {
    return <DeckEditorView onBack={() => setScreen('title')} />;
  }

  if (screen === 'title') {
    return (
      <StartView
        onHotseat={() => {
          setMode('hotseat');
          setScreen('deckSelect');
        }}
        onVsBot={() => {
          setMode('vs-bot');
          setScreen('deckSelect');
        }}
        onOnline={() => {
          setMode('online');
          setScreen('online');
        }}
        onDeckEditor={() => {
          setScreen('deckEditor');
        }}
        onLibrary={() => {
          setScreen('library');
        }}
      />
    );
  }

  if (mode === 'online' || screen === 'online') {
    return (
      <OnlineScreen
        controller={onlineController}
        snapshot={onlineSnapshot}
        onExit={() => {
          onlineController.leaveRoom();
          setScreen('title');
        }}
      />
    );
  }

  if (screen === 'deckSelect' || !controller) {
    return (
      <DeckSelectView
        mode={mode}
        onCancel={() => setScreen('title')}
        onOpenDeckEditor={() => setScreen('deckEditor')}
        onStart={(setup: LocalGameSetup) => {
          setController(LocalGameController.create(setup));
          setScreen('game');
        }}
      />
    );
  }

  return (
    <GameScreen
      controller={controller}
      mode={mode}
      botSeat="player_b"
      onExit={() => {
        setController(null);
        setScreen('title');
      }}
      onRestart={() => setController(LocalGameController.create({ ...controller.getSetup(), seed: randomSeed() }))}
    />
  );
}

interface GameScreenProps {
  readonly controller: LocalGameController;
  readonly mode: Mode;
  readonly botSeat: PlayerId;
  readonly onExit: () => void;
  readonly onRestart: () => void;
}

function GameScreen({ controller, mode, botSeat, onExit, onRestart }: GameScreenProps) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const state = snapshot.state;
  const bot = useMemo(
    () => (mode === 'vs-bot' ? new BotPlayer({ player: botSeat, log: (message) => console.info(message) }) : null),
    [mode, botSeat, controller],
  );

  // 机器人自动起手换牌。
  useEffect(() => {
    if (!bot || state.phase !== 'mulligan' || state.mulligan_completed[botSeat]) return;
    const nextPlayer: PlayerId = state.mulligan_completed.player_a ? 'player_b' : 'player_a';
    if (nextPlayer !== botSeat) return;
    const timer = window.setTimeout(() => {
      controller.submitMulligan(botSeat, botMulliganChoice(controller.getSnapshot().state, botSeat));
    }, 600);
    return () => window.clearTimeout(timer);
  }, [bot, botSeat, controller, state]);

  // 机器人行动驱动：到达机器人决策点（行动阶段 / 回合开始支援选择）时自动出招。
  useEffect(() => {
    if (!bot) return;
    const current = snapshot.state;
    const botToAct =
      current.active_player_id === botSeat &&
      current.phase !== 'finished' &&
      current.phase !== 'mulligan' &&
      (current.phase === 'action' || (current.phase === 'turn_start' && current.turn_start_prepared && current.pending_effect_choices.length > 0));
    if (!botToAct) return;
    const timer = window.setTimeout(() => {
      const decisionState = controller.getSnapshot().state;
      try {
        const action = bot.decide(decisionState);
        const result = controller.dispatch(botSeat, action);
        if (!result.ok) {
          bot.noteFallback(`动作被拒绝：${result.reason ?? '未知原因'}`);
          console.warn(`机器人动作被引擎拒绝（${result.reason}），回退到首个合法动作。`);
          const fallback = enumerateLegalActions(decisionState, botSeat)[0];
          if (fallback) controller.dispatch(botSeat, fallback);
        }
      } catch (error) {
        console.error('机器人决策异常：', error);
        bot.noteFallback('决策异常');
        const fallback = enumerateLegalActions(decisionState, botSeat)[0];
        if (fallback) controller.dispatch(botSeat, fallback);
      }
    }, 550);
    return () => window.clearTimeout(timer);
  }, [bot, botSeat, controller, snapshot]);

  if (state.phase === 'mulligan') {
    const nextPlayer: PlayerId = state.mulligan_completed.player_a ? 'player_b' : 'player_a';
    if (bot && nextPlayer === botSeat) {
      return (
        <div className="mulligan">
          <h1>机器人正在选择起手牌…</h1>
          <p className="note">牌组：{controller.getSetup().decks[botSeat].deck_name_zh}</p>
        </div>
      );
    }
    return (
      <MulliganView
        key={nextPlayer}
        state={state}
        playerId={nextPlayer}
        deckName={controller.getSetup().decks[nextPlayer].deck_name_zh}
        onConfirm={(selected: readonly CardInstanceId[]) => controller.submitMulligan(nextPlayer, selected)}
      />
    );
  }

  if (state.phase === 'finished') {
    return (
      <SettlementView
        snapshot={snapshot}
        setup={controller.getSetup()}
        modeLabel={mode === 'vs-bot' ? '模式：单人对战（机器人 · 普通难度）' : '模式：本地热座（双人）'}
        onRestart={onRestart}
        onExit={onExit}
      />
    );
  }

  return (
    <BattleView
      snapshot={snapshot}
      controller={controller}
      humanPlayer={mode === 'vs-bot' ? (botSeat === 'player_b' ? 'player_a' : 'player_b') : null}
    />
  );
}

interface OnlineScreenProps {
  readonly controller: OnlineMatchController;
  readonly snapshot: OnlineMatchSnapshot;
  readonly onExit: () => void;
}

function OnlineScreen({ controller, snapshot, onExit }: OnlineScreenProps) {
  // If not yet in game, show room lobby
  if (!snapshot.inGame || !snapshot.gameSnapshot) {
    return <RoomLobbyView controller={controller} snapshot={snapshot} onBackToTitle={onExit} />;
  }

  const gameSnapshot = snapshot.gameSnapshot;
  const state = gameSnapshot.state;
  const mySeat: PlayerId = snapshot.seat === 'host' ? 'player_a' : 'player_b';

  const allDecks = getAllAvailableDecks();
  const deckA: DeckDefinition = allDecks.find((d) => d.deck_id === snapshot.hostDeckId) ?? allDecks[0]!;
  const deckB: DeckDefinition = allDecks.find((d) => d.deck_id === snapshot.guestDeckId) ?? allDecks[1] ?? deckA;

  const setup: LocalGameSetup = {
    decks: { player_a: deckA, player_b: deckB },
    cards: DEMO_CARDS,
    seed: 0,
  };

  if (state.phase === 'mulligan') {
    const myDone = state.mulligan_completed[mySeat];
    if (myDone) {
      return (
        <div className="mulligan">
          <h1>起手换牌完成</h1>
          <p className="note">你已提交换牌选择</p>
          <div className="status-box">⏳ 等待对手完成起手换牌并同步…</div>
          <button className="btn small" onClick={() => controller.leaveRoom()}>
            离开对局
          </button>
        </div>
      );
    }
    return (
      <MulliganView
        key={mySeat}
        state={state}
        playerId={mySeat}
        deckName={mySeat === 'player_a' ? deckA.deck_name_zh : deckB.deck_name_zh}
        onConfirm={(selected: readonly CardInstanceId[]) => controller.submitMulligan(selected)}
      />
    );
  }

  if (state.phase === 'finished') {
    return (
      <SettlementView
        snapshot={gameSnapshot}
        setup={setup}
        modeLabel={`模式：好友联机对战（房间码：${snapshot.roomCode} · 你执${mySeat === 'player_a' ? '玩家 A' : '玩家 B'}）`}
        onRestart={() => controller.leaveRoom()}
        onExit={() => {
          controller.leaveRoom();
          onExit();
        }}
      />
    );
  }

  return (
    <>
      <BattleView
        snapshot={gameSnapshot}
        onDispatch={(action) => controller.dispatchAction(action)}
        humanPlayer={mySeat}
        networkStatus={{
          isOnline: true,
          roomCode: snapshot.roomCode ?? '',
          seat: snapshot.seat ?? 'host',
          opponentConnected: snapshot.opponentConnected,
          pausedForGuest: snapshot.pausedForGuest,
          onLeaveRoom: () => {
            controller.leaveRoom();
            onExit();
          },
        }}
      />

      {snapshot.closedReason && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h2>对局已中断</h2>
            <p>
              {snapshot.closedReason === 'HOST_LEFT'
                ? '房主已主动退出房间。'
                : snapshot.closedReason === 'HOST_TIMEOUT'
                  ? '房主断线超时，对局已释放。'
                  : snapshot.closedReason === 'GUEST_LEFT'
                    ? '访客已主动放弃对局。'
                    : snapshot.closedReason === 'GUEST_TIMEOUT'
                      ? '访客断线超时未恢复。'
                      : `房间已关闭：${snapshot.closedReason}`}
            </p>
            <p className="hint">对局已结束，请返回标题页。</p>
            <button className="btn primary big" onClick={() => { controller.leaveRoom(); onExit(); }}>
              返回标题页
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
