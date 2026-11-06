import { useEffect, type RefObject } from 'react';

/**
 * quests: smooth mouse-wheel scrolling in a scroll pane (Noam, 6 Nov: "i want a much smoother scrolling
 * experience. right now it jumps many lines every scroll tick"). One wheel notch moves the pane by NOTCH_LINES
 * lines of its text, spread over a few frames; notches that come fast add up. A touchpad (small pixel steps,
 * already smooth), Ctrl+wheel (text size), Shift+wheel and an inner box that can still scroll keep the browser's
 * own scrolling. The steps are relative to where the pane is, so rows that land above (older history) do not
 * break the movement.
 */

/** Lines of the pane's text per wheel notch (the browser moves 3). */
const NOTCH_LINES = 1.5;
/** Share of the remaining distance moved per 60 Hz frame. */
const EASE = 0.22;

/** Wheel notches in this event: a mouse reports lines (Firefox) or about 100 px per notch; a touchpad less. */
const notchesOf = (event: WheelEvent): number => {
  const mode = event.deltaMode; // read first: Firefox then reports a mouse in lines
  if (mode === 1) return event.deltaY / 3;
  if (mode === 2) return event.deltaY * 10;
  return Math.abs(event.deltaY) >= 50 ? event.deltaY / 100 : 0;
};

/** An element between the target and the pane that can still scroll this way takes the wheel itself. */
const innerScrolls = (target: EventTarget | null, pane: HTMLElement, down: boolean): boolean => {
  for (let el = target instanceof Element ? target : null; el && el !== pane; el = el.parentElement) {
    if (el.scrollHeight <= el.clientHeight) continue;
    const overflow = getComputedStyle(el).overflowY;
    if (overflow !== 'auto' && overflow !== 'scroll') continue;
    if (down ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
  }
  return false;
};

export function useSmoothWheel(paneRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return undefined;
    let remaining = 0;
    let frame = 0;
    let last = 0;
    const step = (now: number) => {
      const frames = last ? Math.min(4, (now - last) / 16.7) : 1;
      last = now;
      const want = remaining * (1 - (1 - EASE) ** frames);
      const move = Math.abs(want) < 1 ? Math.sign(remaining) * Math.min(1, Math.abs(remaining)) : Math.round(want);
      const before = pane.scrollTop;
      pane.scrollTop = before + move;
      remaining -= move;
      // At the top or the bottom the pane no longer moves: drop the rest.
      if (Math.abs(remaining) < 0.5 || pane.scrollTop === before) {
        remaining = 0;
        frame = 0;
        last = 0;
        return;
      }
      frame = requestAnimationFrame(step);
    };
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.shiftKey || event.defaultPrevented) return;
      const notches = notchesOf(event);
      if (notches === 0 || innerScrolls(event.target, pane, notches > 0)) return;
      event.preventDefault();
      const line = Number.parseFloat(getComputedStyle(pane).lineHeight) || 24;
      // A turn of direction drops what was left of the other way.
      if (Math.sign(remaining) !== Math.sign(notches)) remaining = 0;
      remaining += notches * NOTCH_LINES * line;
      if (!frame) frame = requestAnimationFrame(step);
    };
    pane.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      pane.removeEventListener('wheel', onWheel);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [paneRef]);
}
