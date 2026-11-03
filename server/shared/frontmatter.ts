import matter from 'gray-matter';

const disabledFrontmatterEngine = () => ({});

const frontmatterOptions = {
  language: 'yaml',
  // Disable JS/JSON frontmatter parsing to avoid executable project content.
  // Mirrors Gatsby's mitigation for gray-matter.
  engines: {
    js: disabledFrontmatterEngine,
    javascript: disabledFrontmatterEngine,
    json: disabledFrontmatterEngine,
  },
};

/**
 * Front matter the YAML engine refuses, read as Claude Code reads it: one `key: value` per line, the value
 * being the rest of the line. A skill whose description holds a colon ("leave zero residue: commit and push")
 * is valid to Claude Code and was hidden from the page's slash menu (Noam, 3 Nov: "finalize chat skill is
 * still not available in the slash menu").
 */
function parseLineByLine(content: string): { data: Record<string, string>; content: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
  if (!m) return { data: {}, content };
  const data: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i <= 0 || /^\s/.test(line)) continue;
    data[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^(["'])(.*)\1$/, '$2');
  }
  return { data, content: m[2] };
}

export function parseFrontMatter(content: string) {
  try {
    return matter(content, frontmatterOptions);
  } catch {
    return parseLineByLine(content);
  }
}
