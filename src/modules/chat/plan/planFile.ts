import { authenticatedFetch } from '@/shared/api';

/** The plan name of a plan file path (~/.claude/plans/<name>.md), else null. */
export function planNameOfPath(filePath: unknown): string | null {
  const match = typeof filePath === 'string' ? /\/\.claude\/plans\/([A-Za-z0-9_-]+)\.md$/.exec(filePath) : null;
  return match ? match[1] : null;
}

/** Writes a plan file (~/.claude/plans/<name>.md) with Noam's edit. Throws when the server refuses. */
export async function savePlan(planName: string, text: string): Promise<void> {
  const response = await authenticatedFetch(`/api/quests/plan/${encodeURIComponent(planName)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) throw new Error(`could not save the plan (${response.status})`);
}
