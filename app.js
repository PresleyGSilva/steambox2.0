/* =============================================
   STEAMBOX – App JavaScript
   © 2026 Presley G Silva
   ============================================= */

'use strict';

// ---- CONFIG ----
const API = {
  BASE: 'https://generator.ryuu.lol',
  APPID: 500,
  AUTH: 'RYUUMANIFESTsl9z9u',

  manifest(gameAppId) {
    return `${this.BASE}/secure_download?appid=${gameAppId}&auth_code=${this.AUTH}`;
  },
  lua(gameAppId) {
    return `${this.BASE}/resellerlua?appid=${gameAppId}&auth_code=${this.AUTH}`;
  },
  requestGame(nameOrId) {
    return `${this.BASE}/resellerrequest?appid=${this.APPID}&auth_code=${this.AUTH}&search=${encodeURIComponent(nameOrId)}`;
  },
  requestUpdate(gameAppId) {
    return `${this.BASE}/resellerrequestupdate?appid=${gameAppId}&auth_code=${this.AUTH}`;
  },
  updateGame(gameAppId) {
    return `${this.BASE}/resellerupdate?appid=${gameAppId}&auth_code=${this.AUTH}`;
  },
};

const STEAM_IMG = (appid) =>
  `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`;

let PATHS = {
  manifest: 'C:\\Program Files (x86)\\Steam\\depotcache',
  lua:      'C:\\Program Files (x86)\\Steam\\config\\stplug-in',
  steamapps: 'C:\\Program Files (x86)\\Steam\\steamapps',
};

// ---- STATE ----
let state = {
  query: '',
  downloadType: 'manifest', // 'manifest' | 'lua'
  results: [],
  page: 1,
  perPage: 10,
  totalPages: 1,
  loading: false,
  selectedGame: null,
};

// ---- ELEMENTS ----
const $ = (id) => document.getElementById(id);
const els = {
  searchInput:   $('search-input'),
  searchBtn:     $('search-btn'),
  searchClear:   $('search-clear'),
  resultsGrid:   $('results-grid'),
  emptyState:    $('empty-state'),
  loadingState:  $('loading-state'),
  errorState:    $('error-state'),
  errorTitle:    $('error-title'),
  errorMsg:      $('error-msg'),
  retryBtn:      $('retry-btn'),
  pagination:    $('pagination'),
  prevPage:      $('prev-page'),
  nextPage:      $('next-page'),
  pageNumbers:   $('page-numbers'),
  perPage:       $('per-page'),
  tabManifest:   $('tab-manifest'),
  tabLua:        $('tab-lua'),
  pathDisplay:   $('path-display'),
  pathInfo:      $('path-info'),
  toastContainer:$('toast-container'),
  header:        $('header'),
  // Modal
  modalOverlay:  $('modal-overlay'),
  modalClose:    $('modal-close'),
  modalImg:      $('modal-img'),
  modalAppid:    $('modal-appid'),
  modalStatus:   $('modal-status'),
  modalTitle:    $('modal-title'),
  modalDlGame:   $('modal-dl-game'),
  modalUpdate:   $('modal-update'),
};

// ---- STARS ----
function generateStars() {
  const container = $('stars');
  if (!container) return;
  const count = 120;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const star = document.createElement('div');
    star.className = 'star';
    const size = Math.random() * 2.5 + 0.5;
    const dur  = (Math.random() * 4 + 2).toFixed(1);
    const delay= (Math.random() * 5).toFixed(1);
    const minOp= (Math.random() * 0.2).toFixed(2);
    const maxOp= (Math.random() * 0.6 + 0.3).toFixed(2);
    Object.assign(star.style, {
      width:  `${size}px`,
      height: `${size}px`,
      top:    `${Math.random() * 100}%`,
      left:   `${Math.random() * 100}%`,
      '--dur':    `${dur}s`,
      '--delay':  `${delay}s`,
      '--min-op': minOp,
      '--max-op': maxOp,
    });
    frag.appendChild(star);
  }
  container.appendChild(frag);
}

// ---- TOAST ----
function showToast(message, type = 'info', duration = 3500) {
  const icons = { success: '✅', error: '❌', info: '💡', download: '⬇️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${message}</span>`;
  els.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, duration);
}

