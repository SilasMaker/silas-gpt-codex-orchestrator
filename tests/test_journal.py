import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'silas-gpt-codex-orchestrator/scripts/journal.py'
spec = importlib.util.spec_from_file_location('journal', SCRIPT)
j = importlib.util.module_from_spec(spec)
spec.loader.exec_module(j)


class JournalTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / 'project'
        self.root.mkdir()
        self.source = self.root / 'app.txt'
        self.source.write_text('first')
        self.scope = ['app.txt']
        self.state = j.new_run(self.root, 'thread-a', 'https://chatgpt.com/c/test-a', self.scope, 'user', 3, 60)

    def send(self, kind='INIT'):
        j.queue(self.state, kind, 'Please inspect the task')
        return dict(self.state['pending'])

    def reply(self, kind='PLAN', pending=None):
        p = pending or self.state['pending']
        return dict(run_id=self.state['run_id'], reply_to=p['message_id'], baseline=p['baseline'], kind=kind, content='Implement the scoped task')

    def plan(self):
        self.send()
        j.receive(self.state, self.reply())

    def evidence(self):
        log = self.base / 'test.log'
        log.write_text('Observed behavior: first')
        return {'checks': [{'name': 'source check', 'result': 'passed', 'action': 'read app.txt', 'artifact': str(log)}], 'remaining': []}

    def test_content_change_without_commit_rejects_plan(self):
        self.send()
        self.source.write_text('edited meanwhile')
        with self.assertRaisesRegex(ValueError, 'baseline'):
            j.receive(self.state, self.reply())

    def test_change_after_plan_rejects_execution(self):
        self.plan()
        self.source.write_text('changed after review')
        with self.assertRaisesRegex(ValueError, 'baseline'):
            j.begin(self.state)

    def test_timeout_cannot_queue_second_message(self):
        pending = self.send()
        restored = json.loads(json.dumps(self.state))
        with self.assertRaisesRegex(ValueError, 'pending'):
            j.queue(restored, 'INIT', 'retry')
        self.assertEqual(pending['message_id'], restored['pending']['message_id'])

    def test_wrong_run_and_late_reply_rejected(self):
        old = self.send()
        wrong = self.reply()
        wrong['run_id'] = 'other-run'
        with self.assertRaisesRegex(ValueError, 'correlation'):
            j.receive(self.state, wrong)
        j.refresh(self.state, 'new information; previous message is obsolete')
        self.send('REPLAN')
        with self.assertRaisesRegex(ValueError, 'correlation'):
            j.receive(self.state, self.reply(pending=old))

    def test_repeated_plan_cannot_execute_twice(self):
        self.plan()
        j.begin(self.state)
        with self.assertRaisesRegex(ValueError, 'PLANNED'):
            j.begin(self.state)

    def test_done_is_not_user_acceptance(self):
        self.plan()
        j.begin(self.state)
        j.finish(self.state, self.evidence())
        self.send('REPORT')
        j.receive(self.state, self.reply('DONE'))
        self.assertEqual(self.state['phase'], 'READY_FOR_USER_REVIEW')

    def test_done_requires_passing_current_evidence(self):
        self.plan()
        j.begin(self.state)
        evidence = self.evidence()
        evidence['checks'][0]['result'] = 'failed'
        j.finish(self.state, evidence)
        self.send('REPORT')
        with self.assertRaisesRegex(ValueError, 'evidence'):
            j.receive(self.state, self.reply('DONE'))

    def test_changed_evidence_invalidates_done(self):
        self.plan()
        j.begin(self.state)
        evidence = self.evidence()
        j.finish(self.state, evidence)
        self.send('REPORT')
        Path(evidence['checks'][0]['artifact']).write_text('different run')
        with self.assertRaisesRegex(ValueError, 'evidence'):
            j.receive(self.state, self.reply('DONE'))

    def test_budget_is_enforced(self):
        self.state['rounds'] = self.state['max_rounds']
        with self.assertRaisesRegex(ValueError, 'budget'):
            self.send()

    def test_external_scope_rejected(self):
        with self.assertRaises(ValueError):
            j.fingerprint(self.root, ['../secret'])

    def test_git_snapshot_includes_untracked_and_staged_content(self):
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        first = j.fingerprint(self.root, None)
        self.source.write_text('untracked modified')
        second = j.fingerprint(self.root, None)
        self.assertNotEqual(first, second)
        subprocess.run(['git', '-C', str(self.root), 'add', 'app.txt'], check=True)
        self.assertNotEqual(second, j.fingerprint(self.root, None))

    def test_workspace_claim_blocks_other_run(self):
        store = self.base / 'state'
        j.create(store, self.state)
        other = j.new_run(self.root, 'thread-b', 'https://chatgpt.com/c/test-b', self.scope, 'user', 3, 60)
        with self.assertRaisesRegex(ValueError, 'active run'):
            j.create(store, other)
        self.assertEqual(j.read(store, self.state['run_id'])['thread_id'], 'thread-a')


if __name__ == '__main__':
    unittest.main()
