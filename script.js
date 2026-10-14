const SOURCE_URL = 'https://multiwin223.com/';
const API_URL = new URL('/api/v2/games/pages/mirror/casino', SOURCE_URL);
const GAME_LAUNCH_API_URL = new URL('/api/v1/games/launch-demo-mode/', SOURCE_URL);
const CATALOG_URL = new URL('catalog.json?v=6', document.baseURI);
const CATALOG_CACHE_NAME = 'prismorar-catalog';
const CATALOG_CACHE_VERSION = 1;
const CATALOG_REFRESH_INTERVAL = 4 * 60 * 60 * 1000;
const EMPTY_LABELS = [];
const EMPTY_CURRENCIES = [];
const EMPTY_TAGS = [];
const GAME_TAG_LABELS = new Map([['roulette', 'Rulet']]);
const PAYMENT_METHODS = [
  {
    name: 'Multiwin Kripto',
    type_name: 'CRYPTO',
    min_deposit: 0,
    max_deposit: null,
    description: 'Kripto ile hızlı ve güvenli yatırım.'
  },
  {
    name: 'Multiwin Havale',
    type_name: 'BANKING',
    min_deposit: 100,
    max_deposit: 5000000,
    description: 'Havale / EFT ile doğrudan yatırma.'
  },
  {
    name: 'Ecopayz',
    type_name: 'Ecopays',
    min_deposit: 100,
    max_deposit: 5000000,
    description: 'Elektronik cüzdan ile anında işlem.'
  },
  {
    name: 'Parakart',
    type_name: 'PARAKART',
    min_deposit: 100,
    max_deposit: 5000000,
    description: 'Kısa süreli ve güvenli ödeme seçeneği.'
  }
];

const gameGrid = document.getElementById('gameGrid');
const modal = document.getElementById('gameModal');
const modalContent = document.getElementById('modalContent');
const searchInput = document.getElementById('searchInput');
const providerFilter = document.getElementById('providerFilter');
const labelFilter = document.getElementById('labelFilter');
const categoryChips = document.getElementById('categoryChips');
const apiStatus = document.getElementById('apiStatus');
const loadMoreButton = document.getElementById('loadMoreGames');
const gameTotal = document.getElementById('gameTotal');
const availableTotal = document.getElementById('availableTotal');
const featuredCards = document.querySelectorAll('[data-featured-game]');

const DESKTOP_GAME_BATCH_SIZE = 48;
const MOBILE_GAME_BATCH_SIZE = 12;
let games = [];
let labelNames = new Map();
let catalogProviders = [];
let catalogLabels = [];
let visibleGameCount = getGameBatchSize();

function getGameBatchSize() {
  return window.matchMedia('(max-width: 720px)').matches
    ? MOBILE_GAME_BATCH_SIZE
    : DESKTOP_GAME_BATCH_SIZE;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function getLocalizedName(value) {
  if (typeof value === 'string') return value;
  return value?.tr || value?.en || '';
}

function normalizeGame(record) {
  const name = record.custom_name || record.name;
  if (!record.id || !name || !record.provider_name) return null;

  const imagePath = record.custom_cover_image
    || record.cover_image
    || record.custom_background_image
    || record.background_image;

  if (!imagePath) return null;

  const labels = Array.isArray(record.labels)
    ? record.labels.map((label) => typeof label === 'string' ? { slug: label } : label)
    : [];
  const hasRouletteTag = Array.isArray(record.tags) && record.tags.includes('roulette');
  const legacyRouletteName = !Array.isArray(record.tags) && /(?:^|[\s-])(rulet|roulette)(?:$|[\s-])/i.test(name);
  if ((hasRouletteTag || legacyRouletteName) && !labels.some((label) => label.slug === 'roulette')) {
    labels.push({ slug: 'roulette' });
  }

  return {
    id: record.id,
    name,
    provider: record.provider_name,
    image: imagePath || '',
    demoSupported: record.demo_mode_supported === true,
    supportedCurrencies: Array.isArray(record.supported_currencies)
      ? record.supported_currencies
      : EMPTY_CURRENCIES,
    labels: labels.length ? labels : EMPTY_LABELS
  };
}

function decodeCatalog(data) {
  if (data?.version !== 1) return data;

  const labels = data.labels.map(([slug, name, position, order]) => ({ slug, name, position, order }));
  return {
    updatedAt: data.updatedAt,
    providers: data.providers.map((name) => ({ name })),
    labels,
    games: data.games.map(([id, name, provider, image, currency, gameLabels]) => ({
      id,
      name,
      provider_name: provider,
      cover_image: image,
      demo_mode_supported: true,
      supported_currencies: currency ? [currency] : [],
      labels: gameLabels.map((labelIndex) => labels[labelIndex]?.slug || labelIndex)
    }))
  };
}

function openCatalogCache() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CATALOG_CACHE_NAME, CATALOG_CACHE_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore('catalog');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Katalog önbelleği açılamadı.'));
  });
}