// ---- SEARCH ----
async function performSearch(query) {
  if (!query.trim()) {
    showToast('Digite o nome do jogo ou AppID.', 'error');
    return;
  }
  state.query = query.trim();
  state.page = 1;
  state.loading = true;
  showLoading();

  try {
    // Check if it's a Steam store URL
    const steamUrlMatch = state.query.match(/store\.steampowered\.com\/app\/(\d+)/);
    // Check if it's a pure AppID
    const isAppId = /^\d+$/.test(state.query.trim());

    let games = [];

    if (steamUrlMatch) {
      // Extract AppID from Steam URL
      const appid = parseInt(steamUrlMatch[1]);
      games = await lookupByAppId(appid);
    } else if (isAppId) {
      // Direct lookup by AppID
      const appid = parseInt(state.query.trim());
      games = await lookupByAppId(appid);
    } else {
      // Search by name using Steam's public search API + our API
      games = await searchByName(state.query);
    }

    state.results = games;
    state.totalPages = Math.max(1, Math.ceil(games.length / state.perPage));

    if (games.length === 0) {
      showError('Nenhum jogo encontrado', `Não foi possível encontrar "${state.query}". Tente o AppID do Steam diretamente.`);
    } else {
      renderResults();
    }
  } catch (err) {
    console.error(err);
    showError('Erro na busca', err.message || 'Verifique sua conexão e tente novamente.');
  } finally {
    state.loading = false;
  }
}

async function lookupByAppId(appid) {
  // Check if we can get game info from Steam CDN + our API
  const name = await getGameName(appid);
  return [{
    appid,
    name: name || `App ${appid}`,
  }];
}

async function getGameName(appid) {
  try {
    // Try Steam store API via a public CORS-friendly lookup
    const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&filters=basic`, {
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) throw new Error('fetch fail');
    const data = await res.json();
    if (data[appid]?.success) {
      return data[appid].data?.name;
    }
  } catch {
    // fallback – no name
  }
  return null;
}

async function searchByName(query) {
  // Use Tauri backend if available (bypasses CORS)
  if (window.__TAURI__) {
    try {
      const html = await window.__TAURI__.core.invoke('search_steam', { query });
      const results = parseSteamSearchHTML(html);
      if (results.length > 0) return results;
      console.warn('Tauri search returned no results, falling back');
    } catch (err) {
      console.warn('Tauri search failed, falling back to fetch', err);
    }
  }

  // Fallback: Use Steam's search suggestion endpoint
  try {
    const res = await fetch(
      `https://store.steampowered.com/search/suggest?term=${encodeURIComponent(query)}&f=games&cc=US&l=english&v=21259854`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error('Steam search failed');
    const html = await res.text();
    const results = parseSteamSearchHTML(html);
    if (results.length > 0) return results;
    throw new Error('No results from Steam suggest');
  } catch (err) {
    // fallback: try our API
    return await searchViaRyuuAPI(query);
  }
}

function parseSteamSearchHTML(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const items = doc.querySelectorAll('a[data-ds-appid]');
  const games = [];
  items.forEach(item => {
    const appid = parseInt(item.getAttribute('data-ds-appid'));
    const nameEl = item.querySelector('.match_name');
    const name = nameEl?.textContent?.trim() || `App ${appid}`;
    if (appid && !isNaN(appid)) {
      games.push({ appid, name });
    }
  });
  return games;
}

async function searchViaRyuuAPI(query) {
  try {
    const res = await fetch(API.requestGame(query), { signal: AbortSignal.timeout(10000) });
    const data = await res.json().catch(() => ({}));

    if (data.results && Array.isArray(data.results)) {
      return data.results.map(g => ({ appid: g.appid || g.app_id, name: g.name }));
    }
    if (data.message) {
      showToast(data.message, 'info');
    }
    return [];
  } catch {
    return [];
  }
}

