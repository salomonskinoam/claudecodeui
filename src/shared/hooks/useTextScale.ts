import { useEffect } from 'react';

/**
 * quests: the chat's text size, not the browser's zoom (requirement 46; 3 Nov: "i want only the text to change
 * size in the chat, not the menus"). A pinch on the touchpad (the browser reports it as a wheel with Ctrl held,
 * where it reports it at all), Ctrl+wheel, Ctrl+= and Ctrl+- scale the transcript's text: the scale goes into
 * the CSS variable --quests-chat-scale, which public/cloudcli-custom.css applies inside .chat-messages-pane
 * only. Nothing else on the page moves. Ctrl+0 puts it back. Every key press or wheel notch moves the size by
 * half a pixel (Noam, 3 Nov: "should change 0.5 size each click"), the wheel's distance gathered and applied once
 * per frame so a pinch is one smooth movement. A label in the lower middle of the screen shows the size in
 * pixels for a second after each change. The scale (size over the slider's base, row 26) is kept per viewer in
 * the browser; each window (the right pane is one) applies it on load.
 */

const STORE = 'quests-text-scale';
const MIN = 0.4;
const MAX = 3;
/** Pixels per key press or wheel notch. */
const STEP_PX = 0.5;
/** Wheel distance of one notch (a mouse wheel click; a touchpad pinch sends many small parts of it). */
const WHEEL_UNITS_PER_NOTCH = 100;
const TOAST_MS = 1200;

/** The slider's base size in pixels (--base, cloudcli-custom.css), the size the scale multiplies. */
const basePx = (): number => Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--base')) || 19.75;
/** The chat text size in pixels, now. */
export const chatTextPx = (): number => basePx() * readTextScale();

export const readTextScale = (): number => {
  try {
    const n = Number(localStorage.getItem(STORE));
    return Number.isFinite(n) && n >= MIN && n <= MAX ? n : 1;
  } catch {
    return 1;
  }
};

let toast: HTMLDivElement | null = null;
let toastTimer: number | null = null;

function showToast(scale: number): void {
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'quests-text-size-toast';
    toast.setAttribute('data-quests-text-size', '');
    document.body.appendChild(toast);
  }
  toast.textContent = `${(Math.round(basePx() * scale * 100) / 100).toFixed(2).replace(/\.?0+$/, '')} px`;
  toast.classList.add('is-shown');
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast?.classList.remove('is-shown'), TOAST_MS);
}

/** Sets the chat text size in pixels; the scale over the base is what is stored. */
export const applyTextPx = (px: number): void => applyTextScale(px / basePx());

export function applyTextScale(scale: number, announce = true): void {
  const clamped = Math.min(MAX, Math.max(MIN, Math.round(scale * 10000) / 10000));
  const root = document.documentElement;
  // The page's root size is no longer scaled (it changed every spacing of the page and no text; 3 Nov).
  root.style.fontSize = '';
  root.style.setProperty('--quests-chat-scale', String(clamped));
  root.dataset.questsTextScale = String(clamped);
  try {
    localStorage.setItem(STORE, String(clamped));
  } catch {
    /* no storage: the scale holds for this page load only */
  }
  if (announce) showToast(clamped);
}

export function useTextScale(): void {
  useEffect(() => {
    applyTextScale(readTextScale(), false);
    // Wheel distance gathered between frames; one change per frame.
    let pending = 0;
    let frame = 0;
    const flush = () => {
      frame = 0;
      if (pending === 0) return;
      const px = -pending / WHEEL_UNITS_PER_NOTCH * STEP_PX;
      pending = 0;
      applyTextPx(chatTextPx() + px);
    };
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key === '=' || event.key === '+') { event.preventDefault(); applyTextPx(chatTextPx() + STEP_PX); }
      else if (event.key === '-' || event.key === '_') { event.preventDefault(); applyTextPx(chatTextPx() - STEP_PX); }
      else if (event.key === '0') { event.preventDefault(); applyTextScale(1); }
    };
    // A touchpad pinch arrives as a wheel event with ctrlKey set (Chrome everywhere; Firefox when its own
    // pinch zoom is off, about:config apz.allow_zooming = false, else Firefox zooms the page itself and sends
    // the page nothing); so does Ctrl+wheel. Not passive, so the browser's zoom can be stopped. Safari sends
    // gesture events instead: their scale change is taken as wheel distance.
    const onGesture = (event: Event & { scale?: number }) => {
      event.preventDefault();
      const scale = event.scale ?? 1;
      pending += (1 - scale) * WHEEL_UNITS_PER_NOTCH * 4;
      if (!frame) frame = window.requestAnimationFrame(flush);
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      if (event.deltaY === 0) return;
      // A line-stepped wheel (a mouse) reports small deltas in lines: 3 lines = one notch = 100 units.
      pending += event.deltaMode === 1 ? event.deltaY * 33 : event.deltaMode === 2 ? event.deltaY * 300 : event.deltaY;
      if (!frame) frame = window.requestAnimationFrame(flush);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('gesturechange', onGesture, { passive: false });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('gesturechange', onGesture);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
}
