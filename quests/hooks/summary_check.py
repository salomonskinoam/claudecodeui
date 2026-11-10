#!/usr/bin/env python3
"""quests priority queue: the Summary checks of the Stop hook (requirement 107), called by queue_stop.sh.

Reads the hook's JSON on stdin. Prints each failed check on stdout and exits 1, else exits 0.
Applies only to a run (Noam's message to the reply that waits for him) that has a numbered item (a line starting "- **N.**" or "**N.**").
`python3 -I summary_check.py --test` runs the self-check.
"""
import json
import re
import sys

ITEM = re.compile(r'^\s*(?:-\s*)?\*\*(\d+(?:\.\d+)*)\.\*\*')
SUMMARY = re.compile(r'^\s*(\*\*)?Summary:?(\*\*)?:?\s*$')
CLOSING = re.compile(r'^\s*\**(running|required from you)\b', re.I)
WAITING = re.compile(r'^\s*waiting for\b', re.I)
QUOTES = '"“”«'


NOT_NOAM = ('<task-notification>', 'Message from the quests manager:', '<local-command-stdout>')


def run_texts(transcript_path):
    """Claude's text blocks since Noam's last message, oldest first. Turns woken by an agent, a notification or a
    listener continue the same run, so their items belong in the run's one Summary (Noam, 10 Nov: "a single summary in
    the end and no summary while the turn was running, and the end one should contain all of the bullets above, with
    the same numbers"). A compaction also starts over: the chat no longer sees the text before it."""
    texts = []
    with open(transcript_path, encoding='utf-8') as f:
        for line in f:
            d = json.loads(line)
            if d.get('isSidechain'):
                continue
            content = (d.get('message') or {}).get('content')
            if d.get('type') == 'user' and not d.get('isMeta'):
                blocks = [{'type': 'text', 'text': content}] if isinstance(content, str) else content or []
                said = [c.get('text', '') for c in blocks if c.get('type') != 'tool_result']
                if said and (d.get('isCompactSummary') or not any(t.lstrip().startswith(NOT_NOAM) for t in said)):
                    texts = []
            elif d.get('type') == 'assistant' and isinstance(content, list):
                texts += [c['text'] for c in content if c.get('type') == 'text']
    return texts


def failures(final, earlier):
    lines = final.splitlines()
    start = next((i for i, l in enumerate(lines) if SUMMARY.match(l)), None)
    said = [l for l in lines if l.strip()]
    if said and WAITING.match(said[-1].replace('*', '')):
        if start is not None:
            return ['The reply ends with "waiting for", so the run goes on: it has no Summary. The one Summary comes in '
                    'the reply that ends with question, blocker or Done, and carries every item written since '
                    'Noam\'s last message.']
        return []
    earlier_items = {m.group(1) for t in earlier for l in t.splitlines() if (m := ITEM.match(l))}
    final_items = {m.group(1) for l in lines if (m := ITEM.match(l))}
    if not earlier_items and not final_items:
        return []
    if start is None:
        return ['The final message has no "**Summary**" line.']
    blocks = []
    for l in lines[start + 1:]:
        if CLOSING.match(l):
            break
        if ITEM.match(l):
            blocks.append([l])
        elif blocks:
            blocks[-1].append(l)
    out = []
    missing = sorted((earlier_items | final_items) - {ITEM.match(b[0]).group(1) for b in blocks})
    if missing:
        out.append('Items written since Noam\'s last message are missing from the Summary: '
                   f'{", ".join(missing)}. The Summary carries all of them, with the same numbers.')
    for b in blocks:
        n = ITEM.match(b[0]).group(1)
        if not any(q in b[0] for q in QUOTES):
            out.append(f'Summary item {n} has no quotation mark in its first line: open it with the words it answers.')
        # The tag counts on the item's first line only: "[blocks]" written further down is text about the tag.
        text = '\n'.join(b)
        if '[blocks]' in b[0] and '?' not in text:
            out.append(f'Summary item {n} is tagged [blocks] but asks no question.')
    return out


def main():
    hook = json.load(sys.stdin)
    final = hook.get('last_assistant_message') or ''
    earlier = run_texts(hook['transcript_path']) if hook.get('transcript_path') else []
    if earlier and earlier[-1].strip() == final.strip():
        earlier = earlier[:-1]
    out = failures(final, earlier)
    print('\n'.join(out))
    sys.exit(1 if out else 0)


def test():
    end = '\n\n**Running:** nothing\n\n**Required from you:** nothing\n\n**Done:** x'
    good = '**Summary**\n\n- **5.** "fix it". Done in abc123.\n- **6.** "which drawer" [blocks] Left or right?' + end
    assert failures(good, ['- **5.** started']) == []
    assert failures('Plain answer.' + end, ['looking']) == []
    assert 'missing' in failures(good, ['- **7.** x'])[0]
    assert 'no "**Summary**"' in failures('- **5.** "x" done' + end, [])[0]
    assert 'quotation' in failures('**Summary**\n- **5.** done' + end, [])[0]
    assert 'asks no question' in failures('**Summary**\n- **5.** "x" [blocks] go.' + end, [])[0]
    assert failures('**Summary**\n- **5.** "x" done.\n  - a [blocks] item asks no question: checked.' + end, []) == []
    assert failures('**Summary**\n- **43.** "is it gpu?" No, CPU only.' + end, []) == []  # a quoted question
    assert failures('1. restart the server\n2. reload' + end, []) == []  # plain numbered lists are not items
    wait = '\n\n**Running:** eval\n\n**Required from you:** nothing\n\n**waiting for:** the eval'
    assert failures('- **8.** "go" started the eval.' + wait, ['- **7.** x']) == []  # the run goes on
    assert 'goes on' in failures('**Summary**\n- **8.** "go" started.' + wait, [])[0]
    import os, tempfile
    rows = [
        {'type': 'user', 'message': {'content': 'old question'}},
        {'type': 'assistant', 'message': {'content': [{'type': 'text', 'text': '- **6.** "old" done'}]}},
        {'type': 'user', 'message': {'content': 'go'}},
        {'type': 'assistant', 'message': {'content': [{'type': 'text', 'text': '- **7.** "go" started'}]}},
        {'type': 'system', 'subtype': 'stop_hook_summary'},
        {'type': 'user', 'message': {'content': '<task-notification>\n<task-id>a1</task-id>'}},
        {'type': 'user', 'isMeta': True, 'message': {'content': 'Another Claude session sent a message: ...'}},
        {'type': 'user', 'message': {'content': [{'type': 'tool_result', 'content': 'ok'}]}},
        {'type': 'assistant', 'message': {'content': [{'type': 'text', 'text': 'reading it'}]}},
    ]
    with tempfile.NamedTemporaryFile('w', suffix='.jsonl', delete=False) as f:
        f.write('\n'.join(json.dumps(r) for r in rows))
    got = run_texts(f.name)
    assert got == ['- **7.** "go" started', 'reading it'], got  # item 7 of the woken turns' run, not item 6
    os.unlink(f.name)
    print('ok')


if __name__ == '__main__':
    test() if sys.argv[1:] == ['--test'] else main()