// ---- DOWNLOAD ----
async function downloadManifest(appid, gameName) {
  const url = API.manifest(appid);
  if (window.__TAURI__) {
    showToast(`Baixando manifest de ${gameName} para Steam...`, 'download', 5000);
    try {
      await window.__TAURI__.core.invoke('download_and_save', {
        url,
        path: PATHS.manifest,
        filename: `${appid}.manifest`
      });
      showToast('Manifest salvo com sucesso!', 'success');
    } catch (err) {
      showToast(`Erro ao salvar: ${err}`, 'error');
    }
  } else {
    showToast(`Baixando manifest de ${gameName}...`, 'download', 5000);
    triggerDownload(url, `${appid}.manifest`);
  }
}

async function downloadLua(appid, gameName) {
  const url = API.lua(appid);
  if (window.__TAURI__) {
    showToast(`Baixando Lua de ${gameName} para Steam...`, 'download', 5000);
    try {
      await window.__TAURI__.core.invoke('download_and_save', {
        url,
        path: PATHS.lua,
        filename: `${appid}.lua`
      });
      showToast('Script Lua salvo com sucesso!', 'success');
    } catch (err) {
      showToast(`Erro ao salvar: ${err}`, 'error');
    }
  } else {
    showToast(`Baixando Lua script de ${gameName}...`, 'download', 5000);
    triggerDownload(url, `${appid}.lua`);
  }
}

async function triggerSteamInstall(appid) {
  if (window.__TAURI__) {
    try {
      await window.__TAURI__.core.invoke('open_steam_link', { appid: String(appid) });
      showToast('Abrindo instalador no Steam...', 'info');
    } catch (err) {
      console.error('Failed to open Steam link:', err);
    }
  } else {
    window.location.href = `steam://install/${appid}`;
  }
}

async function forceUpdateManifest(appid) {
  try {
    const res = await fetch(API.updateGame(appid), { signal: AbortSignal.timeout(15000) });
    const data = await res.json().catch(() => ({}));
    if (data.message) {
      showToast(`Status: ${data.message}`, 'info');
    }
    return true;
  } catch (err) {
    console.warn('Silent update failed', err);
    return false;
  }
}

async function generateAcf(appid, name) {
  if (window.__TAURI__) {
    try {
      await window.__TAURI__.core.invoke('generate_acf', {
        appid: String(appid),
        name: name,
        path: PATHS.steamapps
      });
      return true;
    } catch (err) {
      showToast(`Erro ao gerar ACF: ${err}`, 'error');
      throw err;
    }
  }
}

function setStepState(appid, stepId, state) {
  const el = document.getElementById(`step-${stepId}-${appid}`);
  if (!el) return;
  
  el.classList.remove('active', 'done');
  const icon = el.querySelector('.status-step-icon');
  
  if (state === 'active') {
    el.classList.add('active');
    if (icon) icon.innerHTML = '<div class="status-step-spinner"></div>';
  } else if (state === 'done') {
    el.classList.add('done');
    if (icon) icon.innerHTML = '<div class="status-step-dot"></div>';
  }
}

function setModalStepState(stepId, state) {
  const el = document.getElementById(`modal-step-${stepId}`);
  if (!el) return;
  
  el.classList.remove('active', 'done');
  const icon = el.querySelector('.status-step-icon');
  
  if (state === 'active') {
    el.classList.add('active');
    if (icon) icon.innerHTML = '<div class="status-step-spinner"></div>';
  } else if (state === 'done') {
    el.classList.add('done');
    if (icon) icon.innerHTML = '<div class="status-step-dot"></div>';
  } else {
    // Reset/Idle
    if (icon) icon.innerHTML = '<div class="status-step-dot"></div>';
  }
}

function triggerDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function requestUpdate(appid, gameName, btn) {
  if (!btn) return;
  btn.classList.add('btn-loading');
  btn.disabled = true;
  try {
    // We use the more direct resellerupdate API now
    const res = await fetch(API.updateGame(appid), { signal: AbortSignal.timeout(15000) });
    const data = await res.json().catch(() => ({}));
    showToast(data.message || `Atualização solicitada para ${gameName}`, 'success');
  } catch {
    showToast('Erro ao solicitar atualização.', 'error');
  } finally {
    btn.classList.remove('btn-loading');
    btn.disabled = false;
  }
}

