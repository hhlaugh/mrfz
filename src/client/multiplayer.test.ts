import { describe, expect, it } from 'vitest';
import { clientStateFromPlayerView } from './playerView';
import { LocalGameController } from './localGameController';
import { enumerateLegalActions } from '../game/legal-actions';
import { loadDemoData } from '../data/load-demo-data';

const loaded = loadDemoData();
const [deckA, deckB] = loaded.decks;

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
