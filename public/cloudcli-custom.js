// Our changes to CloudCLI UI, loaded by its page (see start-cloudcli.sh).
(() => {
  // Text size slider at the top. Sets --base (see cloudcli-custom.css), remembered in this browser.
  const set = px => document.documentElement.style.setProperty('--base', px + 'px');
  let px = 20;
  try { px = +localStorage.getItem('quests-font-base') || 20; } catch {}
  set(px);
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;top:4px;left:50%;transform:translateX(-50%);z-index:99999;' +
    'display:flex;gap:8px;align-items:center;padding:2px 10px;border-radius:6px;' +
    'background:rgba(127,127,127,.25);font:13px system-ui,sans-serif;color:inherit';
  bar.innerHTML = `text <input type="range" min="12" max="32" step="1" value="${px}" style="width:160px"> <span>${px}px</span>`;
  const [input, label] = [bar.querySelector('input'), bar.querySelector('span')];
  input.oninput = () => {
    set(input.value); label.textContent = input.value + 'px';
    try { localStorage.setItem('quests-font-base', input.value); } catch {}
  };
  // The right pane of the split screen (an iframe) has no slider of its own and follows the main page's.
  if (window.self === window.top) document.addEventListener('DOMContentLoaded', () => document.body.appendChild(bar));
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
