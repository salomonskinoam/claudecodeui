import { useEffect } from 'react';

/**
 * quests: the text size, not the browser's zoom (requirement 46). A pinch on the touchpad (the browser reports it
 * as a wheel with Ctrl), Ctrl+wheel, Ctrl+= and Ctrl+- scale the page's root size, which every text size and
 * spacing of the page follows; Ctrl+0 puts it back. The browser's own zoom is stopped on those gestures. The
 * scale is kept per viewer in the browser, and each window (the right pane is one) applies it on load.
 */

const STORE = 'quests-text-scale';
const MIN = 0.6;
const MAX = 2.2;
const STEP = 0.1;

export const readTextScale = (): number => {
  try {
    const n = Number(localStorage.getItem(STORE));
    return Number.isFinite(n) && n >= MIN && n <= MAX ? n : 1;
  } catch {
    return 1;
  }
};

export function applyTextScale(scale: number): void {
  const clamped = Math.min(MAX, Math.max(MIN, Math.round(scale * 100) / 100));
  document.documentElement.style.fontSize = clamped === 1 ? '' : `${clamped * 100}%`;
  document.documentElement.dataset.questsTextScale = String(clamped);
  try {
    localStorage.setItem(STORE, String(clamped));
  } catch {
    /* no storage: the scale holds for this page load only */
  }
}

export function useTextScale(): void {
  useEffect(() => {
    applyTextScale(readTextScale());
    const step = (direction: number) => applyTextScale(readTextScale() + direction * STEP);
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key === '=' || event.key === '+') { event.preventDefault(); step(1); }
      else if (event.key === '-' || event.key === '_') { event.preventDefault(); step(-1); }
      else if (event.key === '0') { event.preventDefault(); applyTextScale(1); }
    };
    // A touchpad pinch arrives as a wheel event with ctrlKey set; so does Ctrl+wheel. Not passive, so the
    // browser's zoom can be stopped.
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      if (event.deltaY !== 0) step(event.deltaY < 0 ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
    };
  }, []);
}
