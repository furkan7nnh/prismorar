import assert from 'node:assert/strict';
import test from 'node:test';
import worker from './index.js';

const origin = 'https://prismorar.com';
const gameId = '019f137d-ee0a-721c-a3f7-5f8588d15062';
const liveGameId = '019f63d8-42d2-71d1-8315-21a14e284183';
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

test('proxies approved game covers without requiring a browser Origin header', async (context) => {
  const originalFetch = globalThis.fetch;
  let upstreamUrl;
  let upstreamHeaders;
  globalThis.fetch = async (input, init) => {
    upstreamUrl = new URL(input);
    upstreamHeaders = new Headers(init.headers);
    return new Response(new Uint8Array([1, 2, 3]), {
      headers: { 'Content-Type': 'image/avif' },
    });
  };
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  const source = new URL('https://multiwin223.com/storage/v3/games/images/cat-mansion.avif');
  const url = new URL('https://worker.example/api/game-image');
  url.searchParams.set('url', source.href);
  const response = await worker.fetch(new Request(url));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'image/avif');
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=86400, s-maxage=604800');
  assert.equal(response.headers.get('Cross-Origin-Resource-Policy'), 'cross-origin');
  assert.equal(upstreamUrl.href, source.href);
  assert.equal(upstreamHeaders.get('Origin'), source.origin);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
});

test('rejects unsupported game image URLs and methods without fetching', async () => {
  const invalidUrl = new URL('https://worker.example/api/game-image');
  invalidUrl.searchParams.set('url', 'https://attacker.example/storage/v3/games/images/file.avif');
  const invalidResponse = await worker.fetch(new Request(invalidUrl));
  assert.equal(invalidResponse.status, 400);

  const invalidPath = new URL('https://worker.example/api/game-image');
  invalidPath.searchParams.set('url', 'https://multiwin223.com/api/secret');
  const pathResponse = await worker.fetch(new Request(invalidPath));
  assert.equal(pathResponse.status, 400);

  const methodResponse = await worker.fetch(
    new Request('https://worker.example/api/game-image', { method: 'POST' }),
  );
  assert.equal(methodResponse.status, 405);
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

test('returns a filtered live casino catalog through the approved mirror endpoint', async (context) => {
  const originalFetch = globalThis.fetch;
  let upstreamUrl;
  let upstreamHeaders;
  globalThis.fetch = async (input, init) => {
    upstreamUrl = new URL(input);
    upstreamHeaders = new Headers(init.headers);
    return Response.json({
      success: true,
      data: {
        games: [
          {
            type: 'game',
            game_id: liveGameId,
            custom_name: 'Blackjack 1',
            name: 'Blackjack',
            provider_name: 'Ninja Gaming Live',
            available: true,
            active: true,
            custom_active: true,
            provider_is_active: true,
            is_test: false,
            cover_image: '/storage/v3/games/images/placeholder.avif',
            custom_background_image: '/storage/v3/games/images/blackjack.avif',
            active_players_count: 3,
          },
          {
            type: 'game',
            game_id: gameId,
            name: 'Disabled table',
            provider_name: 'Inactive provider',
            available: false,
            cover_image: '/storage/disabled.avif',
          },
          {
            type: 'game',
            game_id: gameId,
            name: 'Unsafe image',
            provider_name: 'Provider',
            available: true,
            cover_image: 'https://attacker.example/image.avif',
          },
        ],
      },
    });
  };
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await worker.fetch(
    new Request('https://worker.example/api/live-casino', {
      headers: { Origin: origin },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=300');
  assert.equal(upstreamUrl.href, 'https://multiwin224.com/api/v2/games/pages/mirror/live_casino');
  assert.equal(upstreamHeaders.get('Referer'), 'https://multiwin224.com/games/live_casino');
  assert.deepEqual(await response.json(), {
    success: true,
    data: {
      games: [{
        id: liveGameId,
        name: 'Blackjack 1',
        provider: 'Ninja Gaming Live',
        image: 'https://multiwin224.com/storage/v3/games/images/blackjack.avif',
        activePlayers: 3,
      }],
    },
  });
});

test('handles live casino catalog preflight and rejects unsupported methods', async () => {
  const preflight = await worker.fetch(
    new Request('https://worker.example/api/live-casino', {
      method: 'OPTIONS',
      headers: { Origin: origin },
    }),
  );
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);

  const unsupported = await worker.fetch(
    new Request('https://worker.example/api/live-casino', {
      method: 'POST',
      headers: { Origin: origin },
    }),
  );
  assert.equal(unsupported.status, 405);
  assert.equal(unsupported.headers.get('Cache-Control'), 'no-store');
});

test('validates live casino launch requests and requires server credentials', async () => {
  const invalid = await worker.fetch(
    new Request('https://worker.example/api/live-casino/launch', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ game_id: 'not-a-game' }),
    }),
    {},
  );
  assert.equal(invalid.status, 400);

  const missingCredentials = await worker.fetch(
    new Request('https://worker.example/api/live-casino/launch', {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        'X-Provider-Token': 'attacker-token',
        'X-Provider-Device': 'attacker-device',
      },
      body: JSON.stringify({ game_id: liveGameId }),
    }),
    {},
  );
  assert.equal(missingCredentials.status, 503);

  const preflight = await worker.fetch(
    new Request('https://worker.example/api/live-casino/launch', {
      method: 'OPTIONS',
      headers: { Origin: origin },
    }),
    {},
  );
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS');
  assert.equal(preflight.headers.get('Access-Control-Allow-Headers'), 'Accept, Content-Type');
});

