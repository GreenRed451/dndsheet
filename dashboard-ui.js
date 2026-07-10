(function () {
  'use strict';

  const CLASS_LABELS = {
    barbarian: 'Варвар', bard: 'Бард', cleric: 'Жрец', druid: 'Друид', fighter: 'Воин',
    monk: 'Монах', paladin: 'Паладин', ranger: 'Следопыт', rogue: 'Плут',
    sorcerer: 'Чародей', warlock: 'Колдун', wizard: 'Волшебник'
  };

  const CLASS_ICONS = {
    barbarian: '🪓', bard: '♫', cleric: '✦', druid: '❧', fighter: '⚔', monk: '◈',
    paladin: '☀', ranger: '➶', rogue: '◆', sorcerer: '✧', warlock: '◉', wizard: '✦'
  };


  const ACCENT_PRESETS = [
    { id: 'class', label: 'Цвет класса', color: null },
    { id: 'pink', label: 'Розовый', color: '#df5f9d' },
    { id: 'rose', label: 'Розово-красный', color: '#d95c75' },
    { id: 'violet', label: 'Фиолетовый', color: '#855bd8' },
    { id: 'blue', label: 'Синий', color: '#477fd4' },
    { id: 'cyan', label: 'Бирюзовый', color: '#258ba3' },
    { id: 'emerald', label: 'Изумрудный', color: '#398d6a' },
    { id: 'amber', label: 'Янтарный', color: '#bd8426' }
  ];

  function normalizeHex(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(raw)) return raw;
    if (/^#[0-9a-f]{3}$/.test(raw)) {
      return '#' + raw.slice(1).split('').map(ch => ch + ch).join('');
    }
    return null;
  }

  function hexToRgb(hex) {
    const value = normalizeHex(hex);
    if (!value) return null;
    return {
      r: parseInt(value.slice(1, 3), 16),
      g: parseInt(value.slice(3, 5), 16),
      b: parseInt(value.slice(5, 7), 16)
    };
  }

  function mixHex(hex, target, amount) {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const t = target === 'white' ? 255 : 0;
    const mix = channel => Math.round(channel + (t - channel) * amount).toString(16).padStart(2, '0');
    return `#${mix(rgb.r)}${mix(rgb.g)}${mix(rgb.b)}`;
  }

  function resolveAccent(value) {
    if (!value || value === 'class') return { id: 'class', color: null, label: 'Цвет класса' };
    const preset = ACCENT_PRESETS.find(item => item.id === value || item.color?.toLowerCase() === String(value).toLowerCase());
    if (preset) return preset;
    const custom = normalizeHex(value);
    return custom ? { id: 'custom', color: custom, label: 'Свой цвет' } : ACCENT_PRESETS[0];
  }

  function setCharacterAccent(value, shouldSync = true) {
    const accent = resolveAccent(value);
    const body = document.body;
    body.dataset.characterAccent = accent.color || 'class';

    if (!accent.color) {
      ['--accent', '--accent-rgb', '--accent-strong', '--accent-soft'].forEach(name => body.style.removeProperty(name));
    } else {
      const rgb = hexToRgb(accent.color);
      body.style.setProperty('--accent', accent.color);
      body.style.setProperty('--accent-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
      body.style.setProperty('--accent-strong', mixHex(accent.color, 'black', .18));
      body.style.setProperty('--accent-soft', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, .14)`);
    }

    updateAccentPicker();
    if (shouldSync) {
      document.dispatchEvent(new Event('change', { bubbles: true }));
      if (typeof window.fbSync === 'function') window.fbSync();
    }
  }

  window.setCharacterAccent = setCharacterAccent;

  const $ = (id) => document.getElementById(id);
  const valueOf = (id, fallback = '') => {
    const el = $(id);
    return el && String(el.value ?? el.textContent ?? '').trim() ? String(el.value ?? el.textContent).trim() : fallback;
  };

  function regroupTopbar() {
    const topbar = document.querySelector('.topbar');
    if (!topbar || topbar.querySelector('.topbar-actions')) return;

    const brand = topbar.querySelector('h1');
    const fbBar = topbar.querySelector('.fb-bar');
    const actions = document.createElement('div');
    actions.className = 'topbar-actions';

    [...topbar.children].forEach((child) => {
      if (child !== brand && child !== fbBar) actions.appendChild(child);
    });

    const themeButton = document.createElement('button');
    themeButton.type = 'button';
    themeButton.className = 'btn theme-toggle';
    themeButton.id = 'themeToggle';
    themeButton.title = 'Переключить светлую и тёмную тему';
    themeButton.setAttribute('aria-label', 'Переключить тему');
    themeButton.addEventListener('click', toggleTheme);
    actions.appendChild(themeButton);

    topbar.appendChild(actions);
    updateThemeButton();
  }

  function createDashboard() {
    const sheet = document.querySelector('.sheet');
    if (!sheet || $('characterDashboard')) return;

    const gmPanel = $('gmPanel');
    const identitySection = [...sheet.children].find((el) => el.classList && el.classList.contains('section'));
    if (!identitySection) return;

    const dashboard = document.createElement('section');
    dashboard.className = 'character-dashboard';
    dashboard.id = 'characterDashboard';
    dashboard.innerHTML = `
      <div class="dashboard-profile">
        <div class="dashboard-avatar" id="dashboardAvatar" aria-hidden="true">⚔</div>
        <div>
          <div class="dashboard-eyebrow">Лист персонажа</div>
          <h2 class="dashboard-name" id="dashboardName">Безымянный герой</h2>
          <p class="dashboard-meta" id="dashboardMeta">Персонаж 1 уровня</p>
          <div class="dashboard-chips">
            <span class="dashboard-chip" id="dashboardBackground">Предыстория не указана</span>
            <span class="dashboard-chip" id="dashboardAlignment">Мировоззрение не указано</span>
            <span class="dashboard-chip" id="dashboardPlayer">Игрок не указан</span>
          </div>
        </div>
        <div class="dashboard-profile-actions">
          <button type="button" class="btn dashboard-edit-btn" id="dashboardEdit">✎ Изменить данные</button>
          <div class="accent-picker-wrap">
            <button type="button" class="btn dashboard-accent-btn" id="dashboardAccentButton" aria-expanded="false" aria-controls="accentPicker">
              <span class="accent-button-dot" id="accentButtonDot" aria-hidden="true"></span>
              <span id="accentButtonLabel">Цвет класса</span>
            </button>
            <div class="accent-picker" id="accentPicker" hidden>
              <div class="accent-picker-head">
                <div>
                  <strong>Цветовой акцент</strong>
                  <span>Сохраняется отдельно для персонажа</span>
                </div>
                <button type="button" class="accent-picker-close" id="accentPickerClose" aria-label="Закрыть выбор цвета">×</button>
              </div>
              <div class="accent-swatches" id="accentSwatches"></div>
              <label class="accent-custom">
                <span>Свой цвет</span>
                <span class="accent-custom-control">
                  <input type="color" id="accentCustomColor" value="#df5f9d" aria-label="Выбрать собственный цвет">
                  <span id="accentCustomValue">#DF5F9D</span>
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>
      <div class="dashboard-vitals" aria-label="Ключевые показатели персонажа">
        <div class="dashboard-metric hp">
          <div>
            <div class="dashboard-metric-label">Хиты</div>
            <div class="dashboard-metric-value" id="dashboardHp">0 / 0</div>
            <div class="dashboard-metric-sub" id="dashboardTempHp">Без временных хитов</div>
          </div>
          <div class="dashboard-hp-track"><div class="dashboard-hp-fill" id="dashboardHpFill"></div></div>
        </div>
        <div class="dashboard-metric">
          <div class="dashboard-metric-label">КД</div>
          <div class="dashboard-metric-value" id="dashboardAc">10</div>
          <div class="dashboard-metric-sub">Защита</div>
        </div>
        <div class="dashboard-metric">
          <div class="dashboard-metric-label">Инициатива</div>
          <div class="dashboard-metric-value" id="dashboardInit">+0</div>
          <div class="dashboard-metric-sub">Порядок хода</div>
        </div>
        <div class="dashboard-metric">
          <div class="dashboard-metric-label">Скорость</div>
          <div class="dashboard-metric-value" id="dashboardSpeed">30</div>
          <div class="dashboard-metric-sub">Передвижение</div>
        </div>
        <div class="dashboard-metric">
          <div class="dashboard-metric-label">Мастерство</div>
          <div class="dashboard-metric-value" id="dashboardProf">+2</div>
          <div class="dashboard-metric-sub">Бонус</div>
        </div>
        <div class="dashboard-metric">
          <div class="dashboard-metric-label">Внимательность</div>
          <div class="dashboard-metric-value" id="dashboardPassive">10</div>
          <div class="dashboard-metric-sub">Пассивная</div>
        </div>
        <div class="dashboard-metric">
          <div class="dashboard-metric-label">Вдохновение</div>
          <div class="dashboard-metric-value" id="dashboardInspiration">0</div>
          <div class="dashboard-metric-sub">Доступно</div>
        </div>
      </div>`;

    const details = document.createElement('details');
    details.className = 'identity-editor';
    details.id = 'identityEditor';
    details.innerHTML = '<summary><span>Данные персонажа</span><span class="identity-editor-summary-note">Имя, класс, уровень, раса и история</span></summary>';
    identitySection.parentNode.insertBefore(details, identitySection);
    details.appendChild(identitySection);

    const anchor = gmPanel && gmPanel.parentNode === sheet ? gmPanel.nextSibling : sheet.firstChild;
    sheet.insertBefore(dashboard, anchor);

    $('dashboardEdit').addEventListener('click', () => {
      details.open = !details.open;
      if (details.open) details.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }


  function renderAccentSwatches() {
    const container = $('accentSwatches');
    if (!container || container.childElementCount) return;
    ACCENT_PRESETS.forEach(item => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'accent-swatch';
      button.dataset.accentValue = item.id;
      button.title = item.label;
      button.setAttribute('aria-label', item.label);
      button.innerHTML = item.id === 'class'
        ? '<span class="accent-swatch-class">✦</span><span>Класс</span>'
        : `<span class="accent-swatch-color" style="--swatch:${item.color}"></span><span>${item.label}</span>`;
      button.addEventListener('click', () => {
        setCharacterAccent(item.id);
        closeAccentPicker();
      });
      container.appendChild(button);
    });
  }

  function updateAccentPicker() {
    const current = resolveAccent(document.body.dataset.characterAccent || 'class');
    const label = $('accentButtonLabel');
    const dot = $('accentButtonDot');
    const custom = $('accentCustomColor');
    const customValue = $('accentCustomValue');
    if (label) label.textContent = current.label;
    if (dot) {
      dot.classList.toggle('uses-class-color', !current.color);
      dot.style.background = current.color || 'var(--accent)';
    }
    document.querySelectorAll('.accent-swatch').forEach(button => {
      const choice = resolveAccent(button.dataset.accentValue);
      const selected = current.id === choice.id || (!!current.color && current.color === choice.color);
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    if (custom && current.color) custom.value = current.color;
    if (customValue) customValue.textContent = (current.color || custom?.value || '#df5f9d').toUpperCase();
  }

  function positionAccentPicker() {
    const picker = $('accentPicker');
    const button = $('dashboardAccentButton');
    if (!picker || !button || picker.hidden) return;
    if (window.innerWidth <= 650) {
      picker.style.left = '10px';
      picker.style.right = '10px';
      picker.style.top = 'auto';
      picker.style.bottom = '10px';
      return;
    }
    picker.style.right = 'auto';
    picker.style.bottom = 'auto';
    const rect = button.getBoundingClientRect();
    const width = Math.min(350, window.innerWidth - 30);
    const left = Math.max(15, Math.min(rect.left, window.innerWidth - width - 15));
    const measuredHeight = picker.offsetHeight || 330;
    const below = rect.bottom + 9;
    const top = below + measuredHeight <= window.innerHeight - 15
      ? below
      : Math.max(15, rect.top - measuredHeight - 9);
    picker.style.width = `${width}px`;
    picker.style.left = `${left}px`;
    picker.style.top = `${top}px`;
  }

  function openAccentPicker() {
    const picker = $('accentPicker');
    const button = $('dashboardAccentButton');
    if (!picker) return;
    picker.hidden = false;
    button?.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => {
      positionAccentPicker();
      picker.classList.add('open');
    });
  }

  function closeAccentPicker() {
    const picker = $('accentPicker');
    const button = $('dashboardAccentButton');
    if (!picker || picker.hidden) return;
    picker.classList.remove('open');
    button?.setAttribute('aria-expanded', 'false');
    window.setTimeout(() => { if (!picker.classList.contains('open')) picker.hidden = true; }, 140);
  }

  function setupAccentPicker() {
    renderAccentSwatches();
    const button = $('dashboardAccentButton');
    const picker = $('accentPicker');
    const close = $('accentPickerClose');
    const custom = $('accentCustomColor');
    if (!button || !picker) return;

    button.addEventListener('click', event => {
      event.stopPropagation();
      picker.hidden ? openAccentPicker() : closeAccentPicker();
    });
    close?.addEventListener('click', closeAccentPicker);
    if (picker.parentElement !== document.body) document.body.appendChild(picker);
    picker.addEventListener('click', event => event.stopPropagation());
    window.addEventListener('resize', positionAccentPicker);
    window.addEventListener('scroll', positionAccentPicker, true);
    custom?.addEventListener('input', () => {
      const color = normalizeHex(custom.value);
      if (!color) return;
      if ($('accentCustomValue')) $('accentCustomValue').textContent = color.toUpperCase();
      setCharacterAccent(color);
    });
    document.addEventListener('click', closeAccentPicker);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !picker.hidden) {
        closeAccentPicker();
        button.focus({ preventScroll: true });
      }
    });
    updateAccentPicker();
  }

  function makeGmPanelCollapsible() {
    const panel = $('gmPanel');
    const title = panel && panel.querySelector('.gm-panel-title');
    if (!panel || !title || title.dataset.collapsible === '1') return;
    title.dataset.collapsible = '1';
    title.setAttribute('role', 'button');
    title.setAttribute('tabindex', '0');
    const toggle = () => panel.classList.toggle('collapsed');
    title.addEventListener('click', toggle);
    title.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggle();
      }
    });
  }

  function setTheme(theme) {
    document.body.dataset.theme = theme;
    try { localStorage.setItem('dnd_dashboard_theme', theme); } catch (_) {}
    updateThemeButton();
  }

  function toggleTheme() {
    setTheme(document.body.dataset.theme === 'dark' ? 'light' : 'dark');
  }

  function updateThemeButton() {
    const button = $('themeToggle');
    if (!button) return;
    const dark = document.body.dataset.theme === 'dark';
    button.textContent = dark ? '☀' : '☾';
    button.title = dark ? 'Включить светлую тему' : 'Включить тёмную тему';
  }

  function applySavedTheme() {
    let saved = null;
    try { saved = localStorage.getItem('dnd_dashboard_theme'); } catch (_) {}
    if (saved === 'dark' || saved === 'light') {
      document.body.dataset.theme = saved;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.body.dataset.theme = 'dark';
    } else {
      document.body.dataset.theme = 'light';
    }
  }

  function refreshDashboard() {
    if (!$('characterDashboard')) return;

    const classKey = valueOf('classSelect', 'fighter');
    const className = CLASS_LABELS[classKey] || classKey || 'Персонаж';
    const level = valueOf('levelInput', '1');
    const race = valueOf('race', '') || (($('racePresetSelect') && $('racePresetSelect').selectedOptions[0]) ? $('racePresetSelect').selectedOptions[0].textContent : '') || 'Раса не указана';
    const charName = valueOf('charName', 'Безымянный герой');
    const playerName = valueOf('playerName', valueOf('fbNameInput', 'Игрок не указан'));
    const background = valueOf('background', 'Предыстория не указана');
    const alignment = valueOf('alignment', 'Мировоззрение не указано');

    $('dashboardName').textContent = charName;
    $('dashboardMeta').textContent = `${className} ${level} ур. · ${race}`;
    $('dashboardAvatar').textContent = CLASS_ICONS[classKey] || charName.slice(0, 1).toUpperCase() || '⚔';
    $('dashboardBackground').textContent = background;
    $('dashboardAlignment').textContent = alignment;
    $('dashboardPlayer').textContent = playerName;

    const hpCur = Number(valueOf('hpCur', '0')) || 0;
    const hpMax = Math.max(1, Number(valueOf('hpMax', '1')) || 1);
    const hpTemp = Math.max(0, Number(valueOf('hpTemp', '0')) || 0);
    const hpPct = Math.max(0, Math.min(100, (hpCur / hpMax) * 100));
    $('dashboardHp').textContent = `${hpCur} / ${hpMax}`;
    $('dashboardTempHp').textContent = hpTemp ? `+${hpTemp} временных хитов` : 'Без временных хитов';
    $('dashboardHpFill').style.setProperty('--hp-pct', `${hpPct}%`);

    $('dashboardAc').textContent = valueOf('ac', '10');
    $('dashboardInit').textContent = valueOf('initField', '+0');
    $('dashboardSpeed').textContent = valueOf('speed', '30 фт.');
    $('dashboardProf').textContent = valueOf('profBonusDisplay', '+2');
    $('dashboardPassive').textContent = valueOf('passivePerc', '10');
    $('dashboardInspiration').textContent = valueOf('inspirationCount', '0');

    const pointsLeft = $('pointsLeft');
    if (pointsLeft) {
      const points = Number(pointsLeft.textContent) || 0;
      pointsLeft.style.color = points === 0 ? 'var(--success)' : points < 0 ? 'var(--danger)' : 'var(--accent-strong)';
    }

    [...document.body.classList].filter((name) => name.startsWith('class-')).forEach((name) => document.body.classList.remove(name));
    document.body.classList.add(`class-${classKey}`);
  }

  function decorateGmCards() {
    const list = $('gmPlayerList');
    if (!list) return;
    list.querySelectorAll('.player-card').forEach((card) => {
      const isLive = /LIVE|Смотрю Live/.test(card.textContent || '');
      card.classList.toggle('is-live', isLive);

      card.querySelectorAll('span').forEach((span) => {
        const match = (span.textContent || '').trim().match(/^(\d+)мин назад$/);
        if (!match) return;
        const minutes = Number(match[1]);
        if (minutes < 60) return;
        if (minutes < 1440) span.textContent = `${Math.round(minutes / 60)} ч назад`;
        else if (minutes < 43200) span.textContent = `${Math.round(minutes / 1440)} дн. назад`;
        else span.textContent = 'давно';
      });
    });
  }

  function humanizeGmTimestamps() {
    // Existing cards are rebuilt by the Firebase code. A lightweight observer decorates each rebuild.
    const list = $('gmPlayerList');
    if (!list || list.dataset.dashboardObserver === '1') return;
    list.dataset.dashboardObserver = '1';
    const observer = new MutationObserver(() => {
      decorateGmCards();
      refreshDashboard();
    });
    observer.observe(list, { childList: true, subtree: true });
    decorateGmCards();
  }

  function hookRefreshes() {
    document.addEventListener('input', refreshDashboard, true);
    document.addEventListener('change', refreshDashboard, true);

    const names = ['updateAll', 'updateHpBar', 'updateArmorClass', 'updatePassive', 'renderClass', 'applySheetData'];
    names.forEach((name) => {
      const original = window[name];
      if (typeof original !== 'function' || original.__dashboardWrapped) return;
      const wrapped = function (...args) {
        const result = original.apply(this, args);
        queueMicrotask(refreshDashboard);
        return result;
      };
      wrapped.__dashboardWrapped = true;
      window[name] = wrapped;
    });

    // Covers direct value assignments in older helper functions without making the app dependent on them.
    window.setInterval(refreshDashboard, 900);
  }

  function init() {
    applySavedTheme();
    regroupTopbar();
    createDashboard();
    setupAccentPicker();
    makeGmPanelCollapsible();
    humanizeGmTimestamps();
    hookRefreshes();
    refreshDashboard();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.setTimeout(init, 0), { once: true });
  } else {
    init();
  }
})();
