import { useEffect, useState } from 'react';

import { authenticatedFetch } from '@/shared/api';

type Usage = { email: string | null; limits: Array<{ label: string; percent: number; resetsAt: string | null }> };

const resetsIn = (iso: string | null): string => {
  if (!iso) return '';
  const hours = Math.max(0, (Date.parse(iso) - Date.now()) / 3_600_000);
  return hours < 24 ? `Resets in ${Math.ceil(hours)}h` : `Resets in ${Math.round(hours / 24)}d`;
};

/**
 * quests: the account and plan limits at the top of the sidebar, where the app logo was: the email, then one bar
 * per limit (session, weekly, per model) with its percent and when it resets. From GET /api/quests/usage, every
 * 60 seconds.
 */
export default function UsageWidget() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const load = () => authenticatedFetch('/api/quests/usage').then(async (r) => {
      const json = await r.json();
      if (r.ok) { setUsage(json); setError(null); } else setError(json.error ?? `HTTP ${r.status}`);
    }).catch((e: unknown) => setError(String(e)));
    load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="min-w-0 flex-1 text-[12px] text-[#cccccc]" data-quests-usage="widget">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#7f8081]">Account</div>
      <div className="flex justify-between gap-2"><span className="text-[#7f8081]">Email</span><span className="truncate">{usage?.email ?? '...'}</span></div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[#7f8081]">Usage</div>
      {error && <div className="text-[11px] text-red-400">{error}</div>}
      {usage?.limits.map((l) => (
        <div key={l.label} className="mt-0.5">
          <div className="flex justify-between"><span>{l.label}</span><span>{l.percent}%</span></div>
          <div className="h-1 rounded bg-[#3c3c3c]"><div className="h-1 rounded bg-[#3794ff]" style={{ width: `${Math.min(100, l.percent)}%` }} /></div>
          <div className="text-[10px] text-[#7f8081]">{resetsIn(l.resetsAt)}</div>
        </div>
      ))}
    </div>
  );
}
