import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const apiUrl = 'https://multiwin223.com/api/v2/games/pages/mirror/casino';
const catalogPath = fileURLToPath(new URL('../catalog.json', import.meta.url));

export function createCompactCatalog(data, updatedAt = new Date().toISOString()) {
  if (!Array.isArray(data?.games) || !Array.isArray(data?.providers) || !Array.isArray(data?.labels)) {
    throw new Error('Oyun sağlayıcısından beklenen katalog verisi alınamadı.');
  }

  const labels = data.labels
    .filter((label) => label.slug !== 'all')
    .map(({ slug, name, position, order }) => [
      slug,
      typeof name === 'string' ? name : name?.tr || name?.en || '',
      position ?? null,
      order ?? null
    ]);
  const labelIndexes = new Map(labels.map(([slug], index) => [slug, index]));
  const providers = [...new Set(data.providers.map((provider) => provider.name).filter(Boolean))];
  const games = data.games
    .filter((game) =>
      game.active &&
      game.available &&
      game.provider_is_active &&
      game.demo_mode_supported === true
    )
    .map((game) => {
      const currencies = Array.isArray(game.supported_currencies) ? game.supported_currencies : [];
      const currency = currencies.includes('USD') ? 'USD' : currencies[0] || '';
      const image = game.custom_cover_image ||
        game.custom_background_image ||
        game.cover_image ||
        game.background_image ||
        '';

      return [
        game.id,
        game.custom_name || game.name,
        game.provider_name,
        image,
        currency,
        (game.labels || [])
          .filter((label) => label.slug !== 'all' && labelIndexes.has(label.slug))
          .map((label) => labelIndexes.get(label.slug))
      ];
    })
    .filter(([id, name, provider, image]) => id && name && provider && image);

  if (games.length === 0) {
    throw new Error('Sağlayıcı kataloğunda gösterilebilir oyun bulunamadı; mevcut katalog korunuyor.');
  }

  return { version: 1, updatedAt, providers, labels, games };
}

async function updateCatalog() {
  const response = await fetch(apiUrl, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Katalog isteği başarısız oldu (HTTP ${response.status}).`);

  const payload = await response.json();
  const catalog = createCompactCatalog(payload?.data);
  await writeFile(catalogPath, `${JSON.stringify(catalog)}\n`, 'utf8');
  console.log(`Güncel katalog yazıldı: ${catalog.games.length} oyun.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await updateCatalog();
}
