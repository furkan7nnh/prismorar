import assert from 'node:assert/strict';
import test from 'node:test';
import { createCompactCatalog } from './update-catalog.mjs';

test('prefers custom game artwork over a generic provider cover', () => {
  const catalog = createCompactCatalog({
    providers: [{ name: 'Ninja Gaming' }],
    labels: [],
    games: [{
      id: '019f137d-ee0a-721c-a3f7-5f8588d15062',
      name: 'Cat Mansion',
      provider_name: 'Ninja Gaming',
      active: true,
      available: true,
      provider_is_active: true,
      demo_mode_supported: true,
      supported_currencies: ['USD'],
      cover_image: '/storage/generic-gradient.avif',
      custom_background_image: '/storage/cat-mansion.avif',
    }],
  }, '2026-10-17T00:00:00.000Z');

  assert.equal(catalog.games[0][3], '/storage/cat-mansion.avif');
});

test('omits confirmed failed games and providers without remaining games', () => {
  const games = [
    ['failed-game', 'Failed Provider'],
    ['working-game', 'Working Provider'],
  ].map(([id, provider_name]) => ({
    id,
    name: id,
    provider_name,
    active: true,
    available: true,
    provider_is_active: true,
    demo_mode_supported: true,
    supported_currencies: ['USD'],
    cover_image: `/storage/${id}.avif`,
  }));
  const catalog = createCompactCatalog({
    providers: [{ name: 'Failed Provider' }, { name: 'Working Provider' }],
    labels: [],
    games,
  }, '2026-10-17T00:00:00.000Z', ['failed-game']);

  assert.deepEqual(catalog.games.map(([id]) => id), ['working-game']);
  assert.deepEqual(catalog.providers, ['Working Provider']);
});
