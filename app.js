/**
 * Суши — тренажёр меню
 * Неофициальный тренажёр для изучения меню. Фото принадлежат ресторану.
 */
(function() {
  'use strict';

  // ===== CONSTANTS =====
  const STORAGE_KEY = 'sushi-trainer-progress-v1';
  const MENU_URL = './menu.json';
  const DEFAULT_STATE = { known: [], hard: [], lastUpdated: null };

  // ===== STATE =====
  let allItems = [];
  let categories = [];
  let state = { known: [], hard: [] };
  let currentCategory = 'all';
  let searchQuery = '';
  let hardOnly = false;
  let quizScope = 'rolls';
  let activeTab = 'catalog';
  let quizPool = [];
  let quizCurrent = null;
  let quizOptions = [];
  let quizAnswered = false;
  let quizStats = { correct: 0, total: 0 };

  // ===== DOM ELEMENTS =====
  const els = {};

  function cacheElements() {
    // Sections
    els.loading = document.getElementById('loading');
    els.error = document.getElementById('error');
    els.errorMessage = document.getElementById('error-message');
    els.retryBtn = document.getElementById('retry');
    els.catalog = document.getElementById('catalog');
    els.cards = document.getElementById('cards');
    els.catalogEmpty = document.getElementById('catalog-empty');
    els.search = document.getElementById('search');
    els.resultCount = document.getElementById('result-count');
    els.categories = document.getElementById('categories');
    els.quiz = document.getElementById('quiz');
    els.quizEmpty = document.getElementById('quiz-empty');
    els.quizContent = document.getElementById('quiz-content');
    els.quizIngredientsTitle = document.getElementById('quiz-ingredients-title');
    els.quizIngredientsList = document.getElementById('quiz-ingredients-list');
    els.answers = document.getElementById('answers');
    els.quizFeedback = document.getElementById('quiz-feedback');
    els.nextBtn = document.getElementById('next');
    els.quizScore = document.getElementById('quiz-score');
    els.quizFilters = document.querySelectorAll('[data-quiz-scope]');

    // Dashboard
    els.knownCount = document.getElementById('known-count');
    els.hardCount = document.getElementById('hard-count');
    els.progress = document.getElementById('progress');
    els.progressLabel = document.getElementById('progress-label');
    els.resetBtn = document.getElementById('reset');
    els.storageNotice = document.getElementById('storage-notice');

    // Toolbar
    els.catalogTab = document.getElementById('catalog-tab');
    els.setsTab = document.getElementById('sets-tab');
    els.quizTab = document.getElementById('quiz-tab');
    els.hardOnlyToggle = document.getElementById('hard-only');

    // Sections
    els.setsView = document.getElementById('sets-view');
    els.setsList = document.getElementById('sets-list');
    els.setsCount = document.getElementById('sets-count');
    els.setDetail = document.getElementById('set-detail');
    els.setDetailTitle = document.getElementById('set-detail-title');
    els.setDetailImage = document.getElementById('set-detail-image');
    els.setDetailRolls = document.getElementById('set-detail-rolls');
    els.backToSets = document.getElementById('back-to-sets');

    // Announcer
    els.announcement = document.getElementById('announcement');
  }

  // ===== STORAGE =====
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = {
          known: Array.isArray(parsed.known) ? parsed.known : [],
          hard: Array.isArray(parsed.hard) ? parsed.hard : [],
          lastUpdated: parsed.lastUpdated || null
        };
        // Sanitize: only keep IDs that exist in menu
        const validIds = new Set(allItems.map(i => i.id));
        state.known = state.known.filter(id => validIds.has(id));
        state.hard = state.hard.filter(id => validIds.has(id));
      }
    } catch (e) {
      showStorageNotice('Не удалось загрузить прогресс: ' + e.message);
      state = { known: [], hard: [] };
    }
  }

  function saveState() {
    try {
      const toSave = {
        known: state.known,
        hard: state.hard,
        lastUpdated: new Date().toISOString()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
      hideStorageNotice();
    } catch (e) {
      showStorageNotice('Не удалось сохранить прогресс: ' + e.message);
    }
  }

  function showStorageNotice(msg) {
    els.storageNotice.textContent = msg;
    els.storageNotice.hidden = false;
  }

  function hideStorageNotice() {
    els.storageNotice.hidden = true;
    els.storageNotice.textContent = '';
  }

  // ===== UTILITIES =====
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text == null ? '' : text);
    return div.innerHTML;
  }

  function safeImagePath(value) {
    // Only allow local WebP assets; menu data must never turn into an external URL.
    const path = String(value == null ? '' : value).replace(/\\\\/g, '/');
    return /^images\/[a-zA-Z0-9_-]+\.webp$/.test(path) ? './' + path : '';
  }

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function announce(text) {
    els.announcement.textContent = '';
    // Small delay to ensure screen readers pick it up
    requestAnimationFrame(() => {
      els.announcement.textContent = text;
    });
  }

  function formatPrice(price) {
    return Math.round(price).toLocaleString('ru-RU') + ' ₽';
  }

  function parseIngredients(description) {
    const text = String(description || '');
    // Обычные роллы в меню часто описаны одной строкой: «🍣 8 шт. Рис, нори…».
    // В сетах есть отдельная строка с количеством и строка с набором роллов.
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const result = [];

    for (const line of lines) {
      const markers = ['🍣', '🍱', '🔥', '🍤', '🥢'];
      const markerAt = markers.reduce((found, marker) => {
        const index = line.indexOf(marker);
        return index >= 0 && (found < 0 || index < found) ? index : found;
      }, -1);
      let content = markerAt >= 0 ? line.slice(markerAt + 2).trim() : line;
      if (!content) continue;

      // Strip the leading piece count, but keep ingredient quantities and names intact.
      content = content.replace(/^\d+\s*шт\.?\s*/i, '');
      if (!content) continue;

      // Avoid treating a set's piece count line as an ingredient.
      if (/^\d+\s*шт\.?$/i.test(content)) continue;
      const parts = content.split(/,\s*/).map(part => part.replace(/[.;]+$/, '').trim()).filter(Boolean);
      result.push(...parts);
    }

    return result;
  }

  // ===== DATA LOADING =====
  async function loadMenu() {
    // Cache the elements before the first load; otherwise the initial request
    // can fail before init() has populated els.loading/els.error.
    cacheElements();
    els.loading.hidden = false;
    els.error.hidden = true;
    els.catalog.hidden = true;
    els.quiz.hidden = true;

    try {
      const response = await fetch(MENU_URL, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Сервер вернул ' + response.status);
      }
      const data = await response.json();
      if (!data.items || !Array.isArray(data.items)) {
        throw new Error('Неверный формат меню');
      }
      // Keep only rolls and sets, excluding half-portions even if present upstream.
      allItems = data.items.filter(i => {
        const name = i.name || '';
        const category = i.category || '';
        const isRollOrSet = /ролл/i.test(category) || (/сет/i.test(category) && !/сезон/i.test(category));
        return isRollOrSet && !/^1\/2\s/i.test(name) && !/ПОЛОВИН/i.test(name);
      });
      categories = [...new Set(allItems.map(i => i.category))].sort();
      loadState();
      init();
    } catch (err) {
      showError(err.message);
    }
  }

  function showError(message) {
    els.loading.hidden = true;
    els.error.hidden = false;
    els.errorMessage.textContent = message || 'Неизвестная ошибка загрузки.';
  }

  // ===== INIT =====
  function init() {
    cacheElements();
    bindEvents();
    renderCategories();
    renderCatalog();
    renderSets();
    updateDashboard();
    renderQuiz();
    els.loading.hidden = true;
    els.catalog.hidden = false;
    els.quiz.hidden = true;
  }

  function bindEvents() {
    // Tabs
    els.catalogTab.addEventListener('click', () => switchTab('catalog'));
    els.setsTab && els.setsTab.addEventListener('click', () => switchTab('sets'));
    els.quizTab.addEventListener('click', () => switchTab('quiz'));

    // Set detail navigation
    els.backToSets && els.backToSets.addEventListener('click', () => {
      switchTab('sets');
      announce('Возврат к списку сетов');
    });

    // Search
    els.search.addEventListener('input', debounce(() => {
      searchQuery = els.search.value.trim().toLowerCase();
      renderCatalog();
    }, 150));

    // Hard only toggle
    els.hardOnlyToggle.addEventListener('change', () => {
      hardOnly = els.hardOnlyToggle.checked;
      renderCatalog();
      if (activeTab === 'quiz') renderQuiz();
    });

    // Reset progress
    els.resetBtn.addEventListener('click', () => {
      if (confirm('Сбросить весь прогресс? Будут удалены списки «Знаю» и «Повторить».')) {
        state = { known: [], hard: [] };
        saveState();
        updateDashboard();
        renderCatalog();
        if (activeTab === 'quiz') renderQuiz();
        announce('Прогресс сброшен');
      }
    });

    // Retry loading
    els.retryBtn.addEventListener('click', loadMenu);

    // Quiz scope filters
    els.quizFilters.forEach(btn => btn.addEventListener('click', () => {
      quizScope = btn.dataset.quizScope;
      els.quizFilters.forEach(filter => {
        const selected = filter === btn;
        filter.classList.toggle('active', selected);
        filter.setAttribute('aria-pressed', String(selected));
      });
      if (activeTab === 'quiz') renderQuiz();
    }));

    // Quiz next
    els.nextBtn.addEventListener('click', nextQuizQuestion);

    // Keyboard navigation for answers
    els.answers.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const btn = e.target.closest('.answer');
        if (btn && !btn.disabled) {
          e.preventDefault();
          btn.click();
        }
      }
    });
  }

  function switchTab(tab) {
    activeTab = tab;
    els.catalogTab.classList.toggle('active', tab === 'catalog');
    els.setsTab && els.setsTab.classList.toggle('active', tab === 'sets');
    els.quizTab.classList.toggle('active', tab === 'quiz');
    els.catalogTab.setAttribute('aria-pressed', tab === 'catalog');
    els.setsTab && els.setsTab.setAttribute('aria-pressed', tab === 'sets');
    els.quizTab.setAttribute('aria-pressed', tab === 'quiz');
    els.catalog.hidden = tab !== 'catalog';
    els.setsView && (els.setsView.hidden = tab !== 'sets' || Boolean(els.setDetail && els.setDetail.dataset.open === 'true'));
    if (els.setDetail) els.setDetail.hidden = tab !== 'sets' || els.setDetail.dataset.open !== 'true';
    els.quiz.hidden = tab !== 'quiz';

    if (tab === 'quiz') {
      renderQuiz();
      announce('Режим теста. Угадайте блюдо по ингредиентам.');
    } else if (tab === 'sets') {
      renderSets();
      announce('Режим сетов. Нажмите на сет, чтобы увидеть состав.');
    } else {
      announce('Каталог блюд');
    }
  }

  function debounce(fn, ms) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  // ===== CATEGORIES =====
  function renderCategories() {
    els.categories.innerHTML = '';
    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'category' + (currentCategory === 'all' ? ' active' : '');
    allBtn.textContent = 'Все';
    allBtn.addEventListener('click', () => setCategory('all'));
    els.categories.appendChild(allBtn);

    for (const cat of categories) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'category' + (currentCategory === cat ? ' active' : '');
      btn.textContent = cat;
      btn.addEventListener('click', () => setCategory(cat));
      els.categories.appendChild(btn);
    }
  }

  function setCategory(cat) {
    currentCategory = cat;
    renderCategories();
    renderCatalog();
  }

  // ===== SETS =====
  function getSetRolls(item) {
    const text = String(item.description || '');
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    let source = '';

    // Set descriptions usually have a separate line beginning with 🥢.
    for (const line of lines) {
      const marker = line.indexOf('🥢');
      if (marker >= 0) {
        source = line.slice(marker + 2).trim();
        break;
      }
    }
    if (!source) source = lines.join(', ');
    source = source.replace(/^\d+\s*шт\.?\s*/i, '');

    // Split on commas/semicolons, and normalize inconsistent spacing/counts.
    return source.split(/[,;]+/).map(part => part
      .replace(/[🍱🍣🥢🔥🍤]/g, '')
      .replace(/^\s*\d+\s*шт\.?\s*/i, '')
      .replace(/[.;]+$/, '')
      .replace(/\s+/g, ' ')
      .trim()
    ).filter(part => part && !/^\d+\s*шт\.?$/i.test(part));
  }

  function renderSets() {
    if (!els.setsList || !els.setsCount) return;
    const sets = allItems.filter(item => /сет/i.test(item.category || '') && !/сезон/i.test(item.category || '') && getSetRolls(item).length);
    els.setsCount.textContent = sets.length + ' сетов';
    els.setsList.innerHTML = sets.map(item => {
      const rolls = getSetRolls(item);
      const image = safeImagePath(item.image);
      return `<article class="card set-card">
        ${image ? `<img class="card-image set-thumb" src="${escapeHtml(image)}" alt="" loading="lazy">` : ''}
        <div class="card-body">
          <div class="card-meta"><span class="card-category">Сет</span><span>${rolls.length} роллов${item.weight ? ' · ' + escapeHtml(item.weight) : ''}</span></div>
          <h3>${escapeHtml(item.name)}</h3>
          ${item.price ? `<p class="card-details">${escapeHtml(formatPrice(item.price))}</p>` : ''}
          <div class="card-actions">
            <button type="button" class="set-open" data-open-id="${escapeHtml(item.id)}">Открыть состав</button>
          </div>
        </div>
      </article>`;
    }).join('');

    els.setsList.querySelectorAll('[data-open-id]').forEach(button => {
      button.addEventListener('click', () => openSetDetail(button.dataset.openId));
    });
  }

  function openSetDetail(setId) {
    const set = allItems.find(item => item.id === setId);
    if (!set || !els.setDetail) return;
    const rolls = getSetRolls(set);
    const image = safeImagePath(set.image);
    els.setDetailTitle.textContent = set.name;
    els.setDetailTitle.setAttribute('aria-label', set.name);
    if (image) {
      els.setDetailImage.src = image;
      els.setDetailImage.alt = 'Фото: ' + set.name;
      els.setDetailImage.hidden = false;
    } else {
      els.setDetailImage.removeAttribute('src');
      els.setDetailImage.hidden = true;
    }
    if (!rolls.length) {
      els.setDetailEmpty.hidden = false;
      els.setDetailRolls.innerHTML = '';
      els.setDetailRolls.hidden = true;
    } else {
      els.setDetailEmpty.hidden = true;
      els.setDetailRolls.hidden = false;
      els.setDetailRolls.innerHTML = rolls.map(roll => `<li class="set-detail-roll">${escapeHtml(roll)}</li>`).join('');
    }
    els.setDetail.dataset.open = 'true';
    els.setDetail.hidden = false;
    els.setsView.hidden = true;
    announce('Состав сета «' + set.name + '»');
    document.getElementById('main').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function startSetQuiz(setId) {
    const set = allItems.find(item => item.id === setId);
    if (!set) return;
    quizScope = 'sets';
    quizPool = [set];
    quizStats = { correct: 0, total: 0 };
    activeTab = 'quiz';
    els.catalog.hidden = true;
    els.setsView.hidden = true;
    els.quiz.hidden = false;
    els.catalogTab.classList.remove('active');
    els.setsTab.classList.remove('active');
    els.quizTab.classList.add('active');
    els.catalogTab.setAttribute('aria-pressed', 'false');
    els.setsTab.setAttribute('aria-pressed', 'false');
    els.quizTab.setAttribute('aria-pressed', 'true');
    els.quizFilters.forEach(filter => {
      const active = filter.dataset.quizScope === 'sets';
      filter.classList.toggle('active', active);
      filter.setAttribute('aria-pressed', String(active));
    });
    els.quizScore.textContent = '0 / 0';
    els.quizContent.hidden = false;
    els.quizEmpty.hidden = true;
    nextQuizQuestion();
    document.getElementById('main').scrollIntoView({ behavior: 'smooth', block: 'start' });
    announce('Тренировка по сету «' + set.name + '». Угадайте роллы по составу.');
  }

  // ===== CATALOG =====
  function getFilteredItems() {
    let items = allItems;

    if (currentCategory !== 'all') {
      items = items.filter(i => i.category === currentCategory);
    }

    if (searchQuery) {
      items = items.filter(i =>
        i.name.toLowerCase().includes(searchQuery) ||
        (i.description && i.description.toLowerCase().includes(searchQuery))
      );
    }

    if (hardOnly) {
      items = items.filter(i => state.hard.includes(i.id));
    }

    return items;
  }

  function renderCatalog() {
    const items = getFilteredItems();
    els.resultCount.textContent = items.length + ' блюд' + (items.length !== allItems.length ? ' из ' + allItems.length : '');

    if (items.length === 0) {
      els.cards.innerHTML = '';
      els.catalogEmpty.hidden = false;
      return;
    }

    els.catalogEmpty.hidden = true;
    els.cards.innerHTML = items.map(item => createCardHtml(item)).join('');

    // Bind card buttons
    for (const item of items) {
      const card = document.getElementById('card-' + item.id);
      if (card) {
        const knownBtn = card.querySelector('.btn-known');
        const hardBtn = card.querySelector('.btn-hard');
        if (knownBtn) knownBtn.addEventListener('click', () => toggleKnown(item.id));
        if (hardBtn) hardBtn.addEventListener('click', () => toggleHard(item.id));
      }
    }
  }

  function createCardHtml(item) {
    const isKnown = state.known.includes(item.id);
    const isHard = state.hard.includes(item.id);
    const ingredients = parseIngredients(item.description);
    const showIngredients = ingredients.length > 0;

    return `
      <article class="card" id="card-${escapeHtml(item.id)}">
        <img class="card-image" src="${escapeHtml(item.image)}" alt="" loading="lazy">
        <div class="card-body">
          <div class="card-meta">
            <span class="card-category">${escapeHtml(item.category)}</span>
            <span>${escapeHtml(item.weight || '')}</span>
          </div>
          <h3>${escapeHtml(item.name)}</h3>
          ${item.description ? `<p class="card-details card-description">${escapeHtml(item.description)}</p>` : ''}
          ${showIngredients ? `<ul class="ingredients" aria-label="Ингредиенты">${ingredients.map(ing => `<li>${escapeHtml(ing)}</li>`).join('')}</ul>` : ''}
          <div class="card-actions">
            <button type="button" class="state-button btn-known ${isKnown ? 'selected-known' : ''}" aria-pressed="${isKnown}" data-id="${escapeHtml(item.id)}">
              ${isKnown ? '✓ Знаю' : 'Знаю'}
            </button>
            <button type="button" class="state-button btn-hard ${isHard ? 'selected-hard' : ''}" aria-pressed="${isHard}" data-id="${escapeHtml(item.id)}">
              ${isHard ? '⟳ Повторить' : 'Повторить'}
            </button>
          </div>
        </div>
      </article>
    `;
  }

  function toggleKnown(id) {
    const idx = state.known.indexOf(id);
    if (idx >= 0) {
      state.known.splice(idx, 1);
    } else {
      state.known.push(id);
      // Remove from hard if present
      const hIdx = state.hard.indexOf(id);
      if (hIdx >= 0) state.hard.splice(hIdx, 1);
    }
    saveState();
    updateDashboard();
    renderCatalog();
    announce(state.known.includes(id) ? 'Добавлено в «Знаю»' : 'Убрано из «Знаю»');
  }

  function toggleHard(id) {
    const idx = state.hard.indexOf(id);
    if (idx >= 0) {
      state.hard.splice(idx, 1);
    } else {
      state.hard.push(id);
      // Remove from known if present
      const kIdx = state.known.indexOf(id);
      if (kIdx >= 0) state.known.splice(kIdx, 1);
    }
    saveState();
    updateDashboard();
    renderCatalog();
    announce(state.hard.includes(id) ? 'Добавлено в «Повторить»' : 'Убрано из «Повторить»');
  }

  // ===== DASHBOARD =====
  function updateDashboard() {
    const total = allItems.length;
    const known = state.known.length;
    const hard = state.hard.length;
    const studied = known + hard;
    const percent = total > 0 ? Math.round((studied / total) * 100) : 0;

    els.knownCount.textContent = known;
    els.hardCount.textContent = hard;
    els.progress.value = percent;
    els.progressLabel.textContent = percent + '%';
  }

  // ===== QUIZ =====
  function getQuizPool() {
    let items = allItems.filter(i => i.image); // Only items with images

    if (quizScope === 'sets') {
      items = items.filter(i => /сет/i.test(i.category || '') && !/сезон/i.test(i.category || '') && getSetRolls(i).length);
    } else if (quizScope === 'rolls') {
      items = items.filter(i => /ролл/i.test(i.category || ''));
    } else if (quizScope === 'studied') {
      items = items.filter(i => state.known.includes(i.id));
    } else if (quizScope === 'hard') {
      items = items.filter(i => state.hard.includes(i.id));
    }

    // The training tab has explicit pools above; the shared toolbar checkbox
    // applies only when the pool is “all” for backwards compatibility.
    if (quizScope === 'all' && hardOnly) {
      items = items.filter(i => state.hard.includes(i.id));
    }

    // Exclude items already known? Optional - let's include all for quiz
    return items;
  }

  function renderQuiz() {
    quizPool = getQuizPool();
    quizStats = { correct: 0, total: 0 };
    els.quizScore.textContent = '0 / 0';

    if (quizPool.length === 0) {
      els.quizContent.hidden = true;
      els.quizEmpty.hidden = false;
      const messages = {
        hard: 'В «Повторить» пока нет блюд. Отметьте их в каталоге.',
        studied: 'В «Знаю» пока нет блюд. Отметьте их в каталоге.',
        sets: 'В сетах нет блюд.',
        rolls: 'В роллах нет блюд.'
      };
      els.quizEmpty.textContent = messages[quizScope] || 'Нет блюд для тренировки.';
      return;
    }

    els.quizContent.hidden = false;
    els.quizEmpty.hidden = true;
    nextQuizQuestion();
  }

  function nextQuizQuestion() {
    if (quizPool.length === 0) {
      renderQuiz();
      return;
    }

    // Pick random item
    const idx = Math.floor(Math.random() * quizPool.length);
    quizCurrent = quizPool.splice(idx, 1)[0];

    // Build options: correct + 3 distractors
    quizOptions = buildOptions(quizCurrent);
    quizAnswered = false;

    // Render ingredients list
    const ingredients = parseIngredients(quizCurrent.description);
    els.quizIngredientsList.innerHTML = ingredients.map(ing => `
      <li>${escapeHtml(ing)}</li>
    `).join('');

    // Render options
    els.answers.innerHTML = quizOptions.map((opt, i) => `
      <button type="button" class="answer" data-index="${i}" data-correct="${opt.id === quizCurrent.id}">
        ${escapeHtml(opt.name)}
      </button>
    `).join('');

    els.quizFeedback.textContent = '';
    els.quizFeedback.className = 'feedback';
    els.nextBtn.hidden = true;

    // Bind answer clicks
    els.answers.querySelectorAll('.answer').forEach(btn => {
      btn.addEventListener('click', () => handleAnswer(btn));
    });
  }

  function buildOptions(correctItem) {
    const pool = allItems.filter(i => i.id !== correctItem.id && i.image);

    // Prefer same category distractors
    const sameCat = pool.filter(i => i.category === correctItem.category);
    const otherCat = pool.filter(i => i.category !== correctItem.category);

    const distractors = [];
    // Take up to 3 from same category
    const needed = 3;
    const fromSame = shuffle([...sameCat]).slice(0, needed);
    distractors.push(...fromSame);

    // Fill rest from other categories
    if (distractors.length < needed) {
      const fromOther = shuffle([...otherCat]).slice(0, needed - distractors.length);
      distractors.push(...fromOther);
    }

    // If still not enough (very small menu), duplicate with different names? Just take what we have
    const options = [{ ...correctItem, correct: true }, ...distractors.map(d => ({ ...d, correct: false }))];
    return shuffle(options);
  }

  function handleAnswer(btn) {
    if (quizAnswered) return;
    quizAnswered = true;

    const isCorrect = btn.dataset.correct === 'true';
    const index = parseInt(btn.dataset.index, 10);
    const selectedOption = quizOptions[index];

    // Disable all buttons
    els.answers.querySelectorAll('.answer').forEach(b => {
      b.disabled = true;
      if (b.dataset.correct === 'true') {
        b.classList.add('correct');
      } else if (b === btn) {
        b.classList.add('wrong');
      }
    });

    quizStats.total++;
    if (isCorrect) {
      quizStats.correct++;
      els.quizFeedback.textContent = 'Верно! Это «' + quizCurrent.name + '».';
      els.quizFeedback.className = 'feedback good';
      announce('Правильный ответ. ' + quizCurrent.name);
    } else {
      els.quizFeedback.textContent = 'Неправильно. Это «' + quizCurrent.name + '», а не «' + selectedOption.name + '».';
      els.quizFeedback.className = 'feedback bad';
      announce('Неправильно. Правильный ответ: ' + quizCurrent.name);
    }

    els.quizScore.textContent = quizStats.correct + ' / ' + quizStats.total;
    els.nextBtn.hidden = false;
    els.nextBtn.focus();
  }

  // ===== START =====
  // Check if menu.json exists by trying to fetch
  loadMenu();
})();