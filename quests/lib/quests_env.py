#!/usr/bin/env python3
"""quests: the environment of one quests server, for the hooks and scripts (the server's twin is
server/shared/quests-instance.ts). The contract: quests/INTERFACE.md.

~/.config/quests/user.env is the user's (TICKETS_REPO, QUESTS_USER, QUESTS_TZ). ~/.config/quests/<instance>.env is one
server's (QUESTS_INSTANCE, SERVER_PORT, DATABASE_PATH, QUESTS_UNIT_PREFIX, PROJECT_ROOTS, and it may override
TICKETS_REPO). The instance is $QUESTS_INSTANCE when set (the server, its chat services and listeners), else the one
whose PROJECT_ROOTS holds the folder (a chat started anywhere else), else the one with no PROJECT_ROOTS.

  quests_env.py --shell [folder]    prints `export KEY=value` lines for bash: eval "$(quests_env.py --shell)"
  quests_env.py --test              the self-check
"""
import os
import re
import shlex
import sys

CONFIG = os.path.expanduser('~/.config/quests')


def read(path):
    out = {}
    for line in open(path):
        m = re.match(r'^([A-Z_][A-Z0-9_]*)=(.*)$', line.strip())
        if m:
            out[m.group(1)] = m.group(2)
    return out


def roots(values):
    return [os.path.realpath(p) for p in values.get('PROJECT_ROOTS', '').split(':') if p]


def repo_of(folder):
    return re.sub(r'/\.claude/worktrees/[^/]+$', '', os.path.realpath(folder))


def resolve(folder, config=CONFIG, instance=None):
    """The merged environment of the server that serves `folder`."""
    user = read(os.path.join(config, 'user.env'))
    servers = {f[:-4]: read(os.path.join(config, f)) for f in sorted(os.listdir(config))
               if f.endswith('.env') and f != 'user.env'}
    if instance:
        server = servers[instance]
    else:
        repo = repo_of(folder)
        mine = [s for s in servers.values() if any(repo == r or repo.startswith(r + '/') for r in roots(s))]
        server = mine[0] if mine else next(s for s in servers.values() if not roots(s))
    env = {**user, **server}
    for key in ('TICKETS_REPO', 'QUESTS_USER', 'QUESTS_TZ', 'QUESTS_INSTANCE', 'DATABASE_PATH', 'QUESTS_UNIT_PREFIX'):
        if not env.get(key):
            sys.exit(f'quests: {key} is not set in {config}/user.env or the server file (quests/INTERFACE.md)')
    env['DATABASE_PATH'] = os.path.expanduser(env['DATABASE_PATH'])
    return env


def current():
    """The environment of the server this process belongs to."""
    return resolve(os.environ.get('CLAUDE_PROJECT_DIR') or os.getcwd(), instance=os.environ.get('QUESTS_INSTANCE'))


def test():
    import tempfile
    d = tempfile.mkdtemp()
    open(f'{d}/user.env', 'w').write('TICKETS_REPO=me/tickets\nQUESTS_USER=Ann\nQUESTS_TZ=UTC\n')
    open(f'{d}/main.env', 'w').write('QUESTS_INSTANCE=main\nDATABASE_PATH=/db/main\nQUESTS_UNIT_PREFIX=quests\n')
    open(f'{d}/demo.env', 'w').write(f'QUESTS_INSTANCE=demo\nDATABASE_PATH=/db/demo\nQUESTS_UNIT_PREFIX=quests-demo\n'
                                     f'PROJECT_ROOTS={d}/demo\nTICKETS_REPO=me/demo-tickets\n')
    os.makedirs(f'{d}/demo/.claude/worktrees/x')
    assert resolve(f'{d}/demo', d)['QUESTS_INSTANCE'] == 'demo'
    assert resolve(f'{d}/demo/.claude/worktrees/x', d)['TICKETS_REPO'] == 'me/demo-tickets'
    assert resolve('/elsewhere', d)['TICKETS_REPO'] == 'me/tickets'
    assert resolve('/elsewhere', d, instance='demo')['DATABASE_PATH'] == '/db/demo'
    print('quests_env: ok')


if __name__ == '__main__':
    if sys.argv[1:2] == ['--test']:
        test()
    elif sys.argv[1:2] == ['--shell']:
        env = resolve(sys.argv[2], instance=os.environ.get('QUESTS_INSTANCE')) if len(sys.argv) > 2 else current()
        print('\n'.join(f'export {k}={shlex.quote(v)}' for k, v in env.items()))
    else:
        sys.exit(__doc__)
