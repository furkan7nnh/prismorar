const SOURCE_URL = 'https://multiwin223.com/';
const API_URL = new URL('/api/v2/games/pages/mirror/casino', SOURCE_URL);
const GAME_LAUNCH_API_URL = new URL('/api/v1/games/launch-demo-mode/', SOURCE_URL);

const gameGrid = document.getElementById('gameGrid');
const searchInput = document.getElementById('searchInput');
const providerFilter = document.getElementById('providerFilter');
const labelFilter = document.getElementById('labelFilter');
const categoryChips = document.getElementById('categoryChips');
const apiStatus = document.getElementById('apiStatus');
const gameTotal = document.getElementById('gameTotal');
const availableTotal = document.getElementById('availableTotal');
const featuredCards = document.querySelectorAll('[data-featured-game]');

let games = [];

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
    product: record.product_slug || 'casino',
    image: imagePath ? new URL(imagePath, SOURCE_URL).href : '',
    demoSupported: record.demo_mode_supported === true,
    supportedCurrencies: Array.isArray(record.supported_currencies) ? record.supported_currencies : [],
    labels: (record.labels || [])
      .filter((label) => label.slug !== 'all')
      .map((label) => ({ slug: label.slug, name: getLocalizedName(label.name) }))
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
  labelFilter.insertAdjacentHTML(
    'beforeend',
    categoryOptions.map((label) => `<option value="${escapeHTML(label.slug)}">${escapeHTML(getLocalizedName(label.name))}</option>`).join('')
  );
  categoryChips.innerHTML = [
    '<button class="category-chip active" type="button" data-category="all">Tüm kategoriler</button>',
    ...categoryOptions.map((label) => {
      const categoryName = getLocalizedName(label.name);
      const count = games.filter((game) => game.labels.some((gameLabel) => gameLabel.slug === label.slug)).length;
      return `<button class="category-chip" type="button" data-category="${escapeHTML(label.slug)}">${escapeHTML(categoryName)} <span>${count.toLocaleString('tr-TR')}</span></button>`;
    })
  ].join('');
}

function getFilteredGames() {
  const searchTerm = searchInput.value.trim().toLocaleLowerCase('tr');
  const selectedProvider = providerFilter.value;
  const selectedLabel = labelFilter.value;

  return games.filter((game) => {
    const matchesSearch = game.name.toLocaleLowerCase('tr').includes(searchTerm)
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

    image.src = game.image;
    image.alt = `${game.name} oyun görseli`;
  });
}

function renderGames() {
  const filteredGames = getFilteredGames();
  categoryChips.querySelectorAll('[data-category]').forEach((chip) => {
    const isActive = chip.dataset.category === labelFilter.value;
    chip.classList.toggle('active', isActive);
    chip.setAttribute('aria-pressed', String(isActive));
  });

  gameGrid.innerHTML = filteredGames.map((game) => `
    <article class="game-card">
      <div class="game-card-art">
        ${game.image ? `<img class="game-art-image" src="${escapeHTML(game.image)}" alt="${escapeHTML(game.name)} oyun görseli" loading="lazy">` : ''}
        <span class="tag">${escapeHTML(game.labels[0]?.name || 'Casino')}</span>
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

  apiStatus.textContent = `${filteredGames.length.toLocaleString('tr-TR')} oyun gösteriliyor.`;
}

function openGameInNewTab(gameId) {
  const game = games.find((item) => item.id === gameId);
  if (!game) return;

  const gameWindow = window.open('about:blank', '_blank');
  if (!gameWindow) {
    apiStatus.textContent = 'Oyun başlatılamadı. Tarayıcıda açılır pencerelere izin verip tekrar dene.';
    return;
  }

  gameWindow.opener = null;
  apiStatus.textContent = `${game.name} açılıyor...`;
  requestGameLaunchUrl(game)
    .then((launchUrl) => {
      gameWindow.location.href = launchUrl;
      apiStatus.textContent = `${game.name} açıldı.`;
    })
    .catch((error) => {
      gameWindow.close();
      apiStatus.textContent = `${game.name} açılamadı: ${error.message}`;
    });
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
  renderGames();
});

providerFilter.addEventListener('change', () => {
  renderGames();
});

labelFilter.addEventListener('change', () => {
  renderGames();
});

categoryChips.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const chip = event.target.closest('[data-category]');
  if (!chip) return;
  labelFilter.value = chip.dataset.category;
  renderGames();
});

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const launchButton = event.target.closest('[data-launch]');
  if (launchButton) openGameInNewTab(launchButton.dataset.launch);
});

loadGames().catch((error) => console.error('Oyun kataloğu yüklenemedi.', error));
