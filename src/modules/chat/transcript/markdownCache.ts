import type { Root } from 'hast';
import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
import { urlAttributes } from 'html-url-attributes';
import { defaultUrlTransform } from 'react-markdown';
import type { ReactElement } from 'react';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified, type PluggableList } from 'unified';
import { visit } from 'unist-util-visit';

/**
 * quests: a local cache of parsed markdown, so switching tabs is fast (Noam, 3 Nov: "make a local cache to
 * switch fast between tabs"). Every loaded row stays mounted (no lazy rows), so a tab switch mounts every row
 * of the chat again, and the cost was the markdown pipeline (remark, GFM, KaTeX) run once more per row: 1.3 s
 * for 146 rows. The pipeline's result, the hast tree, depends only on the text and the plugins, so it is kept
 * here by text; a mount then only turns the tree into elements.
 *
 * The pipeline and the url pass are react-markdown's own (lib/index.js: createProcessor, post), kept in step
 * with its version: raw html becomes text, every url attribute goes through defaultUrlTransform.
 */
const CAP = 3000;
const trees = new Map<string, Root>();

export function markdownTree(key: string, content: string, remarkPlugins: PluggableList, rehypePlugins: PluggableList): Root {
  const hit = trees.get(key);
  if (hit) {
    trees.delete(key);
    trees.set(key, hit);
    return hit;
  }
  const processor = unified().use(remarkParse).use(remarkPlugins).use(remarkRehype, { allowDangerousHtml: true }).use(rehypePlugins);
  const tree = processor.runSync(processor.parse(content)) as Root;
  visit(tree, (node, index, parent) => {
    if (node.type === 'raw' && parent && typeof index === 'number') {
      parent.children[index] = { type: 'text', value: node.value };
      return index;
    }
    if (node.type === 'element') {
      for (const key of Object.keys(urlAttributes)) {
        if (!Object.prototype.hasOwnProperty.call(node.properties, key)) continue;
        const test = urlAttributes[key as keyof typeof urlAttributes];
        if (test === null || test.includes(node.tagName)) {
          node.properties[key] = defaultUrlTransform(String(node.properties[key] || ''));
        }
      }
    }
    return undefined;
  });
  trees.set(key, tree);
  if (trees.size > CAP) trees.delete(trees.keys().next().value as string);
  return tree;
}

/** The elements of a tree, with the given component overrides (react-markdown's post step). */
export function renderMarkdownTree(tree: Root, components: Record<string, unknown>) {
  return toJsxRuntime(tree, { Fragment, components: components as never, ignoreInvalidStyle: true, jsx, jsxs, passKeys: true, passNode: true });
}

/**
 * The highlighted elements of one code block, kept by language and text: Prism's tokens turned into elements
 * were the largest script cost of a tab switch (0.43 s of 0.9 s for a chat of 114 rows, measured with the
 * headless check `switch` and a CPU profile). Elements are plain values, so one copy serves every mount.
 */
const blocks = new Map<string, ReactElement>();

export function highlightedBlock(language: string, code: string, render: () => ReactElement): ReactElement {
  const key = `${language}\n${code}`;
  const hit = blocks.get(key);
  if (hit) {
    blocks.delete(key);
    blocks.set(key, hit);
    return hit;
  }
  const made = render();
  blocks.set(key, made);
  if (blocks.size > CAP) blocks.delete(blocks.keys().next().value as string);
  return made;
}

/** Tests: the number of trees kept. */
export const markdownCacheSize = () => trees.size;
