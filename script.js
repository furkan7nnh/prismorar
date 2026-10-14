const SOURCE_URL = 'https://multiwin223.com/';
const API_URL = new URL('/api/v2/games/pages/mirror/casino', SOURCE_URL);
const GAME_LAUNCH_API_URL = new URL('/api/v1/games/launch-demo-mode/', SOURCE_URL);
const EMPTY_LABELS = [];
const EMPTY_CURRENCIES = [];

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

  return {
    id: record.id,
    name,
    provider: record.provider_name,
    image: imagePath || '',
    demoSupported: record.demo_mode_supported === true,
    supportedCurrencies: Array.isArray(record.supported_currencies)
      ? record.supported_currencies
      : EMPTY_CURRENCIES,
    labels: Array.isArray(record.labels) ? record.labels : EMPTY_LABELS
  };
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
  const providerOptions = [...new Set(providers.map((provider) => provider.name).filter(Boolean))].sort();
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

  gameGrid.innerHTML = visibleGames.map((game) => `
    <article class="game-card">
      <div class="game-card-art">
        ${game.image ? `<img class="game-art-image" src="${escapeHTML(new URL(game.image, SOURCE_URL).href)}" alt="${escapeHTML(game.name)} oyun görseli" loading="lazy" decoding="async">` : ''}
        <span class="tag">${escapeHTML(getLocalizedName(game.labels.find((label) => label.slug !== 'all')?.name) || 'Casino')}</span>
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
  `).join('');

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

async function loadGames() {
  apiStatus.textContent = 'Oyunlar yükleniyor...';

  try {
    const response = await fetch(API_URL, {
      headers: { Accept: 'application/json' },
      credentials: 'omit'
    });

    if (!response.ok) {
      throw new Error(`İstek başarısız: HTTP ${response.status}`);
    }

    const payload = await response.json();
    const data = payload?.data;
    if (!Array.isArray(data?.games)) {
      throw new Error('Yanıt içinde oyun listesi bulunamadı.');
    }

    games = data.games
      .filter((record) => record.active && record.available && record.provider_is_active && record.demo_mode_supported === true)
      .map(normalizeGame)
      .filter(Boolean);

    populateFilters(data.providers || [], data.labels || []);
    gameTotal.textContent = games.length.toLocaleString('tr-TR');
    availableTotal.textContent = games.filter((game) => game.demoSupported).length.toLocaleString('tr-TR');
    renderFeaturedGames();
    renderGames();
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

loadGames().catch((error) => console.error('Oyun kataloğu yüklenemedi.', error));
