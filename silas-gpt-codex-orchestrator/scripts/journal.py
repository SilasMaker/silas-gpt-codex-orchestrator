#!/usr/bin/env python3
"""Local correlation journal. Does not send messages, execute plans, or start services.
Python 3.10+, macOS/Linux (flock). See references/protocol.md for JSON requests.
"""
import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from urllib.parse import urlsplit
import uuid


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def file_hash(file):
    with Path(file).open('rb') as handle:
        h = hashlib.sha256()
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            h.update(block)
        return h.hexdigest()


def git(root, *args):
    result = subprocess.run(['git', '-C', str(root), *args], capture_output=True, timeout=30)
    return result.returncode, result.stdout


def fingerprint(root, scope):
    root = Path(root).resolve(strict=True)
    repo = git(root, 'rev-parse', '--show-toplevel')
    in_repo = repo[0] == 0
    if scope is None:
        require(in_repo, 'non-Git projects need an explicit scope list of relative files')
        require(Path(os.fsdecode(repo[1]).strip()).resolve() == root, 'use the Git repository root')
        code, listing = git(root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z')
        require(code == 0, 'cannot enumerate baseline')
        scope = sorted(set(os.fsdecode(p) for p in listing.split(b'\0') if p))
    require(isinstance(scope, list) and all(isinstance(p, str) and p for p in scope), 'invalid scope')
    rows = []
    for relative in sorted(set(scope)):
        candidate = root / relative
        require(not Path(relative).is_absolute() and candidate.resolve().is_relative_to(root), 'scope escapes workspace')
        # Symlink/submodule inputs need separately declared concrete source; never silently omit them.
        require(not candidate.is_symlink(), 'scope contains a symlink; declare its concrete source')
        require(not candidate.is_dir(), 'scope contains a directory or submodule; declare files explicitly')
        rows.append((relative, file_hash(candidate) if candidate.exists() else 'DELETED'))
    head = git(root, 'rev-parse', '--verify', 'HEAD')[1] if in_repo else b''
    index = git(root, 'ls-files', '--stage', '-z')[1] if in_repo else b''
    return digest(head + b'\0' + index + b'\0' + json.dumps(rows, ensure_ascii=True).encode())


def new_run(root, thread, chat, scope=None, quality='engineering', max_rounds=12, max_minutes=60):
    root = Path(root).resolve(strict=True)
    url = urlsplit(chat)
    require(url.scheme == 'https' and url.netloc == 'chatgpt.com' and '/c/' in url.path and not url.query and not url.fragment, 'use the observed ChatGPT conversation URL')
    require(isinstance(thread, str) and thread.strip(), 'thread_id is required')
    require(quality in ('engineering', 'user'), 'quality must be engineering or user')
    require(1 <= max_rounds <= 100 and 1 <= max_minutes <= 1440, 'invalid budget')
    return dict(version=1, run_id=str(uuid.uuid4()), workspace=str(root), workspace_id=digest(str(root).encode()),
                thread_id=thread, chat_url=chat, scope=scope, quality=quality,
                phase='READY', rounds=0, max_rounds=max_rounds, deadline=time.time() + max_minutes * 60,
                baseline=fingerprint(root, scope), pending=None, evidence=None, history=[])


def current(s):
    return fingerprint(s['workspace'], s['scope'])


def budget(s):
    require(time.time() < s['deadline'], 'time budget exhausted; preserve state and report')


def event(s, name, **data):
    s['history'].append(dict(event=name, at=time.time(), **data))


def queue(s, kind, body):
    require(s['pending'] is None, 'pending message: inspect the bound chat before any retry')
    require(s['phase'] in ('READY', 'EXECUTED'), 'cannot queue in this phase')
    require(kind in (('REPORT',) if s['phase'] == 'EXECUTED' else ('INIT', 'REPLAN')), 'wrong message kind')
    budget(s)
    require(s['rounds'] < s['max_rounds'], 'round budget exhausted')
    require(current(s) == s['baseline'], 'baseline changed; refresh before sending')
    require(isinstance(body, str) and body.strip(), 'message body required')
    s['rounds'] += 1
    s['pending'] = dict(run_id=s['run_id'], message_id=str(uuid.uuid4()), baseline=s['baseline'],
                        round=s['rounds'], kind=kind, body=body, delivery='PREPARED')
    s['phase'] = 'WAIT_REPLY'
    event(s, 'queue', **s['pending'])


def receive(s, reply):
    budget(s)
    p = s['pending']
    require(s['phase'] == 'WAIT_REPLY' and p is not None, 'no pending reply')
    require((reply.get('run_id'), reply.get('reply_to'), reply.get('baseline')) ==
            (s['run_id'], p['message_id'], p['baseline']), 'reply correlation mismatch')
    require(current(s) == p['baseline'], 'baseline changed; obsolete response cannot execute')
    kind = reply.get('kind')
    require(kind in ('PLAN', 'DONE', 'BLOCKED'), 'unsupported reply kind')
    require(isinstance(reply.get('content'), str) and reply['content'].strip(), 'reply content required')
    if kind == 'DONE':
        e = s['evidence']
        require(p['kind'] == 'REPORT' and e and e['baseline'] == s['baseline'], 'DONE requires current execution evidence')
        require(e['checks'] and not e['remaining'] and all(c['result'] == 'passed' for c in e['checks']), 'incomplete or failed evidence')
        require(all(Path(c['artifact']).is_file() and file_hash(c['artifact']) == c['sha256'] for c in e['checks']), 'evidence artifact changed or missing')
        s['phase'] = 'READY_FOR_USER_REVIEW' if s['quality'] == 'user' else 'DONE'
    else:
        s['phase'] = 'PLANNED' if kind == 'PLAN' else 'BLOCKED'
    event(s, 'reply', **reply)
    s['pending'] = None


def begin(s):
    require(s['phase'] == 'PLANNED', 'execution requires PLANNED phase')
    budget(s)
    require(current(s) == s['baseline'], 'baseline changed since PLAN')
    s['phase'] = 'EXECUTING'
    event(s, 'begin', baseline=s['baseline'])


def finish(s, report):
    require(s['phase'] == 'EXECUTING', 'finish requires EXECUTING phase')
    checks, remaining = report.get('checks'), report.get('remaining')
    require(isinstance(checks, list) and isinstance(remaining, list), 'checks and remaining lists required')
    evidence = []
    for c in checks:
        require(all(isinstance(c.get(k), str) and c[k].strip() for k in ('name', 'result', 'action', 'artifact')), 'check needs name, result, action, artifact')
        require(c['result'] in ('passed', 'failed', 'unverified'), 'invalid check result')
        artifact = Path(c['artifact']).resolve(strict=True)
        evidence.append(dict(c, artifact=str(artifact), sha256=file_hash(artifact)))
    s['baseline'] = current(s)
    s['evidence'] = dict(baseline=s['baseline'], recorded_at=time.time(), checks=evidence, remaining=remaining)
    s['phase'] = 'EXECUTED'
    event(s, 'finish', evidence=s['evidence'])


def refresh(s, reason):
    require(s['phase'] in ('READY', 'WAIT_REPLY', 'PLANNED', 'EXECUTED', 'BLOCKED'), 'cannot refresh executing or completed work')
    require(isinstance(reason, str) and reason.strip(), 'refresh needs a reason')
    event(s, 'refresh', reason=reason, obsolete=s['pending'])
    s.update(phase='READY', baseline=current(s), pending=None, evidence=None)


def run_file(store, run):
    require(str(uuid.UUID(run)) == run, 'invalid run_id')
    return store / f'{run}.json'


def atomic(file, value):
    fd, temp = tempfile.mkstemp(prefix='.journal-', dir=file.parent)
    try:
        with os.fdopen(fd, 'w') as out:
            json.dump(value, out, ensure_ascii=False, indent=2)
            out.flush()
            os.fsync(out.fileno())
        os.replace(temp, file)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


@contextmanager
def locked(store):
    store.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (store / '.lock').open('a') as lock:
        os.chmod(store / '.lock', 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX)
        yield


def owners(store):
    file = store / 'active.json'
    return json.loads(file.read_text()) if file.exists() else {}


def create(store, state):
    store = Path(store).resolve()
    require(not store.is_relative_to(Path(state['workspace'])), 'state store must be outside shared workspace')
    with locked(store):
        active = owners(store)
        require(state['workspace_id'] not in active, 'workspace already has an active run; inspect or close it explicitly')
        atomic(run_file(store, state['run_id']), state)
        active[state['workspace_id']] = state['run_id']
        atomic(store / 'active.json', active)


def read(store, run):
    return json.loads(run_file(Path(store), run).read_text())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--store', type=Path, required=True, help='private directory outside shared workspace')
    parser.add_argument('action', choices=('init', 'status', 'queue', 'sent', 'receive', 'begin', 'finish', 'refresh', 'close'))
    parser.add_argument('request', type=Path, help='UTF-8 JSON; never a shell command or executable plan')
    a = parser.parse_args()
    request = json.loads(a.request.read_text())
    store = a.store.resolve()
    if a.action == 'init':
        s = new_run(request['workspace'], request['thread_id'], request['chat_url'], request.get('scope'),
                    request.get('quality', 'engineering'), request.get('max_rounds', 12), request.get('max_minutes', 60))
        create(store, s)
    else:
        with locked(store):
            s = read(store, request['run_id'])
            require(request['thread_id'] == s['thread_id'], 'thread binding mismatch')
            if a.action != 'status':
                require(owners(store).get(s['workspace_id']) == s['run_id'], 'run does not own the workspace')
            if a.action == 'queue':
                queue(s, request['kind'], request['body'])
            elif a.action in ('sent', 'receive'):
                require(request['chat_url'] == s['chat_url'], 'chat binding mismatch')
                if a.action == 'receive':
                    receive(s, request['reply'])
                else:
                    require(s['pending'] and request['visible_message_id'] == s['pending']['message_id'], 'receipt mismatch')
                    s['pending']['delivery'] = 'OBSERVED_IN_CHAT'
                    event(s, 'sent', message_id=request['visible_message_id'])
            elif a.action == 'begin':
                begin(s)
            elif a.action == 'finish':
                finish(s, request['report'])
            elif a.action == 'refresh':
                refresh(s, request['reason'])
            elif a.action == 'close':
                require(s['phase'] != 'EXECUTING', 'record actual execution outcome before closing')
                require(request.get('reason'), 'close reason required')
                if s['phase'] not in ('DONE', 'READY_FOR_USER_REVIEW'):
                    s['phase'] = 'PAUSED'
                event(s, 'close', reason=request['reason'])
            if a.action != 'status':
                atomic(run_file(store, s['run_id']), s)
            if a.action == 'close':
                active = owners(store)
                del active[s['workspace_id']]
                atomic(store / 'active.json', active)
    print(json.dumps(s, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.SubprocessError) as error:
        print(json.dumps({'error': str(error)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
