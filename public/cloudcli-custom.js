// Our changes to CloudCLI UI, loaded by its page (see index.html).
(() => {
  // A link ending in #panes=<json> sets the tab layout ({left: [ids], right: [ids], rightActive: id},
  // see src/shared/hooks/useSplitPane.ts). It runs before the app starts, then removes itself from the address.
  if (location.hash.startsWith('#panes=')) {
    try { localStorage.setItem('quests-panes', decodeURIComponent(location.hash.slice(7))); } catch {}
    history.replaceState(null, '', location.pathname + location.search);
  }

  // Text size (--base, see cloudcli-custom.css). The slider is in the quick settings pane (QuickSettingsContent.tsx);
  // this applies the stored size before the app starts and keeps the split-screen pane in step.
  const set = px => document.documentElement.style.setProperty('--base', px + 'px');
  try { set(+localStorage.getItem('quests-font-base') || 19.75); } catch {}
  window.addEventListener('storage', e => { if (e.key === 'quests-font-base' && e.newValue) set(e.newValue); });

  // Tool calls collapse to a 1px line. In CloudCLI UI 1.37.3 a tool call is either a group
  // (.chat-message.tool) or an assistant message without the plain-text block (div[dir=auto]).
  // ponytail: matches the app's markup, re-check after an upgrade of CloudCLI UI.
  // Anything with an input field (a question waiting for an answer) is never collapsed.
  const isTool = el => !el.querySelector('input, textarea') && (el.matches('.chat-message.tool') ||
    (el.matches('.chat-message.assistant') && !el.querySelector(':scope > .w-full > .w-full > div[dir="auto"]')));
  // React rewrites className on re-render, so our classes are re-applied after every change, and the
  // open state lives here, not in the class.
  const opened = new WeakSet();
  let queued = false;
  const mark = () => {
    queued = false;
    for (const el of document.querySelectorAll('.chat-message')) {
      el.classList.toggle('qt-tool', isTool(el));
      el.classList.toggle('qt-open', opened.has(el));
    }
  };
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(mark); } })
    .observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  document.addEventListener('click', e => {
    const el = e.target.closest?.('.qt-tool');
    if (!el) return;
    const open = opened.has(el);
    if (open && e.clientY - el.getBoundingClientRect().top > 7) return;  // a click inside an open tool works as usual
    open ? opened.delete(el) : opened.add(el);
    mark();
    e.preventDefault(); e.stopPropagation();
  }, true);
})();
