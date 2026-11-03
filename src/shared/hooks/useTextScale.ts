import { useEffect } from 'react';

/**
 * quests: the chat's text size, not the browser's zoom (requirement 46; 3 Nov: "i want only the text to change
 * size in the chat, not the menus"). A pinch on the touchpad (the browser reports it as a wheel with Ctrl held,
 * where it reports it at all), Ctrl+wheel, Ctrl+= and Ctrl+- scale the transcript's text: the scale goes into
 * the CSS variable --quests-chat-scale, which public/cloudcli-custom.css applies inside .chat-messages-pane
 * only. Nothing else on the page moves. Ctrl+0 puts it back. A wheel changes the scale by its own distance and
 * the change is applied once per frame, so a pinch is one smooth movement; a key is a step of 10 percent. A
 * small label on the chat shows the size for a second after each change. The scale is kept per viewer in the
 * browser; each window (the right pane is one) applies it on load.
 */

const STORE = 'quests-text-scale';
const MIN = 0.6;
const MAX = 2.2;
const STEP = 0.1;
/** A wheel distance of this many units (one touchpad pinch, about) is one doubling or halving. */
const WHEEL_UNITS_PER_DOUBLING = 1000;
const TOAST_MS = 1200;

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
  toast.textContent = `Text ${Math.round(scale * 100)} %`;
  toast.classList.add('is-shown');
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast?.classList.remove('is-shown'), TOAST_MS);
}

export function applyTextScale(scale: number, announce = true): void {
  const clamped = Math.min(MAX, Math.max(MIN, Math.round(scale * 1000) / 1000));
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
      const factor = 2 ** (-pending / WHEEL_UNITS_PER_DOUBLING);
      pending = 0;
      applyTextScale(readTextScale() * factor);
    };
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key === '=' || event.key === '+') { event.preventDefault(); applyTextScale(readTextScale() + STEP); }
      else if (event.key === '-' || event.key === '_') { event.preventDefault(); applyTextScale(readTextScale() - STEP); }
      else if (event.key === '0') { event.preventDefault(); applyTextScale(1); }
    };
    // A touchpad pinch arrives as a wheel event with ctrlKey set (Firefox on X11 sends none for a pinch); so
    // does Ctrl+wheel. Not passive, so the browser's zoom can be stopped.
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
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
}
