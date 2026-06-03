import OBR, { buildLabel, buildShape } from "https://esm.sh/@owlbear-rodeo/sdk@3.1.0";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, onValue, off } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const FB_CONFIG = {
  apiKey: "AIzaSyBEjhg3RC4EzeaK792Ob2pn5krfXnn6rxk",
  authDomain: "dndsheet-1c7c2.firebaseapp.com",
  databaseURL: "https://dndsheet-1c7c2-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "dndsheet-1c7c2",
  storageBucket: "dndsheet-1c7c2.firebasestorage.app",
  messagingSenderId: "771509243100",
  appId: "1:771509243100:web:b4655cafbe4935de447819"
};

const LINK_KEY = "ru.dndsheet.link/character";
const ROOM_KEY = "ru.dndsheet.link/room";
const OVERLAY_KEY = "ru.dndsheet.link/overlay";
const CLASS_LABELS = {
  barbarian: "Варвар",
  bard: "Бард",
  cleric: "Жрец",
  druid: "Друид",
  fighter: "Воин",
  monk: "Монах",
  paladin: "Паладин",
  ranger: "Следопыт",
  rogue: "Плут",
  sorcerer: "Чародей",
  warlock: "Колдун",
  wizard: "Волшебник"
};
const STAT_LABELS = {
  str: "Сил",
  dex: "Лов",
  con: "Тел",
  int: "Инт",
  wis: "Мдр",
  cha: "Хар"
};
const SAVE_LABELS = {
  str: "Сила",
  dex: "Ловкость",
  con: "Телосложение",
  int: "Интеллект",
  wis: "Мудрость",
  cha: "Харизма"
};
const SKILLS = [
  ["acrobatics", "Акробатика", "dex"],
  ["animal", "Уход за животными", "wis"],
  ["arcana", "Магия", "int"],
  ["athletics", "Атлетика", "str"],
  ["deception", "Обман", "cha"],
  ["history", "История", "int"],
  ["insight", "Проницательность", "wis"],
  ["intimidation", "Запугивание", "cha"],
  ["investigation", "Анализ", "int"],
  ["medicine", "Медицина", "wis"],
  ["nature", "Природа", "int"],
  ["perception", "Внимательность", "wis"],
  ["performance", "Выступление", "cha"],
  ["persuasion", "Убеждение", "cha"],
  ["religion", "Религия", "int"],
  ["sleight", "Ловкость рук", "dex"],
  ["stealth", "Скрытность", "dex"],
  ["survival", "Выживание", "wis"]
];
const ARMOR_LABELS = {
  none: "Без брони",
  padded: "Стёганый доспех",
  leather: "Кожаный доспех",
  studded: "Проклёпанная кожа",
  hide: "Шкурный доспех",
  chainShirt: "Кольчужная рубаха",
  scale: "Чешуйчатый доспех",
  breastplate: "Кираса",
  halfPlate: "Полулаты",
  ring: "Колечный доспех",
  chain: "Кольчуга",
  splint: "Наборный доспех",
  plate: "Латы",
  mageArmor: "Доспехи мага",
  barbarian: "Защита без доспехов: варвар",
  monk: "Защита без доспехов: монах",
  custom: "Своя броня"
};
const SPELL_STATS = {
  bard: "cha",
  cleric: "wis",
  druid: "wis",
  paladin: "cha",
  ranger: "wis",
  sorcerer: "cha",
  warlock: "cha",
  wizard: "int"
};

let app;
let db;
let room = "";
let players = {};
let selectedCharacterKey = "";
let selectedItemId = "";
let selectedItemLink = null;
let overviewTab = "stats";
let playersRef = null;
let redrawTimer = null;
let unsubItems = null;
let unsubPlayer = null;

const $ = (id) => document.getElementById(id);

