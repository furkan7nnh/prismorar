const SOURCE_URL = 'https://multiwin223.com/';
const GAME_LAUNCH_PROXY_URL = 'https://prismorar-game-launch.mylocasyon.workers.dev/api/game-launch/';
const LIVE_CASINO_API_URL = new URL('/api/live-casino', GAME_LAUNCH_PROXY_URL);
const LIVE_CASINO_PAGE_URL = 'https://multiwin224.com/games/live_casino';
const liveCasinoGrid = document.getElementById('liveCasinoGrid');
const liveCasinoStatus = document.getElementById('liveCasinoStatus');
const liveCasinoSearch = document.getElementById('liveCasinoSearch');
const loadMoreLiveCasinoButton = document.getElementById('loadMoreLiveCasino');
const openLiveCasinoLobbyButton = document.getElementById('openLiveCasinoLobby');
let liveCasinoGames = [];
let visibleLiveCasinoCount = 24;
const CATALOG_URL = new URL('catalog.json?v=7', document.baseURI);
const CATALOG_CACHE_NAME = 'prismorar-catalog';
const CATALOG_CACHE_VERSION = 1;
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
const PROFILE_MENU_ITEMS = [
  { title: 'Detaylar', url: '/profile/details' },
  { title: 'Güvenlik', url: 'profile/security' },
  { title: 'Şifre Değiştir', url: 'profile/security/change-password' },
  { title: 'Cihazlar', url: 'profile/security/devices' },
  { title: 'KYC Doğrulaması', url: 'profile/security/kyc-verification' },
  { title: 'Bankacılık', url: 'profile/financial' },
  { title: 'Para Yatırma', url: 'profile/financial/deposit' },
  { title: 'Para Çekme', url: 'profile/financial/withdrawal' },
  { title: 'Ödeme Hesaplarım', url: 'profile/financial/my-payment-accounts' },
  { title: 'Ödemeler', url: 'profile/payments' },
  { title: 'Geçmiş', url: 'profile/history' },
  { title: 'Teklifler', url: 'profile/offers' },
  { title: 'Makbuz Gönder', url: 'profile/financial/send-receipt' },
  { title: 'Oyun Oturumları', url: 'profile/gameplay-sessions' },
  { title: 'Bildirimler', url: 'profile/notifications' },
  { title: 'Bonus Promosyon Kodu', url: 'profile/bonus/promocode' },
  { title: 'Sorumlu Bahis', url: 'profile/responsible-betting' },
  { title: 'Çıkış Yap', url: 'profile/logout' },
  { title: '2FA Doğrulaması', url: 'profile/security/2fa' },
  { title: 'Arkadaş Davet Et', url: 'profile/invite-friends' },
  { title: 'Arama Talep Et', url: 'profile/request-call' }
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
const newGamesGrid = document.getElementById('newGamesGrid');
const popularGamesGrid = document.getElementById('popularGamesGrid');
const providerShowcaseList = document.getElementById('providerShowcaseList');

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

async function requestGameLaunchUrl(game) {
  if (!game.demoSupported) {
    throw new Error('Bu oyun için erişim uygun değil.');
  }

  const launchUrl = new URL(encodeURIComponent(game.id), GAME_LAUNCH_PROXY_URL);
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

function renderProfileMenu() {
  const profileContainer = document.getElementById('profileMenu');
  if (!profileContainer) return;

  profileContainer.innerHTML = PROFILE_MENU_ITEMS.map((item) => `
    <a class="profile-menu-item" href="${escapeHTML(item.url)}" target="_self">
      <span>${escapeHTML(item.title)}</span>
      <strong>›</strong>
    </a>
  `).join('');
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

function renderGameCard(game) {
  const imageSource = new URL(game.image, SOURCE_URL).href;
  const gameLabel = labelNames.get(game.labels.find((label) => label.slug !== 'all')?.slug) || 'Casino';

  return `
    <article class="game-card">
      <div class="game-card-art">
        <img class="game-art-image" src="${escapeHTML(imageSource)}" alt="${escapeHTML(game.name)} oyun görseli" data-game-id="${escapeHTML(game.id)}" loading="lazy" decoding="async">
        <span class="tag">${escapeHTML(gameLabel)}</span>
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
}

function renderHomeShelves() {
  if (newGamesGrid) {
    const newGames = games.filter((game) => game.labels.some((label) => label.slug === 'esr')).slice(0, 8);
    newGamesGrid.innerHTML = newGames.map(renderGameCard).join('');
    newGamesGrid.closest('.home-game-shelf').hidden = newGames.length === 0;
  }

  if (popularGamesGrid) {
    const popularGames = games.filter((game) => game.labels.some((label) => label.slug === 'est')).slice(0, 8);
    popularGamesGrid.innerHTML = popularGames.map(renderGameCard).join('');
    popularGamesGrid.closest('.home-game-shelf').hidden = popularGames.length === 0;
  }

  if (providerShowcaseList) {
    const providerCounts = new Map();
    games.forEach((game) => providerCounts.set(game.provider, (providerCounts.get(game.provider) || 0) + 1));
    providerShowcaseList.innerHTML = [...providerCounts]
      .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0], 'tr'))
      .slice(0, 12)
      .map(([provider, count]) => `
        <button class="provider-showcase-chip" type="button" data-provider="${escapeHTML(provider)}">
          <span class="provider-showcase-mark">${escapeHTML(provider.slice(0, 1).toLocaleUpperCase('tr'))}</span>
          <span>${escapeHTML(provider)}</span>
          <small>${count.toLocaleString('tr-TR')} oyun</small>
        </button>
      `).join('');
  }
}

function renderLiveCasinoCard(game) {
  return `
    <article class="game-card">
      <div class="game-card-art">
        <img
          class="game-art-image"
          src="${escapeHTML(game.image)}"
          alt="${escapeHTML(game.name)} masa görseli"
          loading="lazy"
          decoding="async"
        >
        <span class="tag">Canlı masa</span>
      </div>
      <div class="game-card-content">
        <div class="meta">
          <span class="badge">${escapeHTML(game.provider)}</span>
          <span class="badge">${game.activePlayers.toLocaleString('tr-TR')} aktif oyuncu</span>
        </div>
        <h3>${escapeHTML(game.name)}</h3>
        <div class="game-card-footer">
          <span class="source-game-id" title="Oyun kimliği">${escapeHTML(game.id)}</span>
          <button class="play-btn live-game-link" type="button" data-live-casino-open>
            Lobide masalar&#305; a&#231;
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderLiveCasinoGames() {
  if (!liveCasinoGrid || !liveCasinoStatus || !loadMoreLiveCasinoButton) return;

  const searchTerm = liveCasinoSearch?.value.trim().toLocaleLowerCase('tr') || '';
  const filteredGames = liveCasinoGames.filter((game) =>
    game.name.toLocaleLowerCase('tr').includes(searchTerm)
    || game.provider.toLocaleLowerCase('tr').includes(searchTerm)
  );
  const visibleGames = filteredGames.slice(0, visibleLiveCasinoCount);

  liveCasinoGrid.innerHTML = visibleGames.map(renderLiveCasinoCard).join('');
  if (!filteredGames.length) {
    liveCasinoGrid.innerHTML = '<p class="empty-state">Aramana uygun canlı masa bulunamadı.</p>';
  }

  liveCasinoStatus.textContent = filteredGames.length === liveCasinoGames.length
    ? `${filteredGames.length.toLocaleString('tr-TR')} canlı masa listelendi.`
    : `${visibleGames.length.toLocaleString('tr-TR')} / ${filteredGames.length.toLocaleString('tr-TR')} canlı masa gösteriliyor.`;
  loadMoreLiveCasinoButton.hidden = visibleGames.length >= filteredGames.length;
  if (!loadMoreLiveCasinoButton.hidden) {
    loadMoreLiveCasinoButton.textContent =
      `Daha fazla canlı masa göster (${(filteredGames.length - visibleGames.length).toLocaleString('tr-TR')} kaldı)`;
  }
}

async function loadLiveCasinoGames() {
  if (!liveCasinoGrid || !liveCasinoStatus) return;

  try {
    const response = await fetch(LIVE_CASINO_API_URL, {
      headers: { Accept: 'application/json' },
      cache: 'no-cache',
      credentials: 'omit',
    });
    const payload = await response.json();
    if (!response.ok || payload?.success !== true || !Array.isArray(payload?.data?.games)) {
      throw new Error(payload?.message || `Canlı masalar yüklenemedi (HTTP ${response.status}).`);
    }

    liveCasinoGames = payload.data.games.filter((game) =>
      typeof game.id === 'string'
      && typeof game.name === 'string'
      && typeof game.provider === 'string'
      && typeof game.image === 'string'
      && new URL(game.image).origin === 'https://multiwin224.com'
      && Number.isSafeInteger(game.activePlayers)
    );
    renderLiveCasinoGames();
  } catch (error) {
    console.error('Canlı casino masaları yüklenemedi.', error);
    liveCasinoStatus.textContent = `Canlı masalar yüklenemedi: ${error.message}`;
    liveCasinoGrid.innerHTML =
      '<p class="api-error">Canlı masa listesine şu anda erişilemiyor. Biraz sonra yeniden dene.</p>';
  }
}

if (liveCasinoSearch) {
  liveCasinoSearch.addEventListener('input', () => {
    visibleLiveCasinoCount = 24;
    renderLiveCasinoGames();
  });
}

if (loadMoreLiveCasinoButton) {
  loadMoreLiveCasinoButton.addEventListener('click', () => {
    visibleLiveCasinoCount += 24;
    renderLiveCasinoGames();
  });
}

if (liveCasinoGrid) {
  liveCasinoGrid.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    if (!event.target.closest('[data-live-casino-open]')) return;
    openLiveCasinoLobby();
  });

  loadLiveCasinoGames().catch((error) => {
    console.error('Canlı casino masaları başlatılamadı.', error);
  });
}

if (openLiveCasinoLobbyButton) {
  openLiveCasinoLobbyButton.addEventListener('click', openLiveCasinoLobby);
}

function openLiveCasinoLobby() {
  if (!modal || !modalContent) return;

  modal.classList.add('is-playing');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  modalContent.innerHTML = `
    <div class="game-player-toolbar">
      <div>
        <h3 id="modalTitle">Canl&#305; Casino Lobisi</h3>
        <p id="liveCasinoLobbyStatus" role="status">Lobi bu pencerede açılır. Oynamak için sağlayıcı hesabıyla giriş gerekebilir.</p>
      </div>
    </div>
    <iframe
      class="game-player-frame"
      src="${LIVE_CASINO_PAGE_URL}"
      title="Canl&#305; casino masalar&#305;"
      allow="autoplay; fullscreen; picture-in-picture"
      allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"
      sandbox="allow-forms allow-scripts allow-same-origin allow-pointer-lock"
    ></iframe>
  `;

  const frame = modalContent.querySelector('.game-player-frame');
  const status = modalContent.querySelector('#liveCasinoLobbyStatus');
  frame.addEventListener('error', () => {
    if (status) status.textContent = 'Canl\u0131 casino lobisi y\u00fcklenemedi. Daha sonra yeniden dene.';
  }, { once: true });
}

if (providerShowcaseList) {
  providerShowcaseList.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const providerButton = event.target.closest('[data-provider]');
    if (!providerButton) return;
    providerFilter.value = providerButton.dataset.provider;
    visibleGameCount = getGameBatchSize();
    renderGames();
    document.getElementById('games').scrollIntoView({ behavior: 'smooth' });
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
      referrerpolicy="strict-origin-when-cross-origin"
      sandbox="allow-forms allow-scripts allow-same-origin allow-pointer-lock"></iframe>
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
  renderHomeShelves();
  renderGames();
}

async function loadGames() {
  apiStatus.textContent = 'Katalog y\u00fckleniyor...';

  const cachedData = await readCatalogCache();
  if (Array.isArray(cachedData?.games) && cachedData.games.length > 0) {
    displayCatalog(cachedData);
  }

  try {
    const response = await fetch(CATALOG_URL, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Katalog dosyas\u0131 y\u00fcklenemedi (HTTP ${response.status}).`);
    const data = decodeCatalog(await response.json());
    if (!Array.isArray(data?.games) || data.games.length === 0) {
      throw new Error('Katalog dosyas\u0131nda oyun bulunamad\u0131.');
    }

    displayCatalog(data);
    await writeCatalogCache(data);
    const updatedAt = Date.parse(data.updatedAt);
    apiStatus.textContent = Number.isFinite(updatedAt)
      ? `Oyun katalo\u011fu g\u00fcncel (${new Date(updatedAt).toLocaleDateString('tr-TR')}).`
      : 'Oyun katalo\u011fu y\u00fcklendi.';
  } catch (error) {
    console.error('Oyun katalo\u011fu y\u00fcklenemedi.', error);
    if (Array.isArray(cachedData?.games) && cachedData.games.length > 0) {
      apiStatus.textContent = `Kay\u0131tl\u0131 oyun listesi g\u00f6steriliyor; g\u00fcncel katalog al\u0131namad\u0131: ${error.message}`;
      return;
    }

    apiStatus.textContent = `Oyun listesi y\u00fcklenemedi: ${error.message}`;
    gameGrid.innerHTML = '<p class="api-error">Oyun listesine eri\u015filemedi. Ba\u011flant\u0131n\u0131 kontrol edip sayfay\u0131 yenileyebilirsin.</p>';
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
renderProfileMenu();
loadGames().catch((error) => console.error('Oyun kataloğu yüklenemedi.', error));