#!/usr/bin/env python3
"""Prints "noam" when the current turn answers a message Noam typed, else "event" (an agent, a notification, a
listener woke the chat). The stop hook requires a Summary only on the first (requirement 113).
Usage: woken_by.py <transcript.jsonl>; `woken_by.py --test` runs the self-check."""
import json
import sys

EVENT_TEXT = ('<task-notification>', 'Message from the quests manager:')


def kind(row):
    """'noam', 'event', or None for an entry that starts no turn (tool results, images, hook feedback, skills)."""
    if row.get('type') != 'user' or row.get('isSidechain') or row.get('isCompactSummary'):
        return None
    content = (row.get('message') or {}).get('content')
    blocks = [{'type': 'text', 'text': content}] if isinstance(content, str) else content or []
    texts = [b.get('text', '') for b in blocks if b.get('type') != 'tool_result']
    if not texts:
        return None
    text = texts[0].lstrip()
    if (row.get('origin') or {}).get('kind') in ('task-notification', 'peer') or text.startswith(EVENT_TEXT):
        return 'event'
    if row.get('isMeta') or text.startswith('<local-command-stdout>'):
        return None
    return 'noam'


def woken_by(lines):
    return woken_by_kinds([kind(json.loads(l)) for l in lines])


def woken_by_file(path):
    """Reads from the end, doubling the tail until it holds a turn start: a transcript reaches 180 MB."""
    with open(path, 'rb') as f:
        size = f.seek(0, 2)
        n = 1 << 20
        while True:
            f.seek(max(0, size - n))
            lines = f.read().split(b'\n')[1 if n < size else 0:]
            kinds = [kind(json.loads(l)) for l in lines if b'"user"' in l]
            if any(kinds) or n >= size:
                return woken_by_kinds(kinds)
            n *= 2


def woken_by_kinds(kinds):
    return next((k for k in reversed(kinds) if k), 'noam')


def test():
    h = {'type': 'user', 'origin': {'kind': 'human'}, 'message': {'content': 'go'}}
    img = {'type': 'user', 'isMeta': True, 'message': {'content': [{'type': 'text', 'text': '[Image: source: x]'}]}}
    tr = {'type': 'user', 'message': {'content': [{'type': 'tool_result', 'content': 'ok'}]}}
    tn = {'type': 'user', 'origin': {'kind': 'task-notification'}, 'message': {'content': '<task-notification>x'}}
    peer = {'type': 'user', 'isMeta': True, 'origin': {'kind': 'peer'}, 'message': {'content': 'Another Claude ...'}}
    lis = {'type': 'user', 'message': {'content': 'Message from the quests manager: your listener "x" ended'}}
    fb = {'type': 'user', 'isMeta': True, 'message': {'content': 'Stop hook feedback: ...'}}
    run = lambda *rows: woken_by(json.dumps(r) for r in rows)
    assert run(h, img, tr) == 'noam'
    assert run(h, tr, tn, tr) == 'event'
    assert run(tn, h) == 'noam'
    assert run(h, peer, fb) == 'event'
    assert run(h, lis) == 'event'
    assert run({'type': 'user', 'message': {'content': 'old message, no origin'}}) == 'noam'
    print('ok')


if __name__ == '__main__':
    if sys.argv[1:] == ['--test']:
        test()
    else:
        print(woken_by_file(sys.argv[1]))
