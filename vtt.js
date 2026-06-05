const FB_CONFIG = {
  apiKey: "AIzaSyBEjhg3RC4EzeaK792Ob2pn5krfXnn6rxk",
  authDomain: "dndsheet-1c7c2.firebaseapp.com",
  databaseURL: "https://dndsheet-1c7c2-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "dndsheet-1c7c2",
  storageBucket: "dndsheet-1c7c2.firebasestorage.app",
  messagingSenderId: "771509243100",
  appId: "1:771509243100:web:b4655cafbe4935de447819"
};

const CLASS_LABELS = {
  barbarian: 'Варвар', bard: 'Бард', cleric: 'Жрец', druid: 'Друид', fighter: 'Воин',
  monk: 'Монах', paladin: 'Паладин', ranger: 'Следопыт', rogue: 'Плут',
  sorcerer: 'Чародей', warlock: 'Колдун', wizard: 'Волшебник'
};

const TOKEN_COLORS = ['#534AB7', '#1D9E75', '#BA7517', '#D4537E', '#378ADD', '#639922', '#D85A30'];
const VTT_STATE_KEY = '__vtt';

let fbApp = null;
let fbDb = null;
let room = '';
let playerName = '';
let playerKey = '';
let isGm = false;
let players = {};
let vtt = { scene: { mapUrl: '', gridSize: 48 }, tokens: {} };
let unsubPlayers = null;
let unsubVtt = null;
let dragState = null;
let playerTokenWriteTimer = null;
let playersLoaded = false;
let vttLoaded = false;
let mapMetrics = { url: '', width: 0, height: 0 };
let resizeRenderTimer = null;
let camera = { zoom: 1, panX: 0, panY: 0 };
let panState = null;
let selectedTokenId = '';
let pendingTokenPatches = {};
let inspectorDrafts = {};

function el(id) {
  return document.getElementById(id);
}

