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

  // Tool calls collapse in CSS (cloudcli-custom.css); which ones are open is row state the chat pane keeps by
  // row id (src/modules/chat/ledger/rowOpen.ts) and draws as the qt-open class.
})();
