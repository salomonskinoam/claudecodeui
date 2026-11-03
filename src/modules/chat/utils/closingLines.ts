/**
 * quests: the closing block of a reply ("Running: ...", "Required from you: ...", then the queue line "waiting for
 * ..." / "question ..." / "blocker ..." / "Done ...") is written one item per line, and markdown joins single
 * line breaks into one paragraph. Each item gets its own paragraph and its head in bold (Noam, 2 Nov: "should be
 * multiple lines based on the parts, running, required from you, question and so on. the main part such as
 * "question" should be bold").
 */

const HEADS = /^(\*\*)?(Running:|Required from you:|waiting for\b:?|question\b:?|blocker\b:?|done\b:?)(\*\*)?/i;

/** Only the tail of a reply is a closing block: from its last "Running:" line on. */
export function formatClosingLines(text: string): string {
  const lines = text.split('\n');
  let start = -1;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (/^\s*(\*\*)?Running:/i.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start < 0) return text;
  const out = lines.slice(0, start);
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i];
    const m = HEADS.exec(line.trimStart());
    if (!m) {
      out.push(line);
      continue;
    }
    const head = m[2];
    const rest = line.trimStart().slice(m[0].length);
    if (out.length > 0 && out[out.length - 1].trim() !== '') out.push('');
    out.push(`**${head}**${rest}`);
  }
  return out.join('\n');
}
