/**
 * quests: one line for a tool call, the tool's name and the head of its first string input, e.g. "Read: sdk/x.py"
 * or "Bash: python hor.py status". The agent summary under an Agent call and the running banner of a chat both use it.
 */
export function describeToolCall(name: string, input: unknown): string {
  const first = input && typeof input === 'object'
    ? Object.values(input as Record<string, unknown>).find((v) => typeof v === 'string' && v.trim())
    : undefined;
  const head = typeof first === 'string' ? first.trim().split('\n', 1)[0].slice(0, 60) : '';
  return head ? `${name}: ${head}` : name;
}