function sanitizeFirebaseKey(value) {
  return String(value || '').trim().replace(/[\x00-\x1F\x7F.#$\[\]\/'"`<>\\]/g, '_');
}

function toast(message) {
  const node = el('toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(node._hide);
  node._hide = setTimeout(() => node.classList.remove('show'), 1800);
}

function setStatus(color, text) {
  el('statusDot').className = 'status-dot' + (color ? ' ' + color : '');
  el('statusText').textContent = text;
}

function initFirebase() {
  if (fbApp) return true;
  if (!window._fbMod) {
    setStatus('red', 'Firebase не загружен');
    return false;
  }
  const { initializeApp, getDatabase } = window._fbMod;
  fbApp = initializeApp(FB_CONFIG);
  fbDb = getDatabase(fbApp);
  return true;
}

function tokenIdForPlayer(key) {
  return 'player_' + sanitizeFirebaseKey(key);
}

function monsterId() {
  return 'monster_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function vttStatePath(path = '') {
  return `rooms/${room}/players/${VTT_STATE_KEY}${path ? '/' + path : ''}`;
}

function actualPlayerEntries() {
  const regularEntries = Object.entries(players).filter(([key]) => !String(key).startsWith('__'));
  const byName = new Map();
  regularEntries.forEach(([key, data]) => {
    const summary = playerSummary(data || {}, key);
    const identity = String(summary.name || key).trim().toLowerCase();
    const current = byName.get(identity);
    if (!current || playerTimestamp(data) >= playerTimestamp(current[1])) {
      byName.set(identity, [key, data]);
    }
  });
  return Array.from(byName.values());
}

function rememberPendingTokenPatch(id, patch) {
  pendingTokenPatches[id] = {
    patch: Object.assign({}, patch),
    expiresAt: Date.now() + 30000
  };
  applyPendingTokenPatches();
}

function applyPendingTokenPatches() {
  const now = Date.now();
  Object.entries(pendingTokenPatches).forEach(([id, entry]) => {
    if (!entry || entry.expiresAt < now) {
      delete pendingTokenPatches[id];
      return;
    }
    const token = (vtt.tokens || {})[id];
    if (!token) return;
    if (token.type === 'monster') {
      Object.assign(token, entry.patch);
      if (!vtt.monsterStats) vtt.monsterStats = {};
      vtt.monsterStats[id] = Object.assign({}, vtt.monsterStats[id] || {}, entry.patch);
      return;
    }
    if (token.type === 'player' && players[token.playerKey]) {
      const playerPatch = {};
      ['ac', 'hpCur', 'hpMax'].forEach(key => {
        if (Object.prototype.hasOwnProperty.call(entry.patch, key)) playerPatch[key] = entry.patch[key];
      });
      Object.assign(players[token.playerKey], playerPatch);
      if (Object.prototype.hasOwnProperty.call(entry.patch, 'note')) token.note = entry.patch.note;
    }
  });
}

function activePlayerKeys() {
  return new Set(actualPlayerEntries().map(([key]) => key));
}

function playerTimestamp(data) {
  const value = data && (data._ts || data.updatedAt || data.savedAt || data.createdAt);
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function initials(name) {
  const words = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return words.slice(0, 2).map(word => word[0]).join('').toUpperCase();
}

function hpColor(cur, max) {
  const pct = max > 0 ? cur / max * 100 : 0;
  if (pct > 50) return '#639922';
  if (pct > 25) return '#BA7517';
  return '#993C1D';
}

function canMoveToken(token) {
  if (!token) return false;
  if (isGm) return true;
  return token.type === 'player' && token.playerKey === playerKey;
}

function playerSummary(data, fallbackName) {
  const name = data.charName || data._name || fallbackName;
  const cls = CLASS_LABELS[data.classSelect] || data.classSelect || '';
  const level = data.levelInput || 1;
  const hpMax = parseInt(data.hpMax, 10) || 1;
  const hpCur = parseInt(data.hpCur, 10) || 0;
  const ac = data.ac || 10;
  return { name, cls, level, hpMax, hpCur, ac };
}

function loadMapMetrics(url) {
  if (!url || mapMetrics.url === url) return;
  mapMetrics = { url, width: 0, height: 0 };
  const image = new Image();
  image.onload = () => {
    if (mapMetrics.url !== url) return;
    mapMetrics = { url, width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
    renderBoard();
  };
  image.onerror = () => {
    if (mapMetrics.url !== url) return;
    mapMetrics = { url, width: 0, height: 0 };
    toast('Карта не загрузилась. Проверьте URL');
  };
  image.src = url;
}

function getMapRect(board, scene) {
  const width = board.clientWidth || 1;
  const height = board.clientHeight || 1;
  if (!scene.mapUrl || mapMetrics.url !== scene.mapUrl || !mapMetrics.width || !mapMetrics.height) {
    return { left: camera.panX, top: camera.panY, width: width * camera.zoom, height: height * camera.zoom, scale: camera.zoom };
  }
  const scale = Math.min(width / mapMetrics.width, height / mapMetrics.height) * camera.zoom;
  const mapWidth = mapMetrics.width * scale;
  const mapHeight = mapMetrics.height * scale;
  return {
    left: (width - mapWidth) / 2 + camera.panX,
    top: (height - mapHeight) / 2 + camera.panY,
    width: mapWidth,
    height: mapHeight,
    scale
  };
}

function setZoom(nextZoom, anchorX, anchorY) {
  const board = el('board');
  const scene = vtt.scene || {};
  const before = getMapRect(board, scene);
  const oldZoom = camera.zoom;
  const next = Math.max(0.35, Math.min(4, nextZoom));
  if (Math.abs(next - oldZoom) < 0.001) return;
  const ax = Number.isFinite(anchorX) ? anchorX : board.clientWidth / 2;
  const ay = Number.isFinite(anchorY) ? anchorY : board.clientHeight / 2;
  const mapX = (ax - before.left) / before.scale;
  const mapY = (ay - before.top) / before.scale;
  camera.zoom = next;
  const after = getMapRect(board, scene);
  camera.panX += ax - (after.left + mapX * after.scale);
  camera.panY += ay - (after.top + mapY * after.scale);
  renderBoard();
  updateZoomLabel();
}

function resetCamera() {
  camera = { zoom: 1, panX: 0, panY: 0 };
  renderBoard();
  updateZoomLabel();
}

function updateZoomLabel() {
  if (el('zoomLabel')) el('zoomLabel').textContent = Math.round(camera.zoom * 100) + '%';
}

function hashString(value) {
  let hash = 0;
  String(value || '').split('').forEach(ch => {
    hash = ((hash << 5) - hash) + ch.charCodeAt(0);
    hash |= 0;
  });
  return hash;
}

function reportWriteError(message, error) {
  console.error(message, error);
  setStatus('red', message);
  toast(message);
}

function writeSet(path, value, errorMessage) {
  return window._fbMod.set(window._fbMod.ref(fbDb, path), value)
    .catch(error => {
      reportWriteError(errorMessage, error);
      throw error;
    });
}

function writeUpdate(path, value, errorMessage) {
  return window._fbMod.update(window._fbMod.ref(fbDb, path), value)
    .catch(error => {
      reportWriteError(errorMessage, error);
      throw error;
    });
}

function writeRootUpdate(value, errorMessage) {
  return window._fbMod.update(window._fbMod.ref(fbDb), value)
    .catch(error => {
      reportWriteError(errorMessage, error);
      throw error;
    });
}

function writeFieldPatch(path, patch, errorMessage) {
  const updates = {};
  Object.entries(patch).forEach(([key, value]) => {
    updates[`${path}/${key}`] = value;
  });
  return writeRootUpdate(updates, errorMessage);
}

function writeRemove(path, errorMessage) {
  return window._fbMod.remove(window._fbMod.ref(fbDb, path))
    .catch(error => {
      reportWriteError(errorMessage, error);
      throw error;
    });
}

async function connect() {
  if (!initFirebase()) return;
  if (room) disconnect();
  room = sanitizeFirebaseKey(el('roomInput').value);
  playerName = el('nameInput').value.trim();
  playerKey = sanitizeFirebaseKey(playerName);
  if (!room || !playerName || !playerKey) {
    alert('Заполните комнату и имя');
    return;
  }

  const { ref, get, set, onValue } = window._fbMod;
  setStatus('orange', 'Подключение...');

  const gmRef = ref(fbDb, `rooms/${room}/gm`);
  const gmSnap = await get(gmRef);
  const currentGm = gmSnap.val();
  if (!currentGm) {
    await set(gmRef, playerName);
    isGm = true;
  } else {
    isGm = currentGm === playerName;
  }

  localStorage.setItem('dnd_fb_room', room);
  localStorage.setItem('dnd_fb_name', playerName);
  el('roomInput').value = room;
  el('roomInput').disabled = true;
  el('nameInput').disabled = true;
  el('connectBtn').style.display = 'none';
  el('disconnectBtn').style.display = '';
  setGmControls();

  unsubPlayers = ref(fbDb, `rooms/${room}/players`);
  onValue(unsubPlayers, snap => {
    players = snap.val() || {};
    applyPendingTokenPatches();
    playersLoaded = true;
    ensurePlayerTokensIfReady();
    renderAll();
  });

  unsubVtt = ref(fbDb, vttStatePath());
  onValue(unsubVtt, snap => {
    vtt = snap.val() || { scene: { mapUrl: '', gridSize: 48 }, tokens: {}, monsterStats: {} };
    if (!vtt.scene) vtt.scene = { mapUrl: '', gridSize: 48 };
    if (!vtt.tokens) vtt.tokens = {};
    if (!vtt.monsterStats) vtt.monsterStats = {};
    applyPendingTokenPatches();
    vttLoaded = true;
    ensurePlayerTokensIfReady();
    renderAll();
  }, error => {
    reportWriteError('Не удалось загрузить данные стола', error);
  });

  setStatus('green', isGm ? 'Мастер · ' + room : 'Игрок · ' + room);
  toast(isGm ? 'Стол подключён: режим мастера' : 'Стол подключён: режим игрока');
}

function disconnect() {
  if (fbDb && room) {
    const { off } = window._fbMod;
    if (unsubPlayers) off(unsubPlayers);
    if (unsubVtt) off(unsubVtt);
  }
  room = '';
  playerName = '';
  playerKey = '';
  isGm = false;
  clearTimeout(playerTokenWriteTimer);
  players = {};
  vtt = { scene: { mapUrl: '', gridSize: 48 }, tokens: {} };
  unsubPlayers = null;
  unsubVtt = null;
  playersLoaded = false;
  vttLoaded = false;
  el('roomInput').disabled = false;
  el('nameInput').disabled = false;
  el('connectBtn').style.display = '';
  el('disconnectBtn').style.display = 'none';
  setGmControls();
  setStatus('', 'Не подключено');
  renderAll();
}

function setGmControls() {
  const disabled = !isGm;
  ['mapUrlInput', 'gridSizeInput', 'saveSceneBtn', 'monsterNameInput', 'monsterHpInput', 'monsterAcInput', 'addMonsterBtn']
    .forEach(id => { if (el(id)) el(id).disabled = disabled; });
  if (el('placeTokenBtn')) el('placeTokenBtn').disabled = !room;
}

function ensurePlayerTokensIfReady() {
  if (!playersLoaded || !vttLoaded) return;
  ensureOwnPlayerToken();
  if (!isGm || !fbDb || !room) return;
  clearTimeout(playerTokenWriteTimer);
  playerTokenWriteTimer = setTimeout(writeMissingPlayerTokens, 80);
}

function writeMissingPlayerTokens() {
  if (!isGm || !fbDb || !room) return;
  const updates = {};
  const existing = vtt.tokens || {};
  const activeKeys = activePlayerKeys();
  actualPlayerEntries().forEach(([key, data], index) => {
    const id = tokenIdForPlayer(key);
    if (existing[id]) return;
    const summary = playerSummary(data, key);
    updates[`${vttStatePath('tokens')}/${id}`] = {
      type: 'player',
      playerKey: key,
      name: summary.name,
      x: 2 + index,
      y: 2,
      color: TOKEN_COLORS[index % TOKEN_COLORS.length]
    };
  });
  Object.entries(existing).forEach(([id, token]) => {
    if (token.type === 'player' && !activeKeys.has(token.playerKey)) {
      updates[`${vttStatePath('tokens')}/${id}`] = null;
    }
  });
  if (Object.keys(updates).length) writeRootUpdate(updates, 'Не удалось создать токены игроков');
}

function ensureOwnPlayerToken() {
  if (!fbDb || !room || !playerKey) return;
  const existing = vtt.tokens || {};
  const id = tokenIdForPlayer(playerKey);
  if (existing[id]) return;
  const data = players[playerKey] || { _name: playerName };
  const summary = playerSummary(data, playerName);
  const token = {
    type: 'player',
    playerKey,
    name: summary.name,
    x: 2,
    y: 2,
    color: TOKEN_COLORS[Math.abs(hashString(playerKey)) % TOKEN_COLORS.length]
  };
  writeSet(vttStatePath(`tokens/${id}`), token, 'Не удалось выставить токен');
}

function placeOwnToken() {
  if (!fbDb || !room || !playerKey) {
    toast('Сначала подключитесь к комнате');
    return;
  }
  const id = tokenIdForPlayer(playerKey);
  const data = players[playerKey] || { _name: playerName };
  const summary = playerSummary(data, playerName);
  const token = Object.assign({}, (vtt.tokens || {})[id] || {}, {
    type: 'player',
    playerKey,
    name: summary.name,
    x: 2,
    y: 2,
    color: ((vtt.tokens || {})[id] || {}).color || TOKEN_COLORS[Math.abs(hashString(playerKey)) % TOKEN_COLORS.length]
  });
  writeSet(vttStatePath(`tokens/${id}`), token, 'Не удалось выставить токен')
    .then(() => toast('Токен выставлен'));
}

function saveScene() {
  if (!isGm || !fbDb || !room) {
    toast('Карту меняет мастер комнаты');
    return;
  }
  const mapUrl = el('mapUrlInput').value.trim();
  const gridSize = Math.max(24, Math.min(120, parseInt(el('gridSizeInput').value, 10) || 48));
  writeSet(vttStatePath('scene'), { mapUrl, gridSize }, 'Не удалось обновить сцену')
    .then(() => toast('Сцена обновлена'));
}

function addMonster() {
  if (!isGm || !fbDb || !room) {
    toast('Монстров добавляет мастер комнаты');
    return;
  }
  const name = el('monsterNameInput').value.trim() || 'Монстр';
  const hpMax = Math.max(1, parseInt(el('monsterHpInput').value, 10) || 1);
  const ac = Math.max(1, parseInt(el('monsterAcInput').value, 10) || 10);
  const count = Object.values(vtt.tokens || {}).filter(t => t.type === 'monster').length;
  const id = monsterId();
  const token = {
    type: 'monster',
    name,
    hpCur: hpMax,
    hpMax,
    ac,
    x: 7 + (count % 4),
    y: 5 + Math.floor(count / 4),
    color: '#993C1D'
  };
  Promise.all([
    writeSet(vttStatePath(`tokens/${id}`), token, 'Не удалось добавить монстра'),
    writeSet(vttStatePath(`monsterStats/${id}`), { name, hpCur: hpMax, hpMax, ac }, 'Не удалось добавить монстра')
  ])
    .then(() => toast('Монстр добавлен'));
}

function removeToken(id) {
  if (!isGm || !fbDb || !room) return;
  if (!confirm('Удалить токен?')) return;
  const updates = {};
  updates[vttStatePath(`tokens/${id}`)] = null;
  updates[vttStatePath(`monsterStats/${id}`)] = null;
  writeRootUpdate(updates, 'Не удалось удалить токен');
}

function updateTokenHp(id, delta) {
  if (!fbDb || !room) return;
  const token = (vtt.tokens || {})[id];
  if (!token) return;
  const data = tokenWithLiveData(id, token);
  const canEditStats = isGm || (token.type === 'player' && token.playerKey === playerKey);
  if (!canEditStats) {
    toast('Нет прав на изменение ХП');
    return;
  }
  const hpMax = Math.max(1, parseInt(data.hpMax, 10) || 1);
  const hpCur = Math.max(0, Math.min(hpMax, (parseInt(data.hpCur, 10) || 0) + delta));
  if (token.type === 'monster') {
    token.hpCur = hpCur;
    if (!vtt.monsterStats) vtt.monsterStats = {};
    vtt.monsterStats[id] = Object.assign({}, vtt.monsterStats[id] || {}, { hpCur });
  } else if (players[token.playerKey]) {
    players[token.playerKey].hpCur = hpCur;
  }
  rememberPendingTokenPatch(id, { hpCur });
  renderBoard();
  renderPlayers();
  renderMonsters();
  renderTokenInspector();
  const path = token.type === 'monster'
    ? vttStatePath(`tokens/${id}`)
    : `rooms/${room}/players/${token.playerKey}`;
  if (token.type === 'monster') {
    const stats = Object.assign({}, tokenWithLiveData(id, token), { hpCur });
    writeSet(vttStatePath(`monsterStats/${id}`), pickMonsterStats(stats), 'Не удалось изменить ХП');
  } else {
    writeFieldPatch(path, { hpCur, _ts: Date.now() }, 'Не удалось изменить ХП');
  }
}

function updateMonsterHp(id, delta) {
  updateTokenHp(id, delta);
}

function renderAll() {
  renderSceneControls();
  renderBoard();
  renderPlayers();
  renderMonsters();
  renderTokenInspector();
}

function renderSceneControls() {
  const scene = vtt.scene || {};
  if (document.activeElement !== el('mapUrlInput')) el('mapUrlInput').value = scene.mapUrl || '';
  if (document.activeElement !== el('gridSizeInput')) el('gridSizeInput').value = scene.gridSize || 48;
}

function renderBoard() {
  const board = el('board');
  const scene = vtt.scene || {};
  const gridSize = Math.max(24, parseInt(scene.gridSize, 10) || 48);
  const currentPlayerKeys = activePlayerKeys();
  if (scene.mapUrl) loadMapMetrics(scene.mapUrl);
  const mapRect = getMapRect(board, scene);
  const scaledGridSize = gridSize * mapRect.scale;
  board.style.setProperty('--grid-size', gridSize + 'px');
  board.style.setProperty('--scaled-grid-size', scaledGridSize + 'px');
  board.style.setProperty('--map-left', mapRect.left + 'px');
  board.style.setProperty('--map-top', mapRect.top + 'px');
  board.style.setProperty('--map-width', mapRect.width + 'px');
  board.style.setProperty('--map-height', mapRect.height + 'px');
  board.style.backgroundImage = scene.mapUrl ? `url("${scene.mapUrl.replace(/"/g, '%22')}")` : '';
  board.classList.toggle('empty', !scene.mapUrl);
  board.textContent = scene.mapUrl ? '' : 'Задайте URL карты';
  updateZoomLabel();

  Object.entries(vtt.tokens || {}).forEach(([id, token]) => {
    if (token.type === 'player' && !currentPlayerKeys.has(token.playerKey)) return;
    const node = document.createElement('div');
    const tokenData = tokenWithLiveData(id, token);
    node.className = 'token ' + (tokenData.type === 'monster' ? 'monster' : 'player');
    if (id === selectedTokenId) node.classList.add('selected');
    node.dataset.tokenId = id;
    node.style.width = scaledGridSize + 'px';
    node.style.height = scaledGridSize + 'px';
    node.style.fontSize = Math.max(10, Math.round(scaledGridSize * 0.34)) + 'px';
    node.style.left = (mapRect.left + (tokenData.x + 0.5) * scaledGridSize) + 'px';
    node.style.top = (mapRect.top + (tokenData.y + 0.5) * scaledGridSize) + 'px';
    node.style.setProperty('--token-color', tokenData.color || '#534AB7');
    node.textContent = initials(tokenData.name);
    node.title = tokenData.name;
    node.addEventListener('click', event => {
      event.stopPropagation();
      selectToken(id);
    });
    if (canMoveToken(token)) node.addEventListener('pointerdown', event => startDrag(event, id));

    const label = document.createElement('div');
    label.className = 'token-label';
    label.innerHTML = `${escapeHtml(tokenData.name)}<span class="token-meta">КД ${escapeHtml(tokenData.ac)} · ${escapeHtml(tokenData.hpCur)} / ${escapeHtml(tokenData.hpMax)}</span>`;
    node.appendChild(label);
    board.appendChild(node);
  });
}

function tokenWithLiveData(id, token) {
  if (token.type !== 'player') {
    return Object.assign({}, token, (vtt.monsterStats || {})[id] || {}, pendingTokenPatches[id]?.patch || {}, inspectorDrafts[id] || {});
  }
  const data = players[token.playerKey] || {};
  const summary = playerSummary(data, token.name || token.playerKey);
  return Object.assign({}, token, summary, pendingTokenPatches[id]?.patch || {}, inspectorDrafts[id] || {});
}

function selectToken(id) {
  if (!(vtt.tokens || {})[id]) return;
  selectedTokenId = id;
  renderBoard();
  renderTokenInspector();
}

function clearTokenSelection() {
  selectedTokenId = '';
  renderBoard();
  renderTokenInspector();
}

function renderTokenInspector() {
  const box = el('tokenInspector');
  if (!box) return;
  const token = (vtt.tokens || {})[selectedTokenId];
  if (!selectedTokenId || !token) {
    selectedTokenId = '';
    box.className = 'token-inspector empty-inspector';
    box.textContent = 'Выберите токен на карте';
    return;
  }
  const active = document.activeElement;
  const isEditingInspector = box.dataset.tokenId === selectedTokenId
    && box.contains(active)
    && ['INPUT', 'TEXTAREA'].includes(active.tagName);
  if (isEditingInspector) return;
  const data = Object.assign({}, tokenWithLiveData(selectedTokenId, token), inspectorDrafts[selectedTokenId] || {});
  const canEdit = isGm || (token.type === 'player' && token.playerKey === playerKey);
  const isMonster = token.type === 'monster';
  const canEditStats = isMonster ? isGm : canEdit;
  box.className = 'token-inspector';
  box.dataset.tokenId = selectedTokenId;
  box.innerHTML = `
    <div class="inspector-head">
      <div>
        <div class="inspector-title">${escapeHtml(data.name)}</div>
        <div class="inspector-meta">${isMonster ? 'Монстр' : 'Персонаж'} · клетка ${escapeHtml(data.x)}, ${escapeHtml(data.y)}</div>
      </div>
      <button class="btn" style="padding:2px 7px;font-size:11px" onclick="clearTokenSelection()">×</button>
    </div>
    <div class="inspector-grid">
      <label>Имя<input id="tokenNameInput" value="${escapeAttr(data.name)}" ${canEdit && isMonster ? '' : 'disabled'}></label>
      <label>КД<input id="tokenAcInput" type="number" value="${escapeAttr(data.ac || 10)}" ${canEditStats ? '' : 'disabled'}></label>
      <label>ХП<input id="tokenHpInput" type="number" value="${escapeAttr(data.hpCur || 0)}" ${canEditStats ? '' : 'disabled'}></label>
      <label>Макс. ХП<input id="tokenHpMaxInput" type="number" value="${escapeAttr(data.hpMax || 1)}" ${canEditStats ? '' : 'disabled'}></label>
    </div>
    <textarea id="tokenNoteInput" class="inspector-note" placeholder="Заметка мастера или игрока..." ${canEdit ? '' : 'disabled'}>${escapeHtml(data.note || '')}</textarea>
    <div class="inspector-actions">
      ${canEditStats ? '<button class="btn primary" id="saveTokenBtn">Сохранить</button>' : ''}
      ${canEdit && !canEditStats ? '<button class="btn primary" id="saveTokenNoteBtn">Сохранить заметку</button>' : ''}
      ${canEditStats ? '<button class="btn" id="hpMinusBtn">-1 ХП</button><button class="btn" id="hpPlusBtn">+1 ХП</button>' : ''}
      ${isGm ? '<button class="btn danger" id="removeTokenBtn">Удалить</button>' : ''}
    </div>`;
  bindInspectorActions();
}

function saveSelectedToken() {
  const saveId = selectedTokenId;
  const token = (vtt.tokens || {})[selectedTokenId];
  if (!token) return Promise.resolve();
  const isMonster = token.type === 'monster';
  const canEditStats = isMonster ? isGm : (isGm || token.playerKey === playerKey);
  if (!canEditStats) {
    toast('Нет прав на изменение этого токена');
    return Promise.resolve();
  }
  const patch = Object.assign({}, inspectorDrafts[saveId] || {}, readInspectorPatch(token));

  const writePromise = isMonster
    ? saveMonsterToken(saveId, token, patch)
    : savePlayerTokenStats(saveId, token, patch);
  renderBoard();
  renderPlayers();
  renderMonsters();
  return writePromise
    .then(() => {
      delete inspectorDrafts[saveId];
      toast('Токен сохранён');
      renderTokenInspector();
    });
}

function readInspectorPatch(token) {
  const hpMax = Math.max(1, parseInt(el('tokenHpMaxInput')?.value, 10) || 1);
  const hpCur = Math.max(0, Math.min(hpMax, parseInt(el('tokenHpInput')?.value, 10) || 0));
  const patch = {
    ac: Math.max(1, parseInt(el('tokenAcInput')?.value, 10) || 10),
    hpCur,
    hpMax
  };
  if (token.type === 'monster') patch.name = el('tokenNameInput')?.value.trim() || token.name || 'Монстр';
  if (token.type === 'monster' || canMoveToken(token)) patch.note = el('tokenNoteInput')?.value.trim() || '';
  return patch;
}

function captureInspectorDraft() {
  const id = selectedTokenId;
  const token = (vtt.tokens || {})[id];
  if (!id || !token) return;
  const patch = readInspectorPatch(token);
  inspectorDrafts[id] = patch;
  rememberPendingTokenPatch(id, patch);
  if (token.type === 'monster') {
    if (!vtt.monsterStats) vtt.monsterStats = {};
    vtt.monsterStats[id] = Object.assign({}, vtt.monsterStats[id] || {}, patch);
    vtt.tokens[id] = Object.assign({}, token, patch);
  } else if (players[token.playerKey]) {
    Object.assign(players[token.playerKey], {
      ac: patch.ac,
      hpCur: patch.hpCur,
      hpMax: patch.hpMax
    });
  }
  renderBoard();
  renderPlayers();
  renderMonsters();
}

function saveMonsterToken(id, token, patch) {
  const fullToken = Object.assign({}, token, patch);
  vtt.tokens[id] = fullToken;
  if (!vtt.monsterStats) vtt.monsterStats = {};
  vtt.monsterStats[id] = Object.assign({}, vtt.monsterStats[id] || {}, patch);
  rememberPendingTokenPatch(id, patch);
  const tokenPatch = {};
  if (Object.prototype.hasOwnProperty.call(patch, 'name')) tokenPatch.name = patch.name;
  if (Object.prototype.hasOwnProperty.call(patch, 'note')) tokenPatch.note = patch.note;
  const stats = pickMonsterStats(Object.assign({}, tokenWithLiveData(id, fullToken), patch));
  const writes = [writeSet(vttStatePath(`monsterStats/${id}`), stats, 'Не удалось сохранить токен')];
  if (Object.keys(tokenPatch).length) writes.push(writeFieldPatch(vttStatePath(`tokens/${id}`), tokenPatch, 'Не удалось сохранить токен'));
  return Promise.all(writes);
}

function pickMonsterStats(data) {
  return {
    name: data.name || 'Монстр',
    ac: Math.max(1, parseInt(data.ac, 10) || 10),
    hpCur: Math.max(0, parseInt(data.hpCur, 10) || 0),
    hpMax: Math.max(1, parseInt(data.hpMax, 10) || 1),
    note: data.note || ''
  };
}

function savePlayerTokenStats(id, token, patch) {
  if (!players[token.playerKey]) players[token.playerKey] = {};
  const playerPatch = {
    ac: patch.ac,
    hpCur: patch.hpCur,
    hpMax: patch.hpMax,
    _ts: Date.now()
  };
  Object.assign(players[token.playerKey], playerPatch);
  rememberPendingTokenPatch(id, patch);
  const writes = [
    writeFieldPatch(`rooms/${room}/players/${token.playerKey}`, playerPatch, 'Не удалось сохранить ХП игрока')
  ];
  if (Object.prototype.hasOwnProperty.call(patch, 'note')) {
    token.note = patch.note;
    writes.push(writeUpdate(vttStatePath(`tokens/${id}`), { note: patch.note }, 'Не удалось сохранить заметку'));
  }
  return Promise.all(writes);
}

function saveSelectedTokenNote() {
  const token = (vtt.tokens || {})[selectedTokenId];
  if (!token || !canMoveToken(token)) {
    toast('Нет прав на изменение этого токена');
    return Promise.resolve();
  }
  const note = el('tokenNoteInput').value.trim();
  token.note = note;
  rememberPendingTokenPatch(selectedTokenId, { note });
  return writeSet(vttStatePath(`tokens/${selectedTokenId}`), token, 'Не удалось сохранить заметку')
    .then(() => {
      toast('Заметка сохранена');
      renderTokenInspector();
    });
}

function bindInspectorActions() {
  ['tokenNameInput', 'tokenAcInput', 'tokenHpInput', 'tokenHpMaxInput', 'tokenNoteInput'].forEach(id => {
    const input = el(id);
    if (input) {
      input.addEventListener('input', captureInspectorDraft);
      input.addEventListener('change', captureInspectorDraft);
    }
  });
  const saveBtn = el('saveTokenBtn');
  if (saveBtn) saveBtn.addEventListener('click', () => saveSelectedToken());
  const noteBtn = el('saveTokenNoteBtn');
  if (noteBtn) noteBtn.addEventListener('click', () => saveSelectedTokenNote());
  const minusBtn = el('hpMinusBtn');
  if (minusBtn) minusBtn.addEventListener('click', () => nudgeSelectedHp(-1));
  const plusBtn = el('hpPlusBtn');
  if (plusBtn) plusBtn.addEventListener('click', () => nudgeSelectedHp(1));
  const removeBtn = el('removeTokenBtn');
  if (removeBtn) removeBtn.addEventListener('click', () => removeSelectedToken());
}

function nudgeSelectedHp(delta) {
  const token = (vtt.tokens || {})[selectedTokenId];
  if (!token) return;
  updateTokenHp(selectedTokenId, delta);
}

function removeSelectedToken() {
  if (!selectedTokenId || !isGm) return;
  const id = selectedTokenId;
  selectedTokenId = '';
  removeToken(id);
  renderTokenInspector();
}

function renderPlayers() {
  const list = el('playerList');
  const entries = actualPlayerEntries();
  if (!entries.length) {
    list.innerHTML = '<div class="card" style="font-size:13px;color:#888">Игроки ещё не подключены к комнате.</div>';
    return;
  }
  list.innerHTML = entries.map(([key, data]) => {
    const summary = playerSummary(data, key);
    const color = hpColor(summary.hpCur, summary.hpMax);
    const pct = Math.max(0, Math.min(100, Math.round(summary.hpCur / summary.hpMax * 100)));
    return `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-name">${escapeHtml(summary.name)}</div>
            <div class="card-meta">${escapeHtml(summary.cls)} ${escapeHtml(summary.level)} ур. · КД ${escapeHtml(summary.ac)}</div>
          </div>
          <strong style="font-size:12px;color:${color}">${summary.hpCur}/${summary.hpMax}</strong>
        </div>
        <div class="hpbar"><div class="hpfill" style="width:${pct}%;background:${color}"></div></div>
      </div>`;
  }).join('');
}

function renderMonsters() {
  const list = el('monsterList');
  const monsters = Object.entries(vtt.tokens || {}).filter(([, token]) => token.type === 'monster');
  if (!monsters.length) {
    list.innerHTML = '<div class="card" style="font-size:13px;color:#888">Монстров пока нет.</div>';
    return;
  }
  list.innerHTML = monsters.map(([id, token]) => {
    const data = tokenWithLiveData(id, token);
    const color = hpColor(data.hpCur, data.hpMax);
    const pct = Math.max(0, Math.min(100, Math.round((data.hpCur || 0) / (data.hpMax || 1) * 100)));
    return `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-name">${escapeHtml(data.name)}</div>
            <div class="card-meta">КД ${escapeHtml(data.ac)} · ${escapeHtml(data.hpCur)} / ${escapeHtml(data.hpMax)} ХП</div>
          </div>
          ${isGm ? `<button class="btn danger" style="padding:2px 7px;font-size:11px" onclick="removeToken('${id}')">×</button>` : ''}
        </div>
        <div class="hpbar"><div class="hpfill" style="width:${pct}%;background:${color}"></div></div>
        ${isGm ? `<div style="display:flex;gap:5px;margin-top:7px">
          <button class="btn" style="padding:2px 8px;font-size:11px" onclick="updateMonsterHp('${id}',-5)">-5</button>
          <button class="btn" style="padding:2px 8px;font-size:11px" onclick="updateMonsterHp('${id}',-1)">-1</button>
          <button class="btn" style="padding:2px 8px;font-size:11px" onclick="updateMonsterHp('${id}',1)">+1</button>
          <button class="btn" style="padding:2px 8px;font-size:11px" onclick="updateMonsterHp('${id}',5)">+5</button>
        </div>` : ''}
      </div>`;
  }).join('');
}

function startDrag(event, id) {
  const token = (vtt.tokens || {})[id];
  if (!canMoveToken(token)) return;
  const board = el('board');
  const rect = board.getBoundingClientRect();
  const scene = vtt.scene || {};
  const mapRect = getMapRect(board, scene);
  dragState = { id, rect, mapRect, node: event.currentTarget };
  event.currentTarget.setPointerCapture(event.pointerId);
  selectedTokenId = id;
  event.currentTarget.classList.add('selected');
  renderTokenInspector();
  event.stopPropagation();
  event.preventDefault();
}

function moveDrag(event) {
  if (!dragState) return;
  const scene = vtt.scene || {};
  const gridSize = Math.max(24, parseInt(scene.gridSize, 10) || 48);
  const mapRect = dragState.mapRect || getMapRect(el('board'), scene);
  const scaledGridSize = gridSize * mapRect.scale;
  const x = Math.max(0, Math.floor((event.clientX - dragState.rect.left - mapRect.left) / scaledGridSize));
  const y = Math.max(0, Math.floor((event.clientY - dragState.rect.top - mapRect.top) / scaledGridSize));
  const token = (vtt.tokens || {})[dragState.id];
  if (token) {
    token.x = x;
    token.y = y;
    if (dragState.node) {
      dragState.node.style.left = (mapRect.left + (x + 0.5) * scaledGridSize) + 'px';
      dragState.node.style.top = (mapRect.top + (y + 0.5) * scaledGridSize) + 'px';
    }
  }
}

function endDrag() {
  if (!dragState || !fbDb || !room) {
    dragState = null;
    return;
  }
  const token = (vtt.tokens || {})[dragState.id];
  if (token && canMoveToken(token)) {
    writeUpdate(vttStatePath(`tokens/${dragState.id}`), { x: token.x, y: token.y }, 'Не удалось переместить токен');
  }
  dragState = null;
}

function startPan(event) {
  if (event.button !== 0 || event.target !== el('board')) return;
  panState = {
    x: event.clientX,
    y: event.clientY,
    panX: camera.panX,
    panY: camera.panY,
    moved: false
  };
  el('board').setPointerCapture(event.pointerId);
  event.preventDefault();
}

function movePan(event) {
  if (!panState || dragState) return;
  const dx = event.clientX - panState.x;
  const dy = event.clientY - panState.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) panState.moved = true;
  camera.panX = panState.panX + dx;
  camera.panY = panState.panY + dy;
  renderBoard();
}

function endPan() {
  if (!panState) return;
  const didMove = panState.moved;
  panState = null;
  if (!didMove) clearTokenSelection();
}

function handleBoardWheel(event) {
  if (!vtt.scene || !vtt.scene.mapUrl) return;
  event.preventDefault();
  const rect = el('board').getBoundingClientRect();
  const factor = event.deltaY > 0 ? 0.9 : 1.1;
  setZoom(camera.zoom * factor, event.clientX - rect.left, event.clientY - rect.top);
}

function centerView() {
  camera.panX = 0;
  camera.panY = 0;
  renderBoard();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

window.removeToken = removeToken;
window.updateMonsterHp = updateMonsterHp;
window.clearTokenSelection = clearTokenSelection;
window.saveSelectedToken = saveSelectedToken;
window.saveSelectedTokenNote = saveSelectedTokenNote;
window.nudgeSelectedHp = nudgeSelectedHp;
window.removeSelectedToken = removeSelectedToken;

window.addEventListener('DOMContentLoaded', () => {
  el('roomInput').value = localStorage.getItem('dnd_fb_room') || '';
  el('nameInput').value = localStorage.getItem('dnd_fb_name') || '';
  el('connectBtn').addEventListener('click', connect);
  el('disconnectBtn').addEventListener('click', disconnect);
  el('saveSceneBtn').addEventListener('click', saveScene);
  el('addMonsterBtn').addEventListener('click', addMonster);
  el('placeTokenBtn').addEventListener('click', placeOwnToken);
  el('centerViewBtn').addEventListener('click', centerView);
  el('zoomOutBtn').addEventListener('click', () => setZoom(camera.zoom / 1.2));
  el('zoomInBtn').addEventListener('click', () => setZoom(camera.zoom * 1.2));
  el('resetViewBtn').addEventListener('click', resetCamera);
  el('board').addEventListener('pointerdown', startPan);
  el('board').addEventListener('wheel', handleBoardWheel, { passive: false });
  window.addEventListener('pointermove', event => {
    moveDrag(event);
    movePan(event);
  });
  window.addEventListener('pointerup', () => {
    endDrag();
    endPan();
  });
  window.addEventListener('resize', () => {
    clearTimeout(resizeRenderTimer);
    resizeRenderTimer = setTimeout(renderBoard, 60);
  });
  setGmControls();
  renderAll();
});
