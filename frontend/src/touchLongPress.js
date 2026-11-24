// Long-press = right-click on iPad / iPhone.
//
// Much of the site uses right-click for its second action: clear a F/E
// column (right-click the Friendly/Enemy label), exclude a filter (tri-state
// boxes, alliance badges, keyword tags), reset a sort. iOS/iPadOS Safari
// never fires `contextmenu` for a finger press, so none of that was
// reachable on an iPad. Here a ~half-second press that doesn't move sends a
// synthetic `contextmenu` event to the pressed element (React's
// onContextMenu handlers pick it up through normal bubbling), and the click
// that iOS would fire when the finger lifts is swallowed.
//
// Only installed on iOS/iPadOS: Android and desktop browsers already turn a
// long press / right button into `contextmenu` themselves.

const HOLD_MS = 500;
const MOVE_PX = 10;

function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS 13+ "desktop" Safari
}

export function installTouchLongPress({ force = false } = {}) {
  if (typeof window === 'undefined' || window.__aosLongPress) return;
  if (!force && !isIOS()) return;
  window.__aosLongPress = true;

  let timer = null;
  let start = null;
  let swallowUntil = 0;

  const cancel = () => { clearTimeout(timer); timer = null; start = null; };

  document.addEventListener('touchstart', e => {
    cancel();
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const target = e.target;
    // Leave text fields, links and the lightbox/scroll areas to iOS.
    if (target.closest && target.closest('input[type=text], input[type=search], input[type=number], textarea, select, [contenteditable=true], a[href]')) return;
    start = { x: t.clientX, y: t.clientY, target };
    timer = setTimeout(() => {
      const s = start;
      cancel();
      if (!s || !s.target.isConnected) return;
      const ev = new MouseEvent('contextmenu', {
        bubbles: true, cancelable: true, view: window,
        clientX: s.x, clientY: s.y, button: 2, buttons: 2,
      });
      const handled = !s.target.dispatchEvent(ev); // a handler called preventDefault
      if (handled) {
        swallowUntil = Date.now() + 800;
        if (navigator.vibrate) { try { navigator.vibrate(15); } catch (_) {} }
      }
    }, HOLD_MS);
  }, { passive: true, capture: true });

  document.addEventListener('touchmove', e => {
    if (!start) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - start.x) > MOVE_PX || Math.abs(t.clientY - start.y) > MOVE_PX) cancel();
  }, { passive: true, capture: true });

  document.addEventListener('touchend', e => {
    cancel();
    // The long press already did its job: stop the tap that follows.
    // (the click handler below catches it if this doesn't).
    if (Date.now() < swallowUntil) {
      if (e.cancelable) e.preventDefault();
      swallowUntil = Date.now() + 400;
    }
  }, { passive: false, capture: true });
  document.addEventListener('touchcancel', cancel, { capture: true });

  document.addEventListener('click', e => {
    if (Date.now() < swallowUntil) {
      swallowUntil = 0;
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
}
