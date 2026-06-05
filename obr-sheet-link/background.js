import OBR, { buildShape } from "https://esm.sh/@owlbear-rodeo/sdk@3.1.0";
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

const ROOM_KEY = "ru.dndsheet.link/room";
const LINK_KEY = "ru.dndsheet.link/character";
const OVERLAY_KEY = "ru.dndsheet.link/overlay";
const ATTACK_CONTEXT_MENU_ID = "ru.dndsheet.link/attack-context-menu";
const SPELL_CONTEXT_MENU_ID = "ru.dndsheet.link/spell-context-menu";
const ABILITY_CONTEXT_MENU_ID = "ru.dndsheet.link/ability-context-menu";
const DIGITS = {
  "0": "abcfed",
  "1": "bc",
  "2": "abged",
  "3": "abgcd",
  "4": "fgbc",
  "5": "afgcd",
  "6": "afgecd",
  "7": "abc",
  "8": "abcdefg",
  "9": "abfgcd"
};

let app;
let db;
let room = "";
let players = {};
let playersRef = null;
let redrawTimer = null;
let lastOverlaySignature = "";
let lastLinkSignature = "";

function initFirebase() {
  if (app) return;
  app = initializeApp(FB_CONFIG);
  db = getDatabase(app);
}

function connectRoom(nextRoom) {
  initFirebase();
  if (playersRef) off(playersRef);
  room = String(nextRoom || "").trim();
  players = {};
  if (!room) {
    scheduleOverlayRedraw();
    return;
  }
  playersRef = ref(db, `rooms/${room}/players`);
  onValue(playersRef, (snap) => {
    players = snap.val() || {};
    scheduleOverlayRedraw();
  });
}

function summary(key, data) {
  const hpMax = Math.max(1, parseInt(data.hpMax, 10) || 1);
  const hpCur = Math.max(0, parseInt(data.hpCur, 10) || 0);
  const hpTemp = Math.max(0, parseInt(data.hpTemp, 10) || 0);
  return {
    key,
    name: data.charName || data._name || key,
    ac: parseInt(data.ac, 10) || 10,
    hpCur,
    hpMax,
    hpTemp
  };
}

function hpColor(cur, max) {
  const pct = max > 0 ? cur / max : 0;
  if (pct > 0.5) return "#639922";
  if (pct > 0.25) return "#BA7517";
  return "#993C1D";
}

function scheduleOverlayRedraw() {
  clearTimeout(redrawTimer);
  redrawTimer = setTimeout(redrawOverlays, 280);
}

async function scheduleIfLinksChanged() {
  if (!OBR.isAvailable || !(await OBR.scene.isReady())) return;
  const linkedItems = await OBR.scene.items.getItems((item) => {
    const link = item.metadata?.[LINK_KEY];
    return Boolean(link?.room && link?.playerKey);
  });
  const signature = linkedItems.map((item) => {
    const link = item.metadata[LINK_KEY];
    return [item.id, link.room, link.playerKey].join(":");
  }).sort().join("|");
  if (signature === lastLinkSignature) return;
  lastLinkSignature = signature;
  lastOverlaySignature = "";
  scheduleOverlayRedraw();
}

