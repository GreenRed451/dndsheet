const WINDOW_WIDTH = 720;
const WINDOW_HEIGHT = 620;

export function enablePopoverDrag(OBR, options) {
  const root = document.getElementById(options.rootId);
  const handle = root?.querySelector(".spell-menu-head");
  if (!root || !handle) return;

  positionWindow(root);
  if (!OBR.isAvailable) return;

  handle.classList.add("draggable-window-head");
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const rect = root.getBoundingClientRect();
    const baseLeft = rect.left;
    const baseTop = rect.top;

    const onMove = (moveEvent) => {
      const next = clampPanelPosition({
        left: baseLeft + moveEvent.clientX - startX,
        top: baseTop + moveEvent.clientY - startY
      });
      root.style.left = `${next.left}px`;
      root.style.top = `${next.top}px`;
      root.classList.add("dragging-window");
    };

    const onUp = () => {
      handle.releasePointerCapture(event.pointerId);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      root.classList.remove("dragging-window");
      const nextRect = root.getBoundingClientRect();
      localStorage.setItem(options.storageKey, JSON.stringify({
        left: Math.round(nextRect.left + nextRect.width / 2),
        top: Math.round(nextRect.top + nextRect.height / 2)
      }));
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp, { once: true });
  });
}

function positionWindow(root) {
  const params = new URLSearchParams(window.location.search);
  const centerX = parseInt(params.get("x"), 10) || Math.round(window.innerWidth / 2);
  const centerY = parseInt(params.get("y"), 10) || Math.round(window.innerHeight / 2);
  const next = clampPanelPosition({
    left: centerX - WINDOW_WIDTH / 2,
    top: centerY - WINDOW_HEIGHT / 2
  });
  root.style.left = `${next.left}px`;
  root.style.top = `${next.top}px`;
}

function clampPanelPosition(position) {
  const margin = 12;
  return {
    left: Math.max(margin, Math.min(window.innerWidth - WINDOW_WIDTH - margin, Math.round(position.left))),
    top: Math.max(margin, Math.min(window.innerHeight - WINDOW_HEIGHT - margin, Math.round(position.top)))
  };
}
