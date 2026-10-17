const PROVIDER_API_URL = 'https://multiwin223.com/api/v1/games/launch-demo-mode/';
const LIVE_CASINO_API_URL =
  'https://multiwin224.com/api/v2/games/pages/mirror/live_casino';
const LIVE_GAME_LAUNCH_API_URL = 'https://multiwin224.com/api/v1/games/launch';
const ALLOWED_ORIGINS = new Set([
  'https://prismorar.com',
  'https://www.prismorar.com',
]);
const GAME_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const PROVIDER_HOSTS = new Set(['multiwin223.com', 'multiwin224.com']);
const MAX_PROVIDER_REDIRECTS = 3;

function jsonResponse(body, status, origin) {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Accept, Content-Type');
    headers.set('Vary', 'Origin');
  }

  return new Response(JSON.stringify(body), { status, headers });
}

function liveCasinoResponse(body, status, origin) {
  const response = jsonResponse(body, status, origin);
  if (status === 200) {
    response.headers.set('Cache-Control', 'public, max-age=300');
  }
  return response;
}

function normalizeLiveGame(record) {
  const id = record.game_id || record.id;
  const name = record.custom_name || record.name;
  const provider = record.provider_name;
  const image =
    record.custom_cover_image ||
    record.custom_background_image ||
    record.cover_image ||
    record.background_image;

  if (
    record.type !== 'game' ||
    record.available !== true ||
    record.active === false ||
    record.custom_active === false ||
    record.provider_is_active === false ||
    record.is_test === true ||
    typeof id !== 'string' ||
    !GAME_ID_PATTERN.test(id) ||
    typeof name !== 'string' ||
    typeof provider !== 'string' ||
    typeof image !== 'string' ||
    !image.startsWith('/storage/')
  ) {
    return null;
  }

  return {
    id,
    name,
    provider,
    image: `https://multiwin224.com${image}`,
    activePlayers: Number.isSafeInteger(record.active_players_count)
      ? record.active_players_count
      : 0,
  };
}