// ---- RENDER ----
function renderResults() {
  const start = (state.page - 1) * state.perPage;
  const slice = state.results.slice(start, start + state.perPage);

  els.resultsGrid.innerHTML = '';
  slice.forEach(game => {
    els.resultsGrid.appendChild(createGameCard(game));
  });

  setState('results');
  renderPagination();

  // Animate in
  requestAnimationFrame(() => {
    els.resultsGrid.querySelectorAll('.game-card').forEach((card, i) => {
      card.style.animationDelay = `${i * 60}ms`;
      card.style.animation = 'fadeInUp 0.4s ease both';
    });
  });
}

function createGameCard(game) {
  const { appid, name } = game;
  const imgUrl = STEAM_IMG(appid);

  const card = document.createElement('div');
  card.className = 'game-card';
  card.id = `game-card-${appid}`;
  card.innerHTML = `
    <div class="card-img-wrapper">
      <img class="card-img" src="${imgUrl}" alt="${escapeHtml(name)}" loading="lazy"
           onerror="this.src=''; this.style.display='none'" />
      <div class="card-img-overlay"></div>
      <span class="card-appid-badge">${appid}</span>
    </div>
    
    <div class="card-status-overlay" id="status-overlay-${appid}">
      <div class="status-title">Processando...</div>
      <div class="status-steps">
        <div class="status-step" id="step-update-${appid}">
          <div class="status-step-icon"><div class="status-step-dot"></div></div>
          <span>Atualizando API</span>
        </div>
        <div class="status-step" id="step-download-${appid}">
          <div class="status-step-icon"><div class="status-step-dot"></div></div>
          <span>Baixando Arquivos</span>
        </div>
        <div class="status-step" id="step-acf-${appid}">
          <div class="status-step-icon"><div class="status-step-dot"></div></div>
          <span>Registrando Jogo</span>
        </div>
        <div class="status-step" id="step-steam-${appid}">
          <div class="status-step-icon"><div class="status-step-dot"></div></div>
          <span>Abrindo Steam</span>
        </div>
      </div>
    </div>

    <div class="card-body">
      <h3 class="card-name">${escapeHtml(name)}</h3>
      <div class="card-actions">
        <button class="card-btn card-btn-download" id="btn-download-${appid}" title="Baixar para Steam">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Baixar
        </button>
        <button class="card-btn card-btn-update" id="btn-update-${appid}" title="Solicitar Atualização">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        </button>
      </div>
    </div>
  `;

  // Events
  card.addEventListener('click', (e) => {
    if (!e.target.closest('.card-btn')) {
      openModal(game);
    }
  });

  card.querySelector('.card-btn-download').addEventListener('click', async (e) => {
    e.stopPropagation();
    const btn = e.currentTarget;
    btn.disabled = true;
    card.classList.add('processing');
    
    try {
      // 1. Force update
      setStepState(appid, 'update', 'active');
      await forceUpdateManifest(appid);
      setStepState(appid, 'update', 'done');
      
      // 2. Download files
      setStepState(appid, 'download', 'active');
      await Promise.all([
        downloadManifest(appid, name),
        downloadLua(appid, name),
      ]);
      setStepState(appid, 'download', 'done');
      
      // 2.1 Generate ACF
      setStepState(appid, 'acf', 'active');
      await generateAcf(appid, name);
      setStepState(appid, 'acf', 'done');
      
      // 3. Trigger Steam install
      setStepState(appid, 'steam', 'active');
      await triggerSteamInstall(appid);
      setStepState(appid, 'steam', 'done');
      
      showToast('Pronto! Verifique seu Steam.', 'success');
      setTimeout(() => card.classList.remove('processing'), 2000);
    } catch (err) {
      showToast('Ocorreu um erro no processo.', 'error');
      card.classList.remove('processing');
    } finally {
      btn.disabled = false;
      btn.classList.remove('btn-loading');
    }
  });

  card.querySelector('.card-btn-update').addEventListener('click', async (e) => {
    e.stopPropagation();
    await requestUpdate(appid, name, e.currentTarget);
  });

  return card;
}