async function redrawOverlays() {
  if (!OBR.isAvailable || !(await OBR.scene.isReady())) return;
  if (!room) {
    await clearOverlays();
    lastOverlaySignature = "";
    return;
  }

  const linkedItems = await OBR.scene.items.getItems((item) => {
    const link = item.metadata?.[LINK_KEY];
    return link?.room === room && Boolean(players[link.playerKey]);
  });

  const signature = linkedItems.map((item) => {
    const link = item.metadata[LINK_KEY];
    const s = summary(link.playerKey, players[link.playerKey]);
    return [item.id, link.playerKey, s.ac, s.hpCur, s.hpMax, s.hpTemp].join(":");
  }).sort().join("|");
  if (signature === lastOverlaySignature) return;
  lastOverlaySignature = signature;

  await clearOverlays();

  const overlays = [];
  for (const item of linkedItems) {
    const link = item.metadata[LINK_KEY];
    const s = summary(link.playerKey, players[link.playerKey]);
    const bounds = await getBounds(item);
    const width = 96;
    const barHeight = 18;
    const x = bounds.center.x - width / 2;
    const y = bounds.center.y + (bounds.height || 90) * 0.34;
    const pct = Math.max(0, Math.min(1, s.hpCur / s.hpMax));
    const color = hpColor(s.hpCur, s.hpMax);
    const hasTemp = s.hpTemp > 0;
    const tempHeight = 7;
    const badge = 34;
    const badgeCenterX = x + width + 2;
    const badgeCenterY = y + barHeight / 2 - 2;
    const metaBase = { [OVERLAY_KEY]: { tokenId: item.id } };

    overlays.push(
      attachOverlay(buildShape()
        .shapeType("RECTANGLE")
        .width(width)
        .height(barHeight)
        .position({ x, y })
        .fillColor("#1a1a18")
        .fillOpacity(0.92)
        .strokeColor("#ffffff")
        .strokeWidth(1)
        .layer("ATTACHMENT")
        .disableHit(true)
        .disableAutoZIndex(true)
        .zIndex(9000)
        .metadata(metaBase)
        .build(), item.id),
      attachOverlay(buildShape()
        .shapeType("RECTANGLE")
        .width(Math.max(2, width * pct))
        .height(barHeight)
        .position({ x, y })
        .fillColor(color)
        .fillOpacity(1)
        .strokeWidth(0)
        .layer("ATTACHMENT")
        .disableHit(true)
        .disableAutoZIndex(true)
        .zIndex(9001)
        .metadata(metaBase)
        .build(), item.id),
      attachOverlay(buildShape()
        .shapeType("CIRCLE")
        .width(badge)
        .height(badge)
        .position({ x: badgeCenterX, y: badgeCenterY })
        .fillColor("#7b9bd8")
        .fillOpacity(0.96)
        .strokeColor("#ffffff")
        .strokeWidth(2)
        .layer("ATTACHMENT")
        .disableHit(true)
        .disableAutoZIndex(true)
        .zIndex(9003)
        .metadata(metaBase)
        .build(), item.id),
      ...buildTempHpOverlay(s.hpTemp, {
        x,
        y,
        width,
        tempHeight,
        hasTemp,
        metadata: metaBase
      }).map((part) => attachOverlay(part, item.id)),
      ...buildSegmentText(`${s.hpCur}/${s.hpMax}`, {
        centerX: x + width / 2,
        centerY: y + barHeight / 2,
        scale: 1.15,
        color: "#ffffff",
        zIndex: 9004,
        metadata: metaBase
      }).map((part) => attachOverlay(part, item.id)),
      ...buildSegmentText(String(s.ac), {
        centerX: badgeCenterX,
        centerY: badgeCenterY,
        scale: 1.12,
        color: "#ffffff",
        zIndex: 9005,
        metadata: metaBase
      }).map((part) => attachOverlay(part, item.id))
    );
  }
  if (overlays.length) await OBR.scene.local.addItems(overlays);
}

async function clearOverlays() {
  const old = await OBR.scene.local.getItems((item) => Boolean(item.metadata?.[OVERLAY_KEY]));
  if (old.length) await OBR.scene.local.deleteItems(old.map((item) => item.id));
}