async function fetchProvider(url, headers) {
  for (let redirectCount = 0; redirectCount <= MAX_PROVIDER_REDIRECTS; redirectCount += 1) {
    const response = await fetch(url, { headers, redirect: 'manual' });
    if (response.status < 300 || response.status >= 400) {
      return response;
    }

    const location = response.headers.get('Location');
    if (!location || redirectCount === MAX_PROVIDER_REDIRECTS) {
      return null;
    }

    const redirectUrl = new URL(location, url);
    if (
      redirectUrl.protocol !== 'https:' ||
      !PROVIDER_HOSTS.has(redirectUrl.hostname) ||
      (redirectUrl.port && redirectUrl.port !== '443') ||
      redirectUrl.username ||
      redirectUrl.password ||
      redirectUrl.pathname !== url.pathname ||
      redirectUrl.searchParams.get('currency') !== url.searchParams.get('currency') ||
      redirectUrl.searchParams.get('language') !== url.searchParams.get('language')
    ) {
      return null;
    }
    url = redirectUrl;
  }

  return null;
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') {
      return jsonResponse({ status: 'ok' }, 200);
    }
    const origin = request.headers.get('Origin');
    if (!origin || !ALLOWED_ORIGINS.has(origin)) {
      return jsonResponse({ success: false, message: 'Origin is not allowed.' }, 403);
    }

    if (url.pathname === '/api/live-casino') {
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
        return liveCasinoResponse(
          { success: false, message: 'Method not allowed.' },
          405,
          origin,
        );
      }

      try {
        const providerResponse = await fetchProvider(
          new URL(LIVE_CASINO_API_URL),
          {
            Accept: 'application/json',
            Origin: 'https://multiwin224.com',
            Referer: 'https://multiwin224.com/games/live_casino',
          },
        );
        if (!providerResponse?.ok) {
          return liveCasinoResponse(
            { success: false, message: 'Canlı oyun sağlayıcısından liste alınamadı.' },
            502,
            origin,
          );
        }

        const payload = await providerResponse.json();
        if (payload?.success === false || !Array.isArray(payload?.data?.games)) {
          return liveCasinoResponse(
            { success: false, message: 'Canlı oyun sağlayıcısından geçersiz liste alındı.' },
            502,
            origin,
          );
        }

        const games = payload.data.games.map(normalizeLiveGame).filter(Boolean);
        return liveCasinoResponse({ success: true, data: { games } }, 200, origin);
      } catch (error) {
        console.error('Live casino catalog request failed:', error);
        return liveCasinoResponse(
          { success: false, message: 'Canlı oyun sağlayıcısına şu anda bağlanılamıyor.' },
          502,
          origin,
        );
      }
    }

    if (url.pathname === '/api/live-casino/launch') {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Accept, Content-Type',
            'Access-Control-Max-Age': '86400',
            'Vary': 'Origin',
          },
        });
      }
      if (request.method !== 'POST') {
        return jsonResponse(
          { success: false, message: 'Method not allowed.' },
          405,
          origin,
        );
      }

      let payload;
      try {
        payload = await request.json();
      } catch {
        return jsonResponse(
          { success: false, message: 'Geçersiz masa başlatma isteği.' },
          400,
          origin,
        );
      }
      if (typeof payload?.game_id !== 'string' || !GAME_ID_PATTERN.test(payload.game_id)) {
        return jsonResponse(
          { success: false, message: 'Geçerli bir game_id gönderin.' },
          400,
          origin,
        );
      }

      const token = env?.MULTIWIN_API_TOKEN;
      const deviceId = env?.MULTIWIN_DEVICE_ID;
      if (!token || !deviceId) {
        return jsonResponse(
          { success: false, message: 'Masa başlatma için sağlayıcı hesabı sunucuda yapılandırılmamış.' },
          503,
          origin,
        );
      }

      let providerResponse;
      try {
        providerResponse = await fetch(LIVE_GAME_LAUNCH_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Device-Id': deviceId,
            'X-Device-Type': 'desktop',
            'Accept-Language': 'tr',
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Origin: 'https://multiwin224.com',
            Referer: 'https://multiwin224.com/games/live_casino',
          },
          body: JSON.stringify({ game_id: payload.game_id }),
          redirect: 'manual',
          signal: AbortSignal.timeout(15000),
        });
      } catch (error) {
        console.error('Live casino launch request failed:', error);
        return jsonResponse(
          { success: false, message: 'Masa sağlayıcısına şu anda bağlanılamıyor.' },
          502,
          origin,
        );
      }

      if (providerResponse.status >= 300 && providerResponse.status < 400) {
        return jsonResponse(
          { success: false, message: 'Masa sağlayıcısı beklenmeyen bir yönlendirme yanıtı verdi.' },
          502,
          origin,
        );
      }

      let providerPayload;
      try {
        providerPayload = await providerResponse.json();
      } catch (error) {
        console.error('Live casino launch returned invalid JSON:', error);
        return jsonResponse(
          { success: false, message: 'Masa sağlayıcısından geçersiz yanıt alındı.' },
          502,
          origin,
        );
      }

      let gameUrl;
      try {
        gameUrl = new URL(providerPayload?.data?.url);
      } catch {
        gameUrl = null;
      }
      if (
        !providerResponse.ok ||
        providerPayload?.success !== true ||
        gameUrl?.protocol !== 'https:' ||
        gameUrl.username ||
        gameUrl.password
      ) {
        const status = providerResponse.ok
          ? 502
          : providerResponse.status >= 500
            ? 502
            : providerResponse.status;
        return jsonResponse(
          {
            success: false,
            message: typeof providerPayload?.message === 'string'
              ? providerPayload.message
              : 'Masa sağlayıcı tarafından başlatılamadı.',
          },
          status,
          origin,
        );
      }

      return jsonResponse(
        { success: true, data: { url: gameUrl.href } },
        200,
        origin,
      );
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
      providerResponse = await fetchProvider(providerUrl, {
        Accept: 'application/json',
        Origin: origin,
        Referer: `${origin}/`,
      });
      if (!providerResponse) {
        return jsonResponse(
          { success: false, message: 'Oyun sağlayıcısı güvenli olmayan bir yönlendirme yaptı.' },
          502,
          origin,
        );
      }
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