function renderPagination() {
  state.totalPages = Math.max(1, Math.ceil(state.results.length / state.perPage));

  if (state.totalPages <= 1) {
    els.pagination.classList.add('hidden');
    return;
  }

  els.pagination.classList.remove('hidden');
  els.prevPage.disabled = state.page <= 1;
  els.nextPage.disabled = state.page >= state.totalPages;

  // Page numbers
  els.pageNumbers.innerHTML = '';
  const pages = getPageRange(state.page, state.totalPages);
  pages.forEach(p => {
    if (p === '...') {
      const span = document.createElement('span');
      span.className = 'page-num';
      span.textContent = '…';
      span.style.cursor = 'default';
      span.style.opacity = '0.4';
      els.pageNumbers.appendChild(span);
    } else {
      const btn = document.createElement('button');
      btn.className = `page-num${p === state.page ? ' active' : ''}`;
      btn.textContent = p;
      btn.id = `page-btn-${p}`;
      btn.addEventListener('click', () => {
        state.page = p;
        renderResults();
        document.getElementById('search-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      els.pageNumbers.appendChild(btn);
    }
  });
}

function getPageRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [];
  if (current <= 4) {
    pages.push(1, 2, 3, 4, 5, '...', total);
  } else if (current >= total - 3) {
    pages.push(1, '...', total - 4, total - 3, total - 2, total - 1, total);
  } else {
    pages.push(1, '...', current - 1, current, current + 1, '...', total);
  }
  return pages;
}

// ---- MODAL ----
function openModal(game) {
  const { appid, name } = game;
  state.selectedGame = game;

  els.modalImg.src = STEAM_IMG(appid);
  els.modalImg.alt = name;
  els.modalImg.onerror = () => { els.modalImg.style.display = 'none'; };
  els.modalAppid.textContent = `AppID: ${appid}`;
  els.modalStatus.textContent = '● Disponível';
  els.modalTitle.textContent = name;

  // Actions
  els.modalDlGame.onclick = async () => {
    const modal = document.getElementById('game-modal');
    modal.classList.add('processing');
    
    // Reset modal steps
    ['update', 'download', 'acf', 'steam'].forEach(s => setModalStepState(s, 'idle'));
    
    try {
        setModalStepState('update', 'active');
        await forceUpdateManifest(appid);
        setModalStepState('update', 'done');
        
        setModalStepState('download', 'active');
        await Promise.all([
          downloadManifest(appid, name),
          downloadLua(appid, name),
        ]);
        setModalStepState('download', 'done');
        
        setModalStepState('acf', 'active');
        await generateAcf(appid, name);
        setModalStepState('acf', 'done');
        
        setModalStepState('steam', 'active');
        await triggerSteamInstall(appid);
        setModalStepState('steam', 'done');
        
        showToast('Sucesso! Verifique seu Steam.', 'success');
        setTimeout(() => {
          modal.classList.remove('processing');
          closeModal();
        }, 2000);
    } catch (err) {
        showToast('Erro ao processar.', 'error');
        modal.classList.remove('processing');
    }
  };
  els.modalUpdate.onclick = async () => await requestUpdate(appid, name, els.modalUpdate);

  els.modalOverlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  els.modalOverlay.classList.add('hidden');
  document.body.style.overflow = '';
  state.selectedGame = null;
}

// ---- UI STATE ----
function setState(s) {
  els.emptyState.classList.add('hidden');
  els.loadingState.classList.add('hidden');
  els.errorState.classList.add('hidden');
  els.resultsGrid.classList.add('hidden');
  els.pagination.classList.add('hidden');

  if (s === 'empty')   els.emptyState.classList.remove('hidden');
  if (s === 'loading') els.loadingState.classList.remove('hidden');
  if (s === 'error')   els.errorState.classList.remove('hidden');
  if (s === 'results') els.resultsGrid.classList.remove('hidden');
}

function showLoading() { setState('loading'); }

function showError(title, msg) {
  els.errorTitle.textContent = title;
  els.errorMsg.textContent = msg;
  setState('error');
}

// ---- COPY ----
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Caminho copiado!', 'success', 2000);
  }).catch(() => {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('Caminho copiado!', 'success', 2000);
  });
}

// ---- HEADER SCROLL ----
function handleScroll() {
  if (window.scrollY > 20) {
    els.header.classList.add('scrolled');
  } else {
    els.header.classList.remove('scrolled');
  }
}

// ---- ANIMATE STATS ----
function animateCounters() {
  const targets = { 'stat-games': null };
  // Nothing to count animate for ∞, just keep it
}

