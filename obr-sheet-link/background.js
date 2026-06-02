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

const ROOM_KEY = "ru.dndsheet.link/room";
const LINK_KEY = "ru.dndsheet.link/character";
const OVERLAY_KEY = "ru.dndsheet.link/overlay";

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
  return {
    key,
    name: data.charName || data._name || key,
    ac: parseInt(data.ac, 10) || 10,
    hpCur,
    hpMax
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
    return [item.id, link.playerKey, s.ac, s.hpCur, s.hpMax].join(":");
  }).sort().join("|");
  if (signature === lastOverlaySignature) return;
  lastOverlaySignature = signature;

  await clearOverlays();

  const overlays = [];
  for (const item of linkedItems) {
    const link = item.metadata[LINK_KEY];
    const s = summary(link.playerKey, players[link.playerKey]);
    const bounds = await getBounds(item);
    const width = 88;
    const barHeight = 14;
    const x = bounds.center.x - width / 2;
    const y = bounds.center.y + (bounds.height || 90) * 0.27;
    const pct = Math.max(0, Math.min(1, s.hpCur / s.hpMax));
    const color = hpColor(s.hpCur, s.hpMax);
    const badge = 26;
    const badgeX = bounds.center.x + (bounds.width || 90) * 0.32;
    const badgeY = bounds.center.y + (bounds.height || 90) * 0.15;
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
      attachOverlay(buildLabel()
        .plainText(`${s.hpCur}/${s.hpMax}`)
        .width(width)
        .height(barHeight)
        .position({ x, y })
        .padding(0)
        .fontSize(12)
        .fontWeight(800)
        .textAlign("CENTER")
        .textAlignVertical("MIDDLE")
        .fillColor("#ffffff")
        .strokeColor("#1a1a18")
        .strokeWidth(1)
        .backgroundOpacity(0)
        .pointerWidth(0)
        .pointerHeight(0)
        .layer("ATTACHMENT")
        .disableHit(true)
        .disableAutoZIndex(true)
        .zIndex(9002)
        .metadata(metaBase)
        .build(), item.id),
      attachOverlay(buildShape()
        .shapeType("CIRCLE")
        .width(badge)
        .height(badge)
        .position({ x: badgeX, y: badgeY })
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
      attachOverlay(buildLabel()
        .plainText(String(s.ac))
        .width(badge)
        .height(badge)
        .position({ x: badgeX, y: badgeY })
        .padding(0)
        .fontSize(11)
        .fontWeight(800)
        .textAlign("CENTER")
        .textAlignVertical("MIDDLE")
        .fillColor("#ffffff")
        .strokeColor("#3f5f9a")
        .strokeWidth(1)
        .backgroundOpacity(0)
        .pointerWidth(0)
        .pointerHeight(0)
        .layer("ATTACHMENT")
        .disableHit(true)
        .disableAutoZIndex(true)
        .zIndex(9004)
        .metadata(metaBase)
        .build(), item.id)
    );
  }
  if (overlays.length) await OBR.scene.local.addItems(overlays);
}

async function clearOverlays() {
  const old = await OBR.scene.local.getItems((item) => Boolean(item.metadata?.[OVERLAY_KEY]));
  if (old.length) await OBR.scene.local.deleteItems(old.map((item) => item.id));
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

if (OBR.isAvailable) {
  OBR.onReady(() => {
    loadSceneRoom();
    OBR.scene.onReadyChange((ready) => {
      if (ready) loadSceneRoom();
      else connectRoom("");
    });
    OBR.scene.onMetadataChange((metadata) => connectRoom(metadata[ROOM_KEY] || ""));
    OBR.scene.items.onChange(scheduleIfLinksChanged);
  });
}