function buildTempHpOverlay(hpTemp, options) {
  if (!options.hasTemp) return [];
  const blue = "#69A7E8";
  const y = options.y - options.tempHeight - 2;
  return [
    buildShape()
      .shapeType("RECTANGLE")
      .width(options.width)
      .height(options.tempHeight)
      .position({ x: options.x, y })
      .fillColor("#1A3D5F")
      .fillOpacity(0.92)
      .strokeColor("#ffffff")
      .strokeWidth(0.6)
      .layer("ATTACHMENT")
      .disableHit(true)
      .disableAutoZIndex(true)
      .zIndex(9002)
      .metadata(options.metadata)
      .build(),
    buildShape()
      .shapeType("RECTANGLE")
      .width(options.width)
      .height(options.tempHeight)
      .position({ x: options.x, y })
      .fillColor(blue)
      .fillOpacity(0.95)
      .strokeWidth(0)
      .layer("ATTACHMENT")
      .disableHit(true)
      .disableAutoZIndex(true)
      .zIndex(9003)
      .metadata(options.metadata)
      .build(),
    ...buildSegmentText(String(hpTemp), {
      centerX: options.x + options.width / 2,
      centerY: y + options.tempHeight / 2,
      scale: 0.62,
      color: "#ffffff",
      zIndex: 9006,
      metadata: options.metadata
    })
  ];
}

function buildSegmentText(text, options) {
  const chars = String(text);
  const scale = options.scale || 1;
  const digitW = 7 * scale;
  const digitH = 12 * scale;
  const gap = 2 * scale;
  const slashW = 4 * scale;
  const totalW = Array.from(chars).reduce((sum, ch, idx) => {
    const charW = ch === "/" ? slashW : digitW;
    return sum + charW + (idx ? gap : 0);
  }, 0);
  let cursor = options.centerX - totalW / 2;
  const top = options.centerY - digitH / 2;
  const items = [];
  for (const ch of chars) {
    if (ch === "/") {
      items.push(...buildSlash(cursor, top, scale, options));
      cursor += slashW + gap;
      continue;
    }
    items.push(...buildDigit(ch, cursor, top, scale, options));
    cursor += digitW + gap;
  }
  return items;
}

function buildDigit(ch, x, y, scale, options) {
  const segments = DIGITS[ch];
  if (!segments) return [];
  const t = 2 * scale;
  const w = 7 * scale;
  const h = 12 * scale;
  const mid = h / 2 - t / 2;
  const defs = {
    a: [x + t, y, w - 2 * t, t],
    b: [x + w - t, y + t, t, h / 2 - t],
    c: [x + w - t, y + h / 2, t, h / 2 - t],
    d: [x + t, y + h - t, w - 2 * t, t],
    e: [x, y + h / 2, t, h / 2 - t],
    f: [x, y + t, t, h / 2 - t],
    g: [x + t, y + mid, w - 2 * t, t]
  };
  return Array.from(segments).map((seg) => buildSegment(defs[seg], options));
}

function buildSlash(x, y, scale, options) {
  const size = 2 * scale;
  return [
    [x + 2 * scale, y + 2 * scale, size, size],
    [x + 1 * scale, y + 5 * scale, size, size],
    [x, y + 8 * scale, size, size]
  ].map((rect) => buildSegment(rect, options));
}

function buildSegment(rect, options) {
  const [x, y, width, height] = rect;
  return buildShape()
    .shapeType("RECTANGLE")
    .width(width)
    .height(height)
    .position({ x, y })
    .fillColor(options.color)
    .fillOpacity(1)
    .strokeColor("#1a1a18")
    .strokeWidth(0.35)
    .layer("ATTACHMENT")
    .disableHit(true)
    .disableAutoZIndex(true)
    .zIndex(options.zIndex)
    .metadata(options.metadata)
    .build();
}

function attachOverlay(item, tokenId) {
  item.attachedTo = tokenId;
  item.disableHit = true;
  item.disableAttachmentBehavior = ["SCALE", "ROTATION"];
  return item;
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
  } catch {
    return { center: item.position || { x: 0, y: 0 }, top: (item.position?.y || 0) - 70, width: 110, height: 70 };
  }
}

async function loadSceneRoom() {
  if (!(await OBR.scene.isReady())) return;
  await clearOverlays();
  lastOverlaySignature = "";
  const metadata = await OBR.scene.getMetadata();
  connectRoom(metadata[ROOM_KEY] || "");
}