// ---- INTERSECTION OBSERVER ----
function setupScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.style.animation = 'fadeInUp 0.6s ease both';
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.step-card, .path-card, .feature, .api-endpoint').forEach(el => {
    el.style.opacity = '0';
    observer.observe(el);
  });
}

// ---- COPY BUTTONS ----
function setupCopyButtons() {
  document.querySelectorAll('.copy-btn[data-copy]').forEach(btn => {
    btn.addEventListener('click', () => {
      copyToClipboard(btn.dataset.copy);
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 2000);
    });
  });
}

// ---- UTIL ----
function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str || ''));
  return div.innerHTML;
}

// ---- INIT ----
function init() {
  generateStars();

  // Header scroll
  window.addEventListener('scroll', handleScroll, { passive: true });

  // Search input
  els.searchInput.addEventListener('input', () => {
    const v = els.searchInput.value;
    els.searchClear.classList.toggle('visible', v.length > 0);
  });

  els.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') performSearch(els.searchInput.value);
  });

  els.searchBtn.addEventListener('click', () => performSearch(els.searchInput.value));

  els.searchClear.addEventListener('click', () => {
    els.searchInput.value = '';
    els.searchClear.classList.remove('visible');
    state.results = [];
    setState('empty');
    els.searchInput.focus();
  });

  // Retry
  els.retryBtn.addEventListener('click', () => {
    if (state.query) performSearch(state.query);
  });

  // Tabs
  els.tabManifest.addEventListener('click', () => {
    state.downloadType = 'manifest';
    els.tabManifest.classList.add('active');
    els.tabLua.classList.remove('active');
    els.pathDisplay.textContent = PATHS.manifest;
  });

  els.tabLua.addEventListener('click', () => {
    state.downloadType = 'lua';
    els.tabLua.classList.add('active');
    els.tabManifest.classList.remove('active');
    els.pathDisplay.textContent = PATHS.lua;
  });

  // Pagination
  els.prevPage.addEventListener('click', () => {
    if (state.page > 1) {
      state.page--;
      renderResults();
      document.getElementById('search-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  els.nextPage.addEventListener('click', () => {
    if (state.page < state.totalPages) {
      state.page++;
      renderResults();
      document.getElementById('search-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  els.perPage.addEventListener('change', () => {
    state.perPage = parseInt(els.perPage.value);
    state.page = 1;
    if (state.results.length > 0) renderResults();
  });

  // Modal
  els.modalClose.addEventListener('click', closeModal);
  els.modalOverlay.addEventListener('click', (e) => {
    if (e.target === els.modalOverlay) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // Copy buttons
  setupCopyButtons();

  // Scroll animations
  setupScrollAnimations();

  // Hero preview animation
  animatePreview();

  // Smooth scroll for nav links
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const target = document.querySelector(a.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Update paths if running in Tauri
  updateSteamPaths();
}

async function updateSteamPaths() {
  if (window.__TAURI__) {
    try {
      const paths = await window.__TAURI__.core.invoke('get_steam_paths');
      PATHS.manifest = paths.depotcache;
      PATHS.lua = paths.stplugin;
      PATHS.steamapps = paths.steamapps;
      
      const pathDisplay = document.getElementById('path-display');
      if (pathDisplay) {
        pathDisplay.textContent = state.downloadType === 'manifest' ? PATHS.manifest : PATHS.lua;
      }
      
      // Update UI paths in "How it works" section too
      const manifestCode = document.querySelector('#path-manifest .path-value');
      const luaCode = document.querySelector('#path-lua .path-value');
      if (manifestCode) manifestCode.textContent = PATHS.manifest;
      if (luaCode) luaCode.textContent = PATHS.lua;
    } catch (err) {
      console.error('Failed to get Steam paths:', err);
    }
  }
}

function animatePreview() {
  // Auto-cycle preview items
  const items = document.querySelectorAll('.preview-item');
  if (!items.length) return;
  let idx = 0;
  setInterval(() => {
    items.forEach(i => i.classList.remove('active'));
    idx = (idx + 1) % items.length;
    items[idx].classList.add('active');
  }, 2500);
}

document.addEventListener('DOMContentLoaded', init);