async function readCatalogCache() {
  let database;
  try {
    database = await openCatalogCache();
    return await new Promise((resolve, reject) => {
      const request = database.transaction('catalog', 'readonly').objectStore('catalog').get('games');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Katalog önbelleği okunamadı.'));
    });
  } catch (error) {
    console.warn('Katalog önbelleği okunamadı; dosyadaki katalog kullanılacak.', error);
    return null;
  } finally {
    if (database) database.close();
  }
}

async function writeCatalogCache(data) {
  let database;
  try {
    database = await openCatalogCache();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('catalog', 'readwrite');
      transaction.objectStore('catalog').put(data, 'games');
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Katalog önbelleğe yazılamadı.'));
      transaction.onabort = () => reject(transaction.error || new Error('Katalog önbelleğe yazılamadı.'));
    });
  } catch (error) {
    console.warn('Katalog önbelleğe kaydedilemedi.', error);
  } finally {
    if (database) database.close();
  }
}

function createCatalogData(data) {
  if (!Array.isArray(data?.games)) {
    throw new Error('Yanıt içinde oyun listesi bulunamadı.');
  }

  return {
    updatedAt: new Date().toISOString(),
    providers: (data.providers || []).map((provider) => ({ name: provider.name })),
    labels: (data.labels || [])
      .filter((label) => label.slug !== 'all')
      .map(({ slug, name, position, order }) => ({
        slug,
        name: getLocalizedName(name),
        position,
        order
      })),
    games: data.games
      .filter((record) => record.active && record.available && record.provider_is_active && record.demo_mode_supported === true)
      .map((record) => {
        const currencies = Array.isArray(record.supported_currencies)
          ? record.supported_currencies
          : EMPTY_CURRENCIES;
        const currency = currencies.includes('USD') ? 'USD' : currencies[0];
        return {
          id: record.id,
          name: record.custom_name || record.name,
          provider_name: record.provider_name,
          cover_image: record.custom_cover_image
            || record.cover_image
            || record.custom_background_image
            || record.background_image
            || '',
          demo_mode_supported: true,
          supported_currencies: currency ? [currency] : [],
          labels: (record.labels || [])
            .filter((label) => label.slug !== 'all')
            .map(({ slug }) => slug),
          tags: Array.isArray(record.tags)
            ? record.tags.filter((tag) => GAME_TAG_LABELS.has(tag))
            : EMPTY_TAGS
        };
      })
      .filter((record) => record.id && record.name && record.provider_name && record.cover_image)
  };
}

async function fetchLiveCatalog() {
  const response = await fetch(API_URL, {
    headers: { Accept: 'application/json' },
    credentials: 'omit'
  });
  if (!response.ok) throw new Error(`İstek başarısız: HTTP ${response.status}`);
  const payload = await response.json();
  return createCatalogData(payload?.data);
}

async function requestGameLaunchUrl(game) {
  if (!game.demoSupported) {
    throw new Error('Bu oyun için erişim uygun değil.');
  }

  const launchUrl = new URL(encodeURIComponent(game.id), GAME_LAUNCH_API_URL);
  const currency = game.supportedCurrencies.includes('USD')
    ? 'USD'
    : game.supportedCurrencies[0];
  if (!currency) {
    throw new Error('Bu oyun için desteklenen para birimi API kataloğunda bulunamadı.');
  }
  launchUrl.searchParams.set('currency', currency);
  launchUrl.searchParams.set('language', 'tr');

  const response = await fetch(launchUrl, {
    headers: { Accept: 'application/json' },
    credentials: 'omit'
  });
  const payload = await response.json();
  const gameUrl = payload?.data?.url;
  if (!response.ok || payload?.success !== true || typeof gameUrl !== 'string') {
    if (response.status >= 500) {
      throw new Error(`Oyun sağlayıcısı bağlantıyı reddetti (HTTP ${response.status}). Daha sonra tekrar dene.`);
    }
    throw new Error(payload?.message || `Bağlantı kurulamadı (HTTP ${response.status}).`);
  }

  const parsedGameUrl = new URL(gameUrl);
  if (parsedGameUrl.protocol !== 'https:') {
    throw new Error('Launch API güvenli olmayan bir oyun adresi döndürdü.');
  }
  return parsedGameUrl.href;
}

