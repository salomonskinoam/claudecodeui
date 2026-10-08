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

  // Tool calls collapse in CSS (cloudcli-custom.css, same selector as TOOL below); a click opens or closes one
  // by adding qt-open. React rewrites className on re-render, so the opened ones are kept here and re-marked.
  const TOOL = ':is(.chat-message.tool, .chat-message.assistant:not(:has(> .w-full > .w-full > div[dir="auto"]))):not(:has(input, textarea))';
  const opened = new Set();
  new MutationObserver(() => {
    for (const el of opened) {
      if (!el.isConnected) opened.delete(el);
      else if (!el.classList.contains('qt-open')) el.classList.add('qt-open');
    }
  }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['class'] });

  document.addEventListener('click', e => {
    const el = e.target.closest?.('.chat-message');
    if (!el || !el.matches(TOOL)) return;
    const open = opened.has(el);
    if (open && e.clientY - el.getBoundingClientRect().top > 7) return;  // a click inside an open tool works as usual
    if (open) { opened.delete(el); el.classList.remove('qt-open'); } else { opened.add(el); el.classList.add('qt-open'); }
    e.preventDefault(); e.stopPropagation();
  }, true);
})();