test('launches a live table through the authenticated provider API', async (context) => {
  const originalFetch = globalThis.fetch;
  let upstreamUrl;
  let upstreamInit;
  globalThis.fetch = async (input, init) => {
    upstreamUrl = new URL(input);
    upstreamInit = init;
    return Response.json({
      success: true,
      data: { url: 'https://games.example/session/123' },
    });
  };
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await worker.fetch(
    new Request('https://worker.example/api/live-casino/launch', {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        'X-Provider-Token': 'attacker-token',
        'X-Provider-Device': 'attacker-device',
      },
      body: JSON.stringify({ game_id: liveGameId }),
    }),
    { MULTIWIN_API_TOKEN: 'server-secret', MULTIWIN_DEVICE_ID: 'server-device' },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(upstreamUrl.href, 'https://multiwin224.com/api/v1/games/launch');
  assert.equal(upstreamInit.method, 'POST');
  assert.equal(upstreamInit.redirect, 'manual');
  assert.deepEqual(JSON.parse(upstreamInit.body), { game_id: liveGameId });
  assert.equal(new Headers(upstreamInit.headers).get('Authorization'), 'Bearer server-secret');
  assert.equal(new Headers(upstreamInit.headers).get('X-Device-Id'), 'server-device');
  assert.deepEqual(await response.json(), {
    success: true,
    data: { url: 'https://games.example/session/123' },
  });
});

test('rejects redirected and unsafe live game URLs', async (context) => {
  const originalFetch = globalThis.fetch;
  const credentials = { MULTIWIN_API_TOKEN: 'server-secret', MULTIWIN_DEVICE_ID: 'server-device' };
  const request = () => new Request('https://worker.example/api/live-casino/launch', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ game_id: liveGameId }),
  });
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () => new Response(null, {
    status: 302,
    headers: { Location: 'https://multiwin224.com/another-page' },
  });
  const redirected = await worker.fetch(request(), credentials);
  assert.equal(redirected.status, 502);

  globalThis.fetch = async () => Response.json({
    success: true,
    data: { url: 'http://games.example/session/123' },
  });
  const unsafeUrl = await worker.fetch(request(), credentials);
  assert.equal(unsafeUrl.status, 502);
});

test('proxies the demo launch and returns the secure game URL', async (context) => {
  const originalFetch = globalThis.fetch;
  let upstreamUrl;
  let upstreamHeaders;
  let redirectMode;
  globalThis.fetch = async (input, init) => {
    upstreamUrl = new URL(input);
    upstreamHeaders = new Headers(init.headers);
    redirectMode = init.redirect;
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
  assert.equal(redirectMode, 'manual');
  assert.equal(upstreamHeaders.get('Accept'), 'application/json');
  assert.equal(upstreamHeaders.get('Origin'), origin);
  assert.equal(upstreamHeaders.get('Referer'), `${origin}/`);
  assert.deepEqual(await response.json(), {
    success: true,
    data: { url: 'https://games.example/session/123' },
  });
});

test('follows HTTPS redirects only to the approved provider domains', async (context) => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async (input, init) => {
    requestCount += 1;
    assert.equal(init.redirect, 'manual');
    if (requestCount === 1) {
      return Response.redirect(
        `https://multiwin224.com${new URL(input).pathname}${new URL(input).search}`,
      );
    }
    assert.equal(new URL(input).origin, 'https://multiwin224.com');
    return Response.json({ success: true, data: { url: 'https://games.example/session/123' } });
  };
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await worker.fetch(launchRequest());
  assert.equal(response.status, 200);
  assert.equal(requestCount, 2);
});

test('rejects redirects outside the approved provider domains', async (context) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.redirect('https://attacker.example/api/v1/games/launch-demo-mode/example');
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await worker.fetch(launchRequest());
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    success: false,
    message: 'Oyun sağlayıcısı güvenli olmayan bir yönlendirme yaptı.',
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