function populateFilters(providers, labels) {
  const previousProvider = providerFilter.value;
  const previousLabel = labelFilter.value;
  labelNames = new Map(labels.map((label) => [label.slug, getLocalizedName(label.name)]));
  const providerOptions = [...new Set(providers.map((provider) => provider.name).filter(Boolean))].sort();
  providerFilter.replaceChildren(new Option('Tüm sağlayıcılar', 'all'));
  providerFilter.insertAdjacentHTML(
    'beforeend',
    providerOptions.map((provider) => `<option value="${escapeHTML(provider)}">${escapeHTML(provider)}</option>`).join('')
  );

  const categoryOptions = labels
    .filter((label) => label.slug !== 'all' && getLocalizedName(label.name))
    .sort((a, b) => (a.position ?? a.order ?? 0) - (b.position ?? b.order ?? 0));
  const categoryCounts = new Map();
  games.forEach((game) => {
    game.labels.forEach((label) => {
      if (label.slug !== 'all') {
        categoryCounts.set(label.slug, (categoryCounts.get(label.slug) || 0) + 1);
      }
    });
  });
  labelFilter.replaceChildren(new Option('Tüm kategoriler', 'all'));
  labelFilter.insertAdjacentHTML(
    'beforeend',
    categoryOptions.map((label) => `<option value="${escapeHTML(label.slug)}">${escapeHTML(getLocalizedName(label.name))}</option>`).join('')
  );
  categoryChips.innerHTML = [
    '<button class="category-chip active" type="button" data-category="all">Tüm kategoriler</button>',
    ...categoryOptions.map((label) => {
      const categoryName = getLocalizedName(label.name);
      const count = categoryCounts.get(label.slug) || 0;
      return `<button class="category-chip" type="button" data-category="${escapeHTML(label.slug)}">${escapeHTML(categoryName)} <span>${count.toLocaleString('tr-TR')}</span></button>`;
    })
  ].join('');
  if (providerOptions.includes(previousProvider)) providerFilter.value = previousProvider;
  if (categoryOptions.some((label) => label.slug === previousLabel)) labelFilter.value = previousLabel;
}

function getFilteredGames() {
  const searchTerm = searchInput.value.trim().toLocaleLowerCase('tr');
  const selectedProvider = providerFilter.value;
  const selectedLabel = labelFilter.value;

  return games.filter((game) => {
    const matchesSearch = !searchTerm
      || game.name.toLocaleLowerCase('tr').includes(searchTerm)
      || game.provider.toLocaleLowerCase('tr').includes(searchTerm);
    const matchesProvider = selectedProvider === 'all' || game.provider === selectedProvider;
    const matchesLabel = selectedLabel === 'all' || game.labels.some((label) => label.slug === selectedLabel);
    return matchesSearch && matchesProvider && matchesLabel;
  });
}

function renderPaymentMethods() {
  const paymentContainer = document.getElementById('paymentMethods');
  if (!paymentContainer) return;

  paymentContainer.innerHTML = PAYMENT_METHODS.map((method) => {
    const minDeposit = method.min_deposit > 0 ? `${method.min_deposit.toLocaleString('tr-TR')} ₺` : 'Özel tutar';
    const maxDeposit = method.max_deposit ? `${method.max_deposit.toLocaleString('tr-TR')} ₺` : 'Limitsiz';
    return `
      <article class="payment-card">
        <div class="payment-head">
          <span class="payment-type">${escapeHTML(method.type_name)}</span>
          <span class="payment-icon">${escapeHTML(method.name.charAt(0).toUpperCase())}</span>
        </div>
        <h3>${escapeHTML(method.name)}</h3>
        <p>${escapeHTML(method.description)}</p>
        <div class="payment-meta">
          <span>Min: ${escapeHTML(minDeposit)}</span>
          <span>Max: ${escapeHTML(maxDeposit)}</span>
        </div>
      </article>
    `;
  }).join('');
}

