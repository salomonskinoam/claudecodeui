#!/usr/bin/env python3
"""quests priority queue: the Summary checks of the Stop hook (requirement 107), called by queue_stop.sh.

Reads the hook's JSON on stdin. Prints each failed check on stdout and exits 1, else exits 0.
Applies only to a turn that has a numbered item (a line starting "- **N.**" or "**N.**").
`python3 -I summary_check.py --test` runs the self-check.
"""
import json
import re
import sys

ITEM = re.compile(r'^\s*(?:-\s*)?\*\*(\d+(?:\.\d+)*)\.\*\*')
SUMMARY = re.compile(r'^\s*\*\*Summary:?\*\*:?\s*$')
CLOSING = re.compile(r'^\s*\**(running|required from you)\b', re.I)
QUOTES = '"“”«'


def turn_texts(transcript_path):
    """Claude's text blocks of the current turn, oldest first: everything after the end of the last turn (its Stop
    hook record) or the last entry that a person, an agent or a notification sent (a user entry that is not only tool
    results). Messages from agents and other chats are meta entries; skipping them read the last turn's final message
    as this turn's text, and every reply to an agent was sent back and written twice (9 Nov)."""
    texts = []
    with open(transcript_path, encoding='utf-8') as f:
        for line in f:
            d = json.loads(line)
            if d.get('isSidechain'):
                continue
            content = (d.get('message') or {}).get('content')
            if d.get('type') == 'system' and d.get('subtype') == 'stop_hook_summary':
                texts = []
            elif d.get('type') == 'user':
                if isinstance(content, str) or any(c.get('type') != 'tool_result' for c in content or []):
                    texts = []
            elif d.get('type') == 'assistant' and isinstance(content, list):
                texts += [c['text'] for c in content if c.get('type') == 'text']
    return texts


def failures(final, earlier):
    earlier_items = {m.group(1) for t in earlier for l in t.splitlines() if (m := ITEM.match(l))}
    lines = final.splitlines()
    final_items = {m.group(1) for l in lines if (m := ITEM.match(l))}
    if not earlier_items and not final_items:
        return []
    out = []
    missing = sorted(earlier_items - final_items)
    if missing:
        out.append(f'Items written between tool calls are missing from the final message: {", ".join(missing)}.')
    start = next((i for i, l in enumerate(lines) if SUMMARY.match(l)), None)
    if start is None:
        return out + ['The final message has no "**Summary**" line.']
    blocks = []
    for l in lines[start + 1:]:
        if CLOSING.match(l):
            break
        if ITEM.match(l):
            blocks.append([l])
        elif blocks:
            blocks[-1].append(l)
    for b in blocks:
        n = ITEM.match(b[0]).group(1)
        if not any(q in b[0] for q in QUOTES):
            out.append(f'Summary item {n} has no quotation mark in its first line: open it with the words it answers.')
        # The tag counts on the item's first line only: "[blocks]" written further down is text about the tag.
        if '[blocks]' in b[0] and '?' not in '\n'.join(b):
            out.append(f'Summary item {n} is tagged [blocks] but asks no question.')
    return out


def main():
    hook = json.load(sys.stdin)
    final = hook.get('last_assistant_message') or ''
    earlier = turn_texts(hook['transcript_path']) if hook.get('transcript_path') else []
    if earlier and earlier[-1].strip() == final.strip():
        earlier = earlier[:-1]
    out = failures(final, earlier)
    print('\n'.join(out))
    sys.exit(1 if out else 0)


def test():
    good = '**Summary**\n\n- **5.** "fix it". Done in abc123.\n- **6.** "which drawer" [blocks]\n  - Question: left or right?\n\n**Running:** nothing'
    assert failures(good, ['- **5.** started']) == []
    assert failures('Plain answer.\n\n**Running:** nothing', ['looking']) == []
    assert 'missing' in failures(good, ['- **7.** x'])[0]
    assert 'no "**Summary**"' in failures('- **5.** "x" done', [])[0]
    assert 'quotation' in failures('**Summary**\n- **5.** done', [])[0]
    assert 'asks no question' in failures('**Summary**\n- **5.** "x" [blocks] go.', [])[0]
    assert failures('**Summary**\n- **5.** "x" done.\n  - a [blocks] item asks no question: checked.', []) == []
    assert failures('1. restart the server\n2. reload', []) == []  # plain numbered lists are not items
    import os, tempfile
    rows = [
        {'type': 'assistant', 'message': {'content': [{'type': 'text', 'text': '**Summary**\n- **7.** "x" done'}]}},
        {'type': 'system', 'subtype': 'stop_hook_summary'},
        {'type': 'user', 'isMeta': True, 'message': {'content': 'Another Claude session sent a message: ...'}},
        {'type': 'assistant', 'message': {'content': [{'type': 'text', 'text': 'reading it'}]}},
    ]
    with tempfile.NamedTemporaryFile('w', suffix='.jsonl', delete=False) as f:
        f.write('\n'.join(json.dumps(r) for r in rows))
    assert turn_texts(f.name) == ['reading it'], turn_texts(f.name)  # the last turn's item 7 is not this turn's
    os.unlink(f.name)
    print('ok')


if __name__ == '__main__':
    test() if sys.argv[1:] == ['--test'] else main()
