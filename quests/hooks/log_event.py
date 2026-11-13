"""quests event log (requirement 120): one row from a script, such as the stop hook.

Usage: log_event.py <source> <kind> <session id or ""> [<detail as a JSON object>]
The table and its reader: server/modules/events, quests/bin/quests-events.
"""
import datetime
import json
import os
import sqlite3
import sys

source, kind, session = sys.argv[1], sys.argv[2], sys.argv[3] or None
detail = json.loads(sys.argv[4]) if len(sys.argv) > 4 else {}
sys.path.insert(0, os.path.join(os.path.dirname(os.path.realpath(__file__)), '..', 'lib'))
from quests_env import current  # noqa: E402
db = sqlite3.connect(current()['DATABASE_PATH'], timeout=10)
at = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
with db:
    db.execute('INSERT INTO ui_events (at, source, kind, session_id, detail) VALUES (?, ?, ?, ?, ?)',
               (at, source, kind, session, json.dumps(detail)))