function renderFeaturedGames() {
  featuredCards.forEach((card) => {
    const featuredName = card.dataset.featuredGame.toLocaleLowerCase('tr');
    const game = games.find((item) => item.name.toLocaleLowerCase('tr') === featuredName);
    const image = card.querySelector('.showcase-art-image');
    if (!game?.image) {
      image.hidden = true;
      return;
    }

    image.src = new URL(game.image, SOURCE_URL).href;
    image.alt = `${game.name} oyun görseli`;
  });
}

function renderGames() {
  const filteredGames = getFilteredGames();
  const visibleGames = filteredGames.slice(0, visibleGameCount);
  categoryChips.querySelectorAll('[data-category]').forEach((chip) => {
    const isActive = chip.dataset.category === labelFilter.value;
    chip.classList.toggle('active', isActive);
    chip.setAttribute('aria-pressed', String(isActive));
  });

  gameGrid.innerHTML = visibleGames.map((game) => {
    const imageSource = new URL(game.image, SOURCE_URL).href;

    return `
      <article class="game-card">
        <div class="game-card-art">
          <img class="game-art-image" src="${escapeHTML(imageSource)}" alt="${escapeHTML(game.name)} oyun görseli" data-game-id="${escapeHTML(game.id)}" loading="lazy" decoding="async">
          <span class="tag">${escapeHTML(labelNames.get(game.labels.find((label) => label.slug !== 'all')?.slug) || 'Casino')}</span>
        </div>
        <div class="game-card-content">
          <div class="meta">
            <span class="badge">${escapeHTML(game.provider)}</span>
            <span class="badge">Hazır</span>
          </div>
          <h3>${escapeHTML(game.name)}</h3>
          <div class="game-card-footer">
            <span class="source-game-id" title="Oyun kimliği">${escapeHTML(game.id)}</span>
            <button class="play-btn" type="button" data-launch="${escapeHTML(game.id)}">Oyunu başlat</button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  if (!filteredGames.length) {
    gameGrid.innerHTML = '<p class="empty-state">Seçimlerine uygun oyun bulunamadı.</p>';
  }

  apiStatus.textContent = filteredGames.length > visibleGames.length
    ? `${visibleGames.length.toLocaleString('tr-TR')} / ${filteredGames.length.toLocaleString('tr-TR')} oyun gösteriliyor.`
    : `${filteredGames.length.toLocaleString('tr-TR')} oyun gösteriliyor.`;
  loadMoreButton.hidden = visibleGames.length >= filteredGames.length;
  if (!loadMoreButton.hidden) {
    const remainingGames = filteredGames.length - visibleGames.length;
    loadMoreButton.textContent = `Daha fazla oyun göster (${remainingGames.toLocaleString('tr-TR')} kaldı)`;
  }
}

gameGrid.addEventListener('error', (event) => {
  if (!(event.target instanceof HTMLImageElement) || !event.target.classList.contains('game-art-image')) return;

  games = games.filter((game) => game.id !== event.target.dataset.gameId);
  gameTotal.textContent = games.length.toLocaleString('tr-TR');
  availableTotal.textContent = games.filter((game) => game.demoSupported).length.toLocaleString('tr-TR');
  populateFilters(catalogProviders, catalogLabels);
  renderGames();
}, true);

function openGamePlayer(gameId) {
  const game = games.find((item) => item.id === gameId);
  if (!game) return;

  modal.classList.add('is-playing');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  modalContent.innerHTML = `
    <div class="game-player-toolbar">
      <div>
        <h3 id="modalTitle">${escapeHTML(game.name)}</h3>
        <p id="playerStatus" role="status">Oyun açılıyor...</p>
      </div>
    </div>
    <iframe
      class="game-player-frame"
      src="about:blank"
      title="${escapeHTML(game.name)} oyunu"
      allow="autoplay; fullscreen; gamepad"
      allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"></iframe>
  `;

  const frame = modalContent.querySelector('.game-player-frame');
  frame.addEventListener('load', () => {
    const status = modalContent.querySelector('#playerStatus');
    if (status) status.textContent = 'Oyun açıldı.';
  }, { once: true });
  apiStatus.textContent = `${game.name} açılıyor...`;
  requestGameLaunchUrl(game)
    .then((launchUrl) => {
      frame.src = launchUrl;
      const status = modalContent.querySelector('#playerStatus');
      if (status) status.textContent = 'Oyun yükleniyor...';
    })
    .catch((error) => {
      frame.remove();
      const status = modalContent.querySelector('#playerStatus');
      if (status) status.textContent = `Oyun açılamadı: ${error.message}`;
      apiStatus.textContent = `${game.name} açılamadı: ${error.message}`;
    });
}

function closeModal() {
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  modal.classList.remove('is-playing');
  modalContent.replaceChildren();
}

function displayCatalog(data) {
  games = data.games.map(normalizeGame).filter(Boolean);
  catalogProviders = data.providers || [];
  catalogLabels = [...(data.labels || [])];
  const catalogLabelSlugs = new Set(catalogLabels.map((label) => label.slug));
  for (const [slug, name] of GAME_TAG_LABELS) {
    if (games.some((game) => game.labels.some((label) => label.slug === slug)) && !catalogLabelSlugs.has(slug)) {
      catalogLabels.push({ slug, name });
    }
  }
  populateFilters(catalogProviders, catalogLabels);
  gameTotal.textContent = games.length.toLocaleString('tr-TR');
  availableTotal.textContent = games.filter((game) => game.demoSupported).length.toLocaleString('tr-TR');
  renderFeaturedGames();
  renderGames();
}

function scheduleLiveRefresh() {
  const refresh = async () => {
    try {
      const data = await fetchLiveCatalog();
      displayCatalog(data);
      await writeCatalogCache(data);
    } catch (error) {
      console.error('Canlı katalog güncellenemedi.', error);
      apiStatus.textContent = 'Kayıtlı oyun listesi gösteriliyor; canlı katalog güncellenemedi.';
    }
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(refresh, { timeout: 8000 });
  } else {
    window.setTimeout(refresh, 3000);
  }
}

async function loadGames() {
  apiStatus.textContent = 'Katalog yükleniyor...';

  let initialData = await readCatalogCache();
  const loadedFromCache = Array.isArray(initialData?.games);
  if (!Array.isArray(initialData?.games)) {
    try {
      const response = await fetch(CATALOG_URL);
      if (!response.ok) throw new Error(`Katalog dosyası yüklenemedi (HTTP ${response.status}).`);
      initialData = decodeCatalog(await response.json());
    } catch (error) {
      console.warn('Hazır katalog dosyası kullanılamadı; canlı katalog deneniyor.', error);
    }
  }

  if (Array.isArray(initialData?.games)) {
    displayCatalog(initialData);
    if (!loadedFromCache) await writeCatalogCache(initialData);
    const updatedAt = Date.parse(initialData.updatedAt);
    if (!Number.isFinite(updatedAt) || Date.now() - updatedAt >= CATALOG_REFRESH_INTERVAL) {
      scheduleLiveRefresh();
    }
    return;
  }

  try {
    const data = await fetchLiveCatalog();
    displayCatalog(data);
    await writeCatalogCache(data);
  } catch (error) {
    apiStatus.textContent = `Oyun listesi yüklenemedi: ${error.message}`;
    gameGrid.innerHTML = '<p class="api-error">Oyun listesine erişilemedi. Sayfayı yenileyerek tekrar deneyebilirsin.</p>';
    throw error;
  }
}

searchInput.addEventListener('input', () => {
  visibleGameCount = getGameBatchSize();
  renderGames();
});

providerFilter.addEventListener('change', () => {
  visibleGameCount = getGameBatchSize();
  renderGames();
});

labelFilter.addEventListener('change', () => {
  visibleGameCount = getGameBatchSize();
  renderGames();
});

loadMoreButton.addEventListener('click', () => {
  visibleGameCount += getGameBatchSize();
  renderGames();
});

categoryChips.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const chip = event.target.closest('[data-category]');
  if (!chip) return;
  labelFilter.value = chip.dataset.category;
  visibleGameCount = getGameBatchSize();
  renderGames();
});

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const launchButton = event.target.closest('[data-launch]');
  if (launchButton) openGamePlayer(launchButton.dataset.launch);
  if (event.target.matches('[data-close="true"]')) closeModal();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
});

renderPaymentMethods();
loadGames().catch((error) => console.error('Oyun kataloğu yüklenemedi.', error));
