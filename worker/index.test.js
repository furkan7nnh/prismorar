import assert from 'node:assert/strict';
import test from 'node:test';
import worker from './index.js';

const origin = 'https://prismorar.com';
const gameId = '019f137d-ee0a-721c-a3f7-5f8588d15062';
const launchRequest = (path = `/api/game-launch/${gameId}?currency=USD`, options = {}) =>
  new Request(`https://worker.example${path}`, {
    ...options,
    headers: { Origin: origin, ...options.headers },
  });

test('serves a health check', async () => {
  const response = await worker.fetch(new Request('https://worker.example/health'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('adds CORS headers only for Prismorar origins', async () => {
  const response = await worker.fetch(
    new Request('https://worker.example/api/game-launch/not-a-game', {
      headers: { Origin: 'https://attacker.example' },
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});

test('rejects invalid game ids and currencies', async () => {
  const invalidGame = await worker.fetch(launchRequest('/api/game-launch/invalid?currency=USD'));
  assert.equal(invalidGame.status, 400);

  const invalidCurrency = await worker.fetch(
    launchRequest(`/api/game-launch/${gameId}?currency=not-valid`),
  );
  assert.equal(invalidCurrency.status, 400);
});

test('handles CORS preflight without contacting the provider', async () => {
  const response = await worker.fetch(
    launchRequest(`/api/game-launch/${gameId}?currency=USD`, { method: 'OPTIONS' }),
  );
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS');
});

test('proxies the demo launch and returns the secure game URL', async (context) => {
  const originalFetch = globalThis.fetch;
  let upstreamUrl;
  globalThis.fetch = async (input) => {
    upstreamUrl = new URL(input);
    return Response.json({ success: true, data: { url: 'https://games.example/session/123' } });
  };
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await worker.fetch(launchRequest());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(upstreamUrl.origin, 'https://multiwin223.com');
  assert.equal(upstreamUrl.pathname, `/api/v1/games/launch-demo-mode/${gameId}`);
  assert.equal(upstreamUrl.searchParams.get('currency'), 'USD');
  assert.equal(upstreamUrl.searchParams.get('language'), 'tr');
  assert.deepEqual(await response.json(), {
    success: true,
    data: { url: 'https://games.example/session/123' },
  });
});

test('rejects non-HTTPS game URLs returned by the provider', async (context) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ success: true, data: { url: 'http://games.example/session' } });
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await worker.fetch(launchRequest());
  assert.equal(response.status, 502);
});
