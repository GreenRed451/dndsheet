import OBR from "https://esm.sh/@owlbear-rodeo/sdk@3.1.0";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

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
const STAT_LABELS = {
  int: "Инт",
  wis: "Мдр",
  cha: "Хар"
};

let app;
let db;
let spellDbPromise = null;
let currentSpells = [];

const $ = (id) => document.getElementById(id);

function initFirebase() {
  if (app) return;
  app = initializeApp(FB_CONFIG);
  db = getDatabase(app);
}

async function init() {
  if (!OBR.isAvailable) {
    renderMessage("Откройте это окно внутри Owlbear Rodeo.");
    return;
  }
  await OBR.onReady(async () => {
    try {
      initFirebase();
      const item = await getContextItem();
      const link = item?.metadata?.[LINK_KEY];
      if (!link?.room || !link?.playerKey) {
        renderMessage("Листок не привязан к этому токену.");
        return;
      }
      const snap = await get(ref(db, `rooms/${link.room}/players/${link.playerKey}`));
      const data = snap.val();
      if (!data) {
        renderMessage("Не удалось найти данные листка.");
        return;
      }
      await renderSpellMenu(data);
    } catch (error) {
      console.error(error);
      renderMessage("Не удалось загрузить заклинания листка.");
    }
  });
}

async function getContextItem() {
  const selection = await OBR.player.getSelection();
  const fallbackItemId = localStorage.getItem("dnd_obr_context_item") || "";
  const itemId = selection && selection.length === 1 ? selection[0] : fallbackItemId;
  if (!itemId) return null;
  const [item] = await OBR.scene.items.getItems([itemId]);
  return item || null;
}

async function renderSpellMenu(data) {
  const spellDb = await loadSpellDb();
  const known = cleanList(data.knownSpells);
  const extra = cleanList(data.extraKnownSpells);
  const prepared = new Set(cleanList(data.preparedSpells));
  const names = [...new Set([...known, ...extra, ...prepared])];
  const classKey = data.classSelect;
  const spellStat = SPELL_STATS[classKey];
  const spellMod = spellStat ? statMod(data, spellStat) : 0;
  const prof = profBonus(data.levelInput);
  currentSpells = names.map((name) => {
    const spell = spellDb.get(name);
    return {
      name,
      spell,
      prepared: prepared.has(name),
      extra: extra.includes(name)
    };
  }).sort((a, b) => {
    const levelA = parseInt(a.spell?.level, 10) || 0;
    const levelB = parseInt(b.spell?.level, 10) || 0;
    return levelA - levelB || a.name.localeCompare(b.name, "ru");
  });

  const title = data.charName || data._name || "Заклинания";
  const statLine = spellStat
    ? `${STAT_LABELS[spellStat] || spellStat}: атака ${fmtMod(prof + spellMod)}, СЛ ${8 + prof + spellMod}`
    : "Магические параметры не указаны.";
  $("spellMenu").innerHTML = `
    <div class="spell-menu-head">
      <div>
        <div class="spell-menu-title">${escapeHtml(title)}</div>
        <div class="spell-menu-sub">${escapeHtml(statLine)}</div>
      </div>
    </div>
    ${currentSpells.length
      ? `<div class="spell-menu-layout">
          <div class="spell-menu-list">
            ${currentSpells.map((entry, index) => spellButton(entry, index)).join("")}
          </div>
          <article id="spellDetail" class="spell-detail"></article>
        </div>`
      : `<div class="attack-menu-empty">${escapeHtml(data.spells || "У этого персонажа не указаны заклинания.")}</div>`}
  `;
  $("spellMenu").querySelectorAll("[data-spell-index]").forEach((button) => {
    button.addEventListener("click", () => showSpell(parseInt(button.dataset.spellIndex, 10) || 0));
  });
  if (currentSpells.length) showSpell(0);
}

function spellButton(entry, index) {
  const spell = entry.spell;
  const level = spell?.level === "0" ? "Заговор" : spell?.level ? `${spell.level} круг` : "Нет описания";
  const flags = [
    entry.prepared ? "подг." : "",
    entry.extra ? "доп." : ""
  ].filter(Boolean).join(" · ");
  return `
    <button type="button" class="spell-menu-item" data-spell-index="${index}">
      <span>${escapeHtml(entry.name)}</span>
      <small>${escapeHtml([level, flags].filter(Boolean).join(" · "))}</small>
    </button>`;
}

function showSpell(index) {
  const entry = currentSpells[index];
  const detail = $("spellDetail");
  if (!entry || !detail) return;
  $("spellMenu").querySelectorAll("[data-spell-index]").forEach((button) => {
    button.classList.toggle("active", parseInt(button.dataset.spellIndex, 10) === index);
  });
  const spell = entry.spell;
  if (!spell) {
    detail.innerHTML = `
      <h1>${escapeHtml(entry.name)}</h1>
      <p class="spell-muted">Описание не найдено в базе листка.</p>`;
    return;
  }
  const level = spell.level === "0" ? "Заговор" : `${spell.level} круг`;
  detail.innerHTML = `
    <h1>${escapeHtml(spell.name)}</h1>
    <div class="spell-detail-sub">${escapeHtml(level)} · ${escapeHtml(spell.school || "Школа не указана")}</div>
    <div class="spell-detail-grid">
      ${spellInfo("Время", spell.cast)}
      ${spellInfo("Дальность", spell.range)}
      ${spellInfo("Длит.", spell.dur)}
      ${spellInfo("Компон.", spell.comp)}
    </div>
    <p>${escapeHtml(spell.desc || "Описание не указано.")}</p>`;
}

function spellInfo(label, value) {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "—")}</strong></div>`;
}

function renderMessage(text) {
  $("spellMenu").innerHTML = `<div class="attack-menu-empty">${escapeHtml(text)}</div>`;
}

function loadSpellDb() {
  if (!spellDbPromise) {
    spellDbPromise = fetch("../index.html?v=0133")
      .then((response) => response.text())
      .then(parseSpellDb);
  }
  return spellDbPromise;
}

function parseSpellDb(source) {
  const spellDb = new Map();
  const text = String(source || "");
  const start = text.indexOf("const SPELL_DB = [");
  const end = text.indexOf("];", start);
  const spellSource = start >= 0 && end > start ? text.slice(start, end) : text;
  const lines = spellSource.split(/\n/).filter((line) => line.includes("{ name:") && line.includes("desc:"));
  for (const line of lines) {
    const spell = {
      name: quotedField(line, "name"),
      level: String(numberField(line, "level") ?? ""),
      school: quotedField(line, "school"),
      cast: quotedField(line, "cast"),
      range: quotedField(line, "range"),
      dur: quotedField(line, "dur"),
      comp: quotedField(line, "comp"),
      desc: quotedField(line, "desc")
    };
    if (spell.name) spellDb.set(spell.name, spell);
  }
  return spellDb;
}

function quotedField(line, field) {
  const match = String(line).match(new RegExp(field + ':\\s*"((?:\\\\.|[^"\\\\])*)"'));
  if (!match) return "";
  try {
    return JSON.parse('"' + match[1] + '"');
  } catch {
    return match[1];
  }
}

function numberField(line, field) {
  const match = String(line).match(new RegExp(field + ":\\s*(-?\\d+)"));
  return match ? parseInt(match[1], 10) : null;
}

function cleanList(value) {
  return Array.isArray(value) ? value.filter((item) => String(item || "").trim()) : [];
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

function fmtMod(value) {
  const num = parseInt(value, 10) || 0;
  return num >= 0 ? "+" + num : String(num);
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

init();