function sanitizeFirebaseKey(value) {
  return String(value || "").trim().replace(/[\x00-\x1F\x7F.#$\[\]\/'"`<>\\]/g, "_");
}

function initFirebase() {
  if (app) return;
  app = initializeApp(FB_CONFIG);
  db = getDatabase(app);
}

function setStatus(color, text) {
  $("statusDot").className = "dot" + (color ? " " + color : "");
  $("statusText").textContent = text;
}

function hpColor(cur, max) {
  const pct = max > 0 ? cur / max : 0;
  if (pct > 0.5) return "#639922";
  if (pct > 0.25) return "#BA7517";
  return "#993C1D";
}

function summary(key, data) {
  const hpMax = Math.max(1, parseInt(data.hpMax, 10) || 1);
  const hpCur = Math.max(0, parseInt(data.hpCur, 10) || 0);
  const hpTemp = Math.max(0, parseInt(data.hpTemp, 10) || 0);
  return {
    key,
    name: data.charName || data._name || key,
    playerName: data._name || key,
    cls: CLASS_LABELS[data.classSelect] || data.classSelect || "",
    level: parseInt(data.levelInput, 10) || 1,
    ac: parseInt(data.ac, 10) || 10,
    hpCur,
    hpMax,
    hpTemp
  };
}

function actualPlayers() {
  return Object.entries(players)
    .filter(([key]) => !String(key).startsWith("__"))
    .sort((a, b) => summary(a[0], a[1]).name.localeCompare(summary(b[0], b[1]).name, "ru"));
}

async function connectRoom() {
  initFirebase();
  const nextRoom = sanitizeFirebaseKey($("roomInput").value);
  if (!nextRoom) {
    setStatus("red", "Введите название комнаты.");
    return;
  }
  if (playersRef) off(playersRef);
  room = nextRoom;
  localStorage.setItem("dnd_obr_room", room);
  $("roomInput").value = room;
  if (await awaitSceneReady()) await OBR.scene.setMetadata({ [ROOM_KEY]: room });
  setStatus("orange", "Подключение...");
  playersRef = ref(db, `rooms/${room}/players`);
  onValue(playersRef, (snap) => {
    players = snap.val() || {};
    renderCharacters();
    renderOverview();
    scheduleOverlayRedraw();
    setStatus("green", `Подключено: ${room}`);
  }, (error) => {
    console.error(error);
    setStatus("red", "Ошибка чтения Firebase.");
  });
}

async function refreshSelection() {
  if (!OBR.isAvailable || !(await OBR.scene.isReady())) {
    $("selectionBox").textContent = "Откройте сцену Owlbear Rodeo.";
    $("linkBtn").disabled = true;
    $("unlinkBtn").disabled = true;
    return;
  }
  const selection = await OBR.player.getSelection();
  if (!selection || selection.length !== 1) {
    selectedItemId = "";
    selectedItemLink = null;
    $("selectionBox").textContent = "Выберите ровно один токен.";
    $("linkBtn").disabled = !selectedCharacterKey || !room;
    $("unlinkBtn").disabled = true;
    return;
  }
  selectedItemId = selection[0];
  const [item] = await OBR.scene.items.getItems([selectedItemId]);
  selectedItemLink = item?.metadata?.[LINK_KEY] || null;
  if (selectedItemLink?.room === room && players[selectedItemLink.playerKey]) {
    selectedCharacterKey = selectedItemLink.playerKey;
    renderCharacters();
  }
  const text = selectedItemLink
    ? `Токен привязан к ${selectedItemLink.playerKey} в комнате ${selectedItemLink.room}.`
    : "Токен выбран, привязки пока нет.";
  $("selectionBox").textContent = text;
  $("linkBtn").disabled = !selectedCharacterKey || !room;
  $("unlinkBtn").disabled = !selectedItemLink;
  renderOverview();
}

async function awaitSceneReady() {
  try {
    return OBR.isAvailable && await OBR.scene.isReady();
  } catch {
    return false;
  }
}

function renderCharacters() {
  const list = $("characterList");
  const entries = actualPlayers();
  if (!entries.length) {
    list.innerHTML = '<div class="muted-box">В комнате пока нет персонажей.</div>';
    selectedCharacterKey = "";
    $("linkBtn").disabled = true;
    return;
  }
  list.innerHTML = "";
  for (const [key, data] of entries) {
    const s = summary(key, data);
    const pct = Math.max(0, Math.min(100, Math.round(s.hpCur / s.hpMax * 100)));
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card" + (key === selectedCharacterKey ? " selected" : "");
    card.innerHTML = `
      <div class="card-head">
        <div>
          <div class="name">${escapeHtml(s.name)}</div>
          <div class="meta">${escapeHtml(s.cls)} ${s.level} ур. · КД ${s.ac}</div>
        </div>
        <div class="hp">${s.hpCur}/${s.hpMax}${s.hpTemp ? " +" + s.hpTemp : ""}</div>
      </div>
      <div class="hpbar"><div class="hpfill" style="width:${pct}%;background:${hpColor(s.hpCur, s.hpMax)}"></div></div>`;
    card.addEventListener("click", () => {
      selectedCharacterKey = key;
      renderCharacters();
      refreshSelection();
      renderOverview();
    });
    list.appendChild(card);
  }
}

async function linkSelectedToken() {
  await refreshSelection();
  if (!selectedItemId || !selectedCharacterKey || !room) return;
  const link = { room, playerKey: selectedCharacterKey };
  await OBR.scene.items.updateItems([selectedItemId], (items) => {
    for (const item of items) {
      item.metadata = item.metadata || {};
      item.metadata[LINK_KEY] = link;
    }
  });
  selectedItemLink = link;
  await refreshSelection();
  scheduleOverlayRedraw();
}

async function unlinkSelectedToken() {
  await refreshSelection();
  if (!selectedItemId) return;
  await OBR.scene.items.updateItems([selectedItemId], (items) => {
    for (const item of items) {
      item.metadata = item.metadata || {};
      delete item.metadata[LINK_KEY];
    }
  });
  selectedItemLink = null;
  await refreshSelection();
  scheduleOverlayRedraw();
}

function openSheet() {
  const url = new URL("../index.html", window.location.href);
  window.open(url.toString(), "_blank", "noopener,noreferrer");
}

function activeCharacterEntry() {
  if (selectedItemLink?.room === room && players[selectedItemLink.playerKey]) {
    return [selectedItemLink.playerKey, players[selectedItemLink.playerKey]];
  }
  if (selectedCharacterKey && players[selectedCharacterKey]) {
    return [selectedCharacterKey, players[selectedCharacterKey]];
  }
  const entries = actualPlayers();
  return entries[0] || null;
}

function renderOverview() {
  const box = $("overviewBox");
  if (!box) return;
  const entry = activeCharacterEntry();
  if (!entry) {
    box.innerHTML = '<div class="muted-box">Выберите персонажа или привязанный токен.</div>';
    return;
  }
  const [key, data] = entry;
  const s = summary(key, data);
  box.innerHTML = overviewHeader(s, data) + overviewContent(data, s);
}

function overviewHeader(s, data) {
  const temp = s.hpTemp ? ` +${s.hpTemp} врем.` : "";
  return `
    <div class="overview-head">
      <div>
        <div class="overview-name">${escapeHtml(s.name)}</div>
        <div class="overview-sub">${escapeHtml(s.cls || "Класс")} ${s.level} ур. · ${escapeHtml(data.race || "Раса не указана")}</div>
        <div class="overview-sub">${escapeHtml(data.background || "Предыстория не указана")} · ${escapeHtml(data.alignment || "Мировоззрение не указано")}</div>
      </div>
      <div class="overview-hp">${s.hpCur}/${s.hpMax}${escapeHtml(temp)}<br>КД ${s.ac}</div>
    </div>`;
}

function overviewContent(data, s) {
  if (overviewTab === "skills") return overviewSkills(data);
  if (overviewTab === "combat") return overviewCombat(data, s);
  if (overviewTab === "spells") return overviewSpells(data);
  if (overviewTab === "inventory") return overviewInventory(data);
  if (overviewTab === "abilities") return overviewAbilities(data);
  return overviewStats(data, s);
}

function overviewStats(data, s) {
  const statTiles = Object.keys(STAT_LABELS).map((stat) => {
    const total = statTotal(data, stat);
    return tile(STAT_LABELS[stat], `${total} (${fmtMod(statMod(data, stat))})`);
  }).join("");
  const prof = profBonus(s.level);
  const passive = 10 + skillBonus(data, "perception");
  return `
    <div class="overview-grid">
      ${tile("КД", s.ac)}
      ${tile("Инициатива", data.initField || fmtMod(statMod(data, "dex")))}
      ${tile("Скорость", data.speed || "30 фт.")}
      ${tile("БМ", fmtMod(prof))}
      ${tile("Пассивка", passive)}
      ${tile("Вдохновение", parseInt(data.inspirationCount, 10) || 0)}
    </div>
    <div class="overview-grid">${statTiles}</div>`;
}

function overviewSkills(data) {
  const saves = Object.keys(SAVE_LABELS).map((stat) => {
    const proficient = !!data.saveProf?.[stat];
    return row(SAVE_LABELS[stat], fmtMod(statMod(data, stat) + (proficient ? profBonus(data.levelInput) : 0)), proficient ? "Владение" : "");
  }).join("");
  const skills = SKILLS.map(([id, name, stat]) => {
    const proficient = !!data.skillProf?.[id];
    return row(`${escapeHtml(name)} <span class="muted">${escapeHtml(STAT_LABELS[stat])}</span>`, fmtMod(skillBonus(data, id)), proficient ? "Владение" : "", proficient, true);
  }).join("");
  return `
    <div class="overview-section">
      <h2>Спасброски</h2>
      ${saves}
      <h2>Навыки</h2>
      ${skills}
      ${data.profs ? `<h2>Владения и языки</h2><div class="overview-text">${escapeHtml(data.profs)}</div>` : ""}
    </div>`;
}

function overviewCombat(data, s) {
  const armor = ARMOR_LABELS[data.armorSelect] || data.armorSelect || "Не указана";
  const shield = String(data.shieldEquipped || "0") === "1" ? "Да" : "Нет";
  const attacks = cleanList(data.attacks).map((attack) => row(attack.name || "Атака", attack.bonus || "", attack.dmg || "")).join("");
  return `
    <div class="overview-grid">
      ${tile("КД", s.ac)}
      ${tile("Броня", armor)}
      ${tile("Щит", shield)}
      ${tile("Бонус КД", data.acBonus || "0")}
      ${tile("Кость хитов", data.hitDie || "—")}
      ${tile("КХ осталось", data.hdCur || "—")}
    </div>
    <div class="overview-section">
      <h2>Атаки</h2>
      ${attacks || '<div class="muted-box">Атаки не добавлены.</div>'}
      ${data.features ? `<h2>Черты и способности</h2><div class="overview-text">${escapeHtml(data.features)}</div>` : ""}
    </div>`;
}

function overviewSpells(data) {
  const known = cleanList(data.knownSpells);
  const extra = cleanList(data.extraKnownSpells);
  const prepared = new Set(cleanList(data.preparedSpells));
  const classKey = data.classSelect;
  const spellStat = SPELL_STATS[classKey];
  const spellMod = spellStat ? statMod(data, spellStat) : 0;
  const prof = profBonus(data.levelInput);
  const spellNames = [...new Set([...known, ...extra])];
  if (!spellNames.length && !data.spells && !spellStat) {
    return '<div class="muted-box">У персонажа нет данных о заклинаниях.</div>';
  }
  const badges = spellNames.map((name) => `<span class="overview-badge${prepared.has(name) ? " prepared" : ""}">${escapeHtml(name)}</span>`).join("");
  const slotText = spellSlotText(data.spellSlotDots);
  return `
    <div class="overview-grid">
      ${tile("Характеристика", spellStat ? STAT_LABELS[spellStat] : "—")}
      ${tile("Атака", spellStat ? fmtMod(prof + spellMod) : "—")}
      ${tile("СЛ", spellStat ? 8 + prof + spellMod : "—")}
    </div>
    <div class="overview-section">
      ${slotText ? `<h2>Ячейки</h2><div class="overview-text">${escapeHtml(slotText)}</div>` : ""}
      ${badges ? `<h2>Известные и подготовленные</h2><div class="overview-badges">${badges}</div>` : ""}
      ${extra.length ? `<h2>Дополнительно изученные</h2><div class="overview-text">${escapeHtml(extra.join(", "))}</div>` : ""}
      ${data.spells ? `<h2>Заметки по магии</h2><div class="overview-text">${escapeHtml(data.spells)}</div>` : ""}
    </div>`;
}

function overviewInventory(data) {
  const money = [["ПМ", data.pp], ["ЗМ", data.gp], ["ЭМ", data.ep], ["СМ", data.sp], ["ММ", data.cp]]
    .filter(([, value]) => parseInt(value, 10))
    .map(([label, value]) => `${label}: ${value}`)
    .join(" · ");
  const items = cleanList(data.inventory).map((item) => row(item.name || "Предмет", item.qty || "1", item.wt ? `${item.wt} фн` : "")).join("");
  return `
    <div class="overview-section">
      <h2>Монеты</h2>
      <div class="overview-text">${escapeHtml(money || "Монеты не указаны.")}</div>
      <h2>Снаряжение</h2>
      ${items || '<div class="muted-box">Инвентарь пуст.</div>'}
    </div>`;
}

function overviewAbilities(data) {
  const abilities = cleanList(data.abilities).map((ability) => `
    <div class="overview-text"><strong>${escapeHtml(ability.name || "Умение")}</strong>${ability.desc ? `<br>${escapeHtml(ability.desc)}` : ""}</div>
  `).join("");
  return `
    <div class="overview-section">
      ${abilities || '<div class="muted-box">Умения не добавлены.</div>'}
      ${data.backstory ? `<h2>Краткая история</h2><div class="overview-text">${escapeHtml(data.backstory)}</div>` : ""}
    </div>`;
}

function tile(label, value) {
  return `<div class="overview-tile"><div class="overview-label">${escapeHtml(label)}</div><div class="overview-value">${escapeHtml(value)}</div></div>`;
}

function row(name, value, note = "", proficient = false, nameIsHtml = false) {
  const safeName = nameIsHtml ? name : escapeHtml(name);
  return `<div class="overview-row${proficient ? " overview-proficient" : ""}"><strong>${safeName}</strong><span>${escapeHtml(value)}${note ? ` <span class="muted">${escapeHtml(note)}</span>` : ""}</span></div>`;
}

function cleanList(value) {
  return Array.isArray(value) ? value.filter((item) => {
    if (typeof item === "string") return item.trim();
    return item && Object.values(item).some((part) => String(part || "").trim());
  }) : [];
}

function statTotal(data, stat) {
  return (parseInt(data.statValues?.[stat], 10) || 10)
    + (parseInt(data.statBonus?.[stat], 10) || 0)
    + (parseInt(data.asiBonus?.[stat], 10) || 0);
}

function statMod(data, stat) {
  return Math.floor((statTotal(data, stat) - 10) / 2);
}

function profBonus(level) {
  return 2 + Math.floor(((parseInt(level, 10) || 1) - 1) / 4);
}

function skillBonus(data, skillId) {
  const skill = SKILLS.find(([id]) => id === skillId);
  if (!skill) return 0;
  const proficient = !!data.skillProf?.[skillId];
  return statMod(data, skill[2]) + (proficient ? profBonus(data.levelInput) : 0);
}

function fmtMod(value) {
  const num = parseInt(value, 10) || 0;
  return num >= 0 ? "+" + num : String(num);
}

function spellSlotText(spellSlotDots) {
  if (!spellSlotDots || typeof spellSlotDots !== "object") return "";
  return Object.entries(spellSlotDots).map(([key, dots]) => {
    if (!Array.isArray(dots) || !dots.length) return "";
    const spent = dots.filter(Boolean).length;
    return `${spellSlotLabel(key)}: ${dots.length - spent}/${dots.length}`;
  }).filter(Boolean).join(" · ");
}

function spellSlotLabel(key) {
  const match = String(key).match(/\d+/);
  return match ? `${match[0]} круг` : String(key);
}

function scheduleOverlayRedraw() {
  // The background page owns overlay rendering. The action panel only manages links.
  clearTimeout(redrawTimer);
}

async function redrawOverlays() {
  return Promise.resolve();
}

async function getBounds(item) {
  try {
    const bounds = await OBR.scene.items.getItemBounds([item.id]);
    const min = bounds.min || bounds.start || bounds.topLeft;
    const max = bounds.max || bounds.end || bounds.bottomRight;
    const width = bounds.width || (min && max ? Math.abs(max.x - min.x) : 0);
    const height = bounds.height || (min && max ? Math.abs(max.y - min.y) : 0);
    const center = bounds.center || {
      x: min && max ? (min.x + max.x) / 2 : item.position.x,
      y: min && max ? (min.y + max.y) / 2 : item.position.y
    };
    const top = min?.y ?? (center.y - height / 2);
    return { center, top, width, height };
  } catch (error) {
    console.warn("Unable to read item bounds", error);
    return { center: item.position || { x: 0, y: 0 }, top: (item.position?.y || 0) - 70, width: 110, height: 70 };
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

function bindUi() {
  $("roomInput").value = localStorage.getItem("dnd_obr_room") || localStorage.getItem("dnd_fb_room") || "";
  $("connectBtn").addEventListener("click", connectRoom);
  $("refreshBtn").addEventListener("click", () => {
    if (room) connectRoom();
    refreshSelection();
    scheduleOverlayRedraw();
  });
  $("selectionBtn").addEventListener("click", refreshSelection);
  $("linkBtn").addEventListener("click", linkSelectedToken);
  $("unlinkBtn").addEventListener("click", unlinkSelectedToken);
  $("openSheetBtn").addEventListener("click", openSheet);
  document.querySelectorAll("[data-overview-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      overviewTab = btn.dataset.overviewTab || "stats";
      document.querySelectorAll("[data-overview-tab]").forEach((tab) => tab.classList.toggle("active", tab === btn));
      renderOverview();
    });
  });
}

async function initObr() {
  if (!OBR.isAvailable) {
    setStatus("orange", "Откройте это окно как расширение Owlbear Rodeo.");
    return;
  }
  OBR.onReady(async () => {
    setStatus("", "Owlbear готов. Подключите комнату.");
    if (await OBR.scene.isReady()) {
      unsubItems = OBR.scene.items.onChange(scheduleOverlayRedraw);
      unsubPlayer = OBR.player.onChange(() => refreshSelection());
      refreshSelection();
    }
    OBR.scene.onReadyChange((ready) => {
      if (ready) {
        if (!unsubItems) unsubItems = OBR.scene.items.onChange(scheduleOverlayRedraw);
        if (!unsubPlayer) unsubPlayer = OBR.player.onChange(() => refreshSelection());
        refreshSelection();
        scheduleOverlayRedraw();
      }
    });
  });
}

bindUi();
initObr();
