const PROVIDER_API_URL = 'https://multiwin223.com/api/v1/games/launch-demo-mode/';
const ALLOWED_ORIGINS = new Set([
  'https://prismorar.com',
  'https://www.prismorar.com',
]);
const GAME_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

function jsonResponse(body, status, origin) {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Accept');
    headers.set('Vary', 'Origin');
  }

  return new Response(JSON.stringify(body), { status, headers });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') {
      return jsonResponse({ status: 'ok' }, 200);
    }

    const origin = request.headers.get('Origin');
    if (!origin || !ALLOWED_ORIGINS.has(origin)) {
      return jsonResponse({ success: false, message: 'Origin is not allowed.' }, 403);
    }

    const gameMatch = url.pathname.match(/^\/api\/game-launch\/([^/]+)$/);
    if (!gameMatch) {
      return jsonResponse({ success: false, message: 'Not found.' }, 404, origin);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Accept',
          'Access-Control-Max-Age': '86400',
          'Vary': 'Origin',
        },
      });
    }

    if (request.method !== 'GET') {
      return jsonResponse(
        { success: false, message: 'Method not allowed.' },
        405,
        origin,
      );
    }

    let gameId;
    try {
      gameId = decodeURIComponent(gameMatch[1]);
    } catch {
      return jsonResponse({ success: false, message: 'Invalid game id.' }, 400, origin);
    }
    if (!GAME_ID_PATTERN.test(gameId)) {
      return jsonResponse({ success: false, message: 'Invalid game id.' }, 400, origin);
    }

    const currency = url.searchParams.get('currency');
    if (!currency || !CURRENCY_PATTERN.test(currency)) {
      return jsonResponse({ success: false, message: 'Invalid currency.' }, 400, origin);
    }

    const providerUrl = new URL(encodeURIComponent(gameId), PROVIDER_API_URL);
    providerUrl.searchParams.set('currency', currency);
    providerUrl.searchParams.set('language', 'tr');

    let providerResponse;
    try {
      providerResponse = await fetch(providerUrl, {
        headers: { Accept: 'application/json' },
        redirect: 'error',
      });
    } catch (error) {
      console.error('Game provider request failed:', error);
      return jsonResponse(
        { success: false, message: 'Oyun sağlayıcısına şu anda bağlanılamıyor.' },
        502,
        origin,
      );
    }

    let payload;
    try {
      payload = await providerResponse.json();
    } catch (error) {
      console.error('Game provider returned invalid JSON:', error);
      return jsonResponse(
        { success: false, message: 'Oyun sağlayıcısından geçersiz yanıt alındı.' },
        502,
        origin,
      );
    }

    const gameUrl = payload?.data?.url;
    let parsedGameUrl;
    try {
      parsedGameUrl = new URL(gameUrl);
    } catch {
      parsedGameUrl = null;
    }
    if (
      !providerResponse.ok ||
      payload?.success !== true ||
      parsedGameUrl?.protocol !== 'https:'
    ) {
      const status = providerResponse.ok
        ? 502
        : providerResponse.status >= 500
          ? 502
          : providerResponse.status;
      return jsonResponse(
        {
          success: false,
          message:
            typeof payload?.message === 'string'
              ? payload.message
              : 'Oyun bağlantısı sağlayıcı tarafından oluşturulamadı.',
        },
        status,
        origin,
      );
    }

    return jsonResponse({ success: true, data: { url: parsedGameUrl.href } }, 200, origin);
  },
};
