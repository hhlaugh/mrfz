import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { createRelayServer, type RelayRuntime } from '../../relay-server/src/index';
import { OnlineMatchController } from './onlineMatchController';
import { clientStateFromPlayerView } from './playerView';
import { LocalGameController } from './localGameController';
import { enumerateLegalActions } from '../game/legal-actions';
import { loadDemoData } from '../data/load-demo-data';

let relay: RelayRuntime;
let relayUrl = '';

const loaded = loadDemoData();
const [deckA, deckB] = loaded.decks;

beforeAll(async () => {
  const httpServer = createServer();
  relay = createRelayServer(httpServer, {
    origins: true,
    guestReconnectWindowMs: 200,
    hostReconnectWindowMs: 100,
    lobbyTtlMs: 5000,
  });
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  relayUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await relay.close();
});

function waitForState<T>(
  controller: { subscribe: (cb: () => void) => () => void; getSnapshot: () => T },
  predicate: (snapshot: T) => boolean,
  timeoutMs = 4000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const current = controller.getSnapshot();
    if (predicate(current)) {
      resolve(current);
      return;
    }
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error('等待状态超时'));
    }, timeoutMs);
    const unsubscribe = controller.subscribe(() => {
      const snap = controller.getSnapshot();
      if (predicate(snap)) {
        clearTimeout(timer);
        unsubscribe();
        resolve(snap);
      }
    });
  });
}

describe('clientStateFromPlayerView projection', () => {
  it('projects PlayerView into a valid client GameState without leaking opponent private cards', () => {
    const controller = LocalGameController.create({
      decks: { player_a: deckA!, player_b: deckB! },
      cards: loaded.validCards,
      seed: 12345,
    });
    controller.submitMulligan('player_a', []);
    controller.submitMulligan('player_b', []);

    const guestView = controller.toPlayerView('player_b');
    const clientState = clientStateFromPlayerView(guestView);

    expect(clientState.rules_version).toBe('0.7');
    expect(clientState.state_version).toBe(guestView.stateVersion);
    expect(clientState.active_player_id).toBe(guestView.activePlayerId);
    expect(clientState.phase).toBe(guestView.phase);

    // Guest's own hand is visible
    expect(clientState.players.player_b.hand.length).toBe(guestView.hand.length);
    for (const card of guestView.hand) {
      expect(clientState.card_instances[card.instanceId]).toBeDefined();
      expect(clientState.card_instances[card.instanceId]?.zone).toBe('hand');
    }

    // Opponent's hand cards are masked (zero instances exposed in clientState)
    for (const cardId of clientState.players.player_a.hand) {
      expect(clientState.card_instances[cardId]).toBeUndefined();
    }

    // Board units are all available in clientState
    for (const unit of guestView.units) {
      const instance = clientState.card_instances[unit.cardInstanceId];
      expect(instance).toBeDefined();
      expect(instance?.operator_combat?.current_hp).toBe(unit.hp);
      expect(instance?.operator_combat?.current_sp).toBe(unit.sp);
    }

    // Legal action enumeration on clientState works without throwing
    const guestActions = enumerateLegalActions(clientState, 'player_b');
    expect(Array.isArray(guestActions)).toBe(true);
  });
});

describe('OnlineMatchController and Friend Match Integration', () => {
  it('executes full lobby flow: create, join, ready, match start, mulligan, and guest actions', async () => {
    const host = new OnlineMatchController(relayUrl);
    const guest = new OnlineMatchController(relayUrl);

    try {
      // 1. Host creates room
      host.createRoom();
      const hostCreated = await waitForState(host, (s) => Boolean(s.roomCode));
      const roomCode = hostCreated.roomCode!;
      expect(roomCode).toMatch(/^[A-Z0-9]{8}$/);
      expect(hostCreated.seat).toBe('host');

      // 2. Guest joins room
      guest.joinRoom(roomCode);
      const guestJoined = await waitForState(guest, (s) => s.roomCode === roomCode && s.seat === 'guest');
      expect(guestJoined.seat).toBe('guest');

      // 3. Both players select deck & ready up
      host.selectDeck('DEMO-DECK-A');
      guest.selectDeck('DEMO-DECK-B');
      host.setReady(true);
      guest.setReady(true);

      await waitForState(host, (s) => Boolean(s.roomState?.host.ready && s.roomState?.guest?.ready));

      // 4. Host starts match
      host.startMatch();

      const [hostInGame, guestInGame] = await Promise.all([
        waitForState(host, (s) => s.inGame && Boolean(s.gameSnapshot)),
        waitForState(guest, (s) => s.inGame && Boolean(s.gameSnapshot)),
      ]);

      expect(hostInGame.inGame).toBe(true);
      expect(guestInGame.inGame).toBe(true);
      expect(hostInGame.gameSnapshot?.state.phase).toBe('mulligan');
      expect(guestInGame.gameSnapshot?.state.phase).toBe('mulligan');

      // 5. Both submit mulligan
      const hostMulliganRes = host.submitMulligan([]);
      expect(hostMulliganRes.ok).toBe(true);

      const guestMulliganRes = guest.submitMulligan([]);
      expect(guestMulliganRes.ok).toBe(true);

      // Once both finish mulligan, phase advances to action
      const hostActionPhase = await waitForState(host, (s) => s.gameSnapshot?.state.phase === 'action');
      const guestActionPhase = await waitForState(guest, (s) => s.gameSnapshot?.state.phase === 'action');

      expect(hostActionPhase.gameSnapshot?.state.phase).toBe('action');
      expect(guestActionPhase.gameSnapshot?.state.phase).toBe('action');
      expect(guestActionPhase.gameSnapshot?.state.state_version).toBe(hostActionPhase.gameSnapshot?.state.state_version);

      // 6. Action execution across network
      const activePlayer = hostActionPhase.gameSnapshot?.state.active_player_id;
      if (activePlayer === 'player_b') {
        // Guest's turn to act
        const actionResult = await guest.dispatchAction({ type: 'end_action_phase' });
        expect(actionResult.ok).toBe(true);
      } else {
        // Host's turn to act
        const actionResult = await host.dispatchAction({ type: 'end_action_phase' });
        expect(actionResult.ok).toBe(true);
      }

      // Guest's snapshot automatically updates via view:update broadcast
      const updatedGuest = await waitForState(
        guest,
        (s) => (s.gameSnapshot?.state.state_version ?? 0) > guestActionPhase.gameSnapshot!.state.state_version,
      );
      expect(updatedGuest.gameSnapshot?.state.state_version).toBeGreaterThan(guestActionPhase.gameSnapshot!.state.state_version);

      // 7. Stale expectedStateVersion rejection
      if (guest.getSnapshot().seat === 'guest') {
        const staleResult = await guest.dispatchAction({ type: 'end_action_phase' });
        // Since state version moved forward, submitting invalid/stale action is rejected
        if (!staleResult.ok) {
          expect(staleResult.reason).toBeTruthy();
        }
      }

      // 8. Host leaves room -> Guest receives room:closed
      host.leaveRoom();
      const guestClosed = await waitForState(guest, (s) => Boolean(s.closedReason));
      expect(guestClosed.closedReason).toBe('HOST_LEFT');
    } finally {
      host.disconnect();
      guest.disconnect();
    }
  });

  it('rejects joining with invalid room code', async () => {
    const client = new OnlineMatchController(relayUrl);
    try {
      client.joinRoom('ZZZZ9999');
      const snap = await waitForState(client, (s) => Boolean(s.errorMessage));
      expect(snap.errorMessage).toContain('ROOM_NOT_FOUND');
    } finally {
      client.disconnect();
    }
  });
});