async function openFloatingPopover(options) {
  const screenWidth = await OBR.viewport.getWidth();
  const screenHeight = await OBR.viewport.getHeight();
  const savedPosition = readSavedPopoverPosition(options.storageKey);
  const position = savedPosition || {
    left: Math.round(screenWidth / 2),
    top: Math.round(screenHeight / 2)
  };
  const itemQuery = options.itemId ? `&itemId=${encodeURIComponent(options.itemId)}` : "";
  OBR.popover.open({
    id: options.id,
    url: `${options.url}?v=0137&x=${position.left}&y=${position.top}&w=${screenWidth}&h=${screenHeight}${itemQuery}`,
    width: screenWidth,
    height: screenHeight,
    anchorReference: "POSITION",
    anchorPosition: {
      left: Math.round(screenWidth / 2),
      top: Math.round(screenHeight / 2)
    },
    anchorOrigin: { horizontal: "CENTER", vertical: "CENTER" },
    transformOrigin: { horizontal: "CENTER", vertical: "CENTER" },
    hidePaper: true,
    disableClickAway: true
  });
}

function readSavedPopoverPosition(key) {
  if (!key) return null;
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    if (Number.isFinite(value?.left) && Number.isFinite(value?.top)) return value;
  } catch {
    return null;
  }
  return null;
}

function setupContextMenu() {
  OBR.contextMenu.create({
    id: ATTACK_CONTEXT_MENU_ID,
    icons: [
      {
        icon: "/dndsheet/obr-sheet-link/icon.png",
        label: "Атаки",
        filter: {
          min: 1,
          max: 1
        }
      }
    ],
    embed: {
      url: "/dndsheet/obr-sheet-link/context.html?v=0137",
      height: 260
    },
    onClick(context) {
      const itemId = context?.items?.[0]?.id || context?.item?.id || context?.itemId || "";
      if (itemId) localStorage.setItem("dnd_obr_context_item", itemId);
    }
  });

  OBR.contextMenu.create({
    id: SPELL_CONTEXT_MENU_ID,
    icons: [
      {
        icon: "/dndsheet/obr-sheet-link/icon.png",
        label: "Заклинания",
        filter: {
          min: 1,
          max: 1
        }
      }
    ],
    onClick(context, elementId) {
      const itemId = context?.items?.[0]?.id || context?.item?.id || context?.itemId || "";
      if (itemId) localStorage.setItem("dnd_obr_context_item", itemId);
      openFloatingPopover({
        id: "ru.dndsheet.link/spells-popover",
        url: "/dndsheet/obr-sheet-link/spells.html",
        itemId,
        storageKey: "dnd_obr_spells_position"
      });
    }
  });

  OBR.contextMenu.create({
    id: ABILITY_CONTEXT_MENU_ID,
    icons: [
      {
        icon: "/dndsheet/obr-sheet-link/icon.png",
        label: "Умения",
        filter: {
          min: 1,
          max: 1
        }
      }
    ],
    onClick(context, elementId) {
      const itemId = context?.items?.[0]?.id || context?.item?.id || context?.itemId || "";
      if (itemId) localStorage.setItem("dnd_obr_context_item", itemId);
      openFloatingPopover({
        id: "ru.dndsheet.link/abilities-popover",
        url: "/dndsheet/obr-sheet-link/abilities.html",
        itemId,
        storageKey: "dnd_obr_abilities_position"
      });
    }
  });
}

if (OBR.isAvailable) {
  OBR.onReady(() => {
    setupContextMenu();
    loadSceneRoom();
    OBR.scene.onReadyChange((ready) => {
      if (ready) loadSceneRoom();
      else connectRoom("");
    });
    OBR.scene.onMetadataChange((metadata) => connectRoom(metadata[ROOM_KEY] || ""));
    OBR.scene.items.onChange(scheduleIfLinksChanged);
  });
}
