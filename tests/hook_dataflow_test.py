"""钩子脚本写给桌宠的数据（crosspet-hook.py）。只用临时目录，不打开桌宠。

    python3 tests/hook_dataflow_test.py
"""
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

HOOK = Path(__file__).resolve().parent.parent / "integrations" / "crosspet-hook.py"


class HookDataflowTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.state = root / "state"
        self.data = root / "data"
        self.state.mkdir()
        self.data.mkdir()
        (self.data / "ai-autostart-off").write_text("test", encoding="utf-8")
        self.env = dict(os.environ, CROSSPET_STATE_DIR=str(self.state), CROSSPET_DATA_DIR=str(self.data),
                        CODEX_HOME=str(root / "no-codex"))
        for name in ("ANTHROPIC_MODEL", "ANTHROPIC_BASE_URL"):
            self.env.pop(name, None)

    def tearDown(self):
        self.temp.cleanup()

    def run_hook(self, payload, character="claude"):
        result = subprocess.run([sys.executable, str(HOOK), character], input=json.dumps(payload), text=True,
                                capture_output=True, env=self.env, timeout=10)
        self.assertEqual((result.returncode, result.stderr), (0, ""))
        return self.read(f"{character}-state.json")

    def read(self, name):
        path = self.state / name
        return json.loads(path.read_text(encoding="utf-8-sig")) if path.exists() else None

    def test_command_name_reaches_state_and_sessions(self):
        for command, expected in [("curl -H 'secret' https://example.com", "curl"),
                                  ("ssh user@host", "ssh"),
                                  ("TOKEN=secret /usr/bin/curl --version", "curl")]:
            state = self.run_hook({"hook_event_name": "PreToolUse", "session_id": "s1",
                                   "tool_name": "Bash", "tool_input": {"command": command}})
            self.assertEqual(state["commandName"], expected)
            self.assertEqual(self.read("claude-sessions.json")["s1"]["commandName"], expected)
            self.assertNotIn("secret", json.dumps(state))

    def test_command_preview_prefix_and_privacy(self):
        examples = [
            ("npm run build > test.log", "npm run build"),
            ("npm run build:mac", "npm run build"),
            ("npm run build: mac", "npm run build"),
            ("pnpm exec tsc --noEmit", "pnpm exec tsc"),
            ("npx vite build --outDir dist", "npx vite build"),
            ("npm run build:win:arm64 --verbose", "npm run build"),
            ("pnpm run test:unit > test.log", "pnpm run test"),
            ("yarn build:production --watch", "yarn build"),
            ("bun run dev:local", "bun run dev"),
            ("npm --prefix desktop run build:mac", "npm run build"),
            ("npm run --silent build:mac", "npm run build"),
            ("npm --token hidden run build:mac", "npm run build"),
            ("pnpm -C app run lint:fix", "pnpm run lint"),
            ("docker compose up --build service", "docker compose up"),
            ("cargo build --release", "cargo build"),
            ("go test ./...", "go test"),
            ("git remote add origin https://example.com/repo", "git remote add"),
            ("python3 -m pytest tests", "python3 -m pytest"),
            ("npm run build 2>&1", "npm run build"),
            ("echo 2 > test.log", "echo 2"),
            ("echo '2'>test.log", "echo 2"),
            ("npm run build --with-a-long-option", "npm run build"),
            ("TOKEN=secret /usr/bin/npm run build && echo done", "npm run build"),
            ("git status --porcelain=v1", "git status"),
            ("echo 'a|b' | cat", "echo a|b"),
            ("curl -H 'secret' https://example.com", "curl"),
            ("curl --token hidden", "curl"),
            ("echo 你好世界你好世界", "echo"),
        ]
        for command, expected in examples:
            with self.subTest(command=command):
                state = self.run_hook({"hook_event_name": "PreToolUse", "session_id": "s1", "turn_id": "t1",
                                       "tool_use_id": "c1", "tool_name": "Bash", "tool_input": {"command": command}})
                preview = {"label": expected, "status": "running", "output": "", "callId": "c1"}
                self.assertEqual(state["commandPreview"], preview)
                self.assertEqual(self.read("claude@claude-cli-state.json")["commandPreview"], preview)
                self.assertEqual(self.read("claude-sessions.json")["s1"]["commandPreview"], preview)
                self.assertNotIn("hidden", json.dumps(state))
                self.assertNotIn("secret", json.dumps(state))

    def test_command_results_recover_matching_call_and_keep_short_output(self):
        for response, status, output in [
            ({"stdout": "\x1b[32mdone\x1b[0m\n", "exit_code": 0}, "success", "done"),
            ({"stderr": "failed", "exitCode": 1}, "failure", "failed"),
            ({"output": "one\ntwo", "exit_code": 0}, "success", ""),
            ({"output": "a very long output string", "exit_code": 0}, "success", ""),
            ({"content": [{"type": "text", "text": "ready"}]}, "finished", "ready"),
            ({"stdout": "API_KEY=private", "exit_code": 0}, "success", ""),
            ({"is_error": True}, "failure", ""),
            ({"stdout": "done"}, "success", "done"),
            ({"output": "done", "metadata": {"exitCode": 0}}, "success", "done"),
            ({"output": "failed", "metadata": {"exit_code": 1}}, "failure", "failed"),
            ({"session_id": 42, "output": ""}, "running", ""),
            ("Process running with session ID 42", "running", ""),
            ("Process exited with code 0\nFinal output:\ndone", "success", "done"),
            ("Process exited with code 1\nFinal output:\nfailed", "failure", "failed"),
            (json.dumps({"stdout": "done", "exit_code": 0}), "success", "done"),
            ({"content": [{"type": "text", "text": json.dumps({"output": "done", "exit_code": 0})}]}, "success", "done"),
            ({"interrupted": True, "exit_code": 0}, "failure", ""),
        ]:
            with self.subTest(response=response):
                self.run_hook({"hook_event_name": "PreToolUse", "session_id": "s1", "turn_id": "t1",
                               "tool_use_id": "c1", "tool_name": "Bash", "tool_input": {"command": "npm run build"}})
                state = self.run_hook({"hook_event_name": "PostToolUse", "session_id": "s1", "turn_id": "t1",
                                       "tool_use_id": "c1", "tool_name": "Bash", "tool_response": response})
                expected = {"label": "npm run build", "status": status, "output": output, "callId": "c1"}
                if isinstance(response, dict) and response.get("session_id") is not None:
                    expected["sessionId"] = str(response["session_id"])
                self.assertEqual(state["commandPreview"], expected)
                if status != "failure":
                    self.assertEqual(state["after"], "running")

    def test_outer_tool_error_overrides_nested_success(self):
        self.run_hook({"hook_event_name": "PreToolUse", "session_id": "s1", "tool_use_id": "c1",
                       "tool_name": "Bash", "tool_input": {"command": "npm test"}})
        state = self.run_hook({"hook_event_name": "PostToolUse", "session_id": "s1", "tool_use_id": "c1",
                               "tool_name": "Bash", "tool_response": {"isError": True, "content": [{"type": "text", "text": json.dumps({"stdout": "12 passed", "exit_code": 0, "isError": False})}]}})
        self.assertEqual(state["commandPreview"]["status"], "failure")
        self.assertEqual(state["commandPreview"]["output"], "")

    def test_multiline_test_summaries_are_compact(self):
        examples = [
            ("test_file.py ............ [100%]\n===== 12 passed in 0.42s =====", 0, "12 passed"),
            ("console output\nTests:       12 passed, 12 total\nTime: 2.12 s", 0, "12 passed"),
            ("Test Files 2 passed (2)\nTests 20 passed (20)\nDuration 1.3s", 0, "20 passed"),
            ("ℹ tests 12\nℹ pass 12\nℹ fail 0\nℹ duration_ms 42.2", 0, "12 passed"),
            ("# tests 12\n# pass 11\n# fail 1\n# duration_ms 42.2", 1, "1 failed"),
            ("===== 1 failed, 11 passed in 0.42s =====", 1, "1 failed"),
            ("===== 12 passed, 2 skipped in 0.42s =====", 0, "12 passed"),
            ("ℹ tests 12\nℹ pass 12\nℹ fail 0", 1, ""),
            ("12 passed", 1, ""),
            ("TOKEN=secret\n===== 12 passed in 0.42s =====", 0, "12 passed"),
        ]
        for output, exit_code, expected in examples:
            with self.subTest(output=output):
                self.run_hook({"hook_event_name": "PreToolUse", "session_id": "s1", "tool_use_id": "c1",
                               "tool_name": "Bash", "tool_input": {"command": "npm test"}})
                state = self.run_hook({"hook_event_name": "PostToolUse", "session_id": "s1", "tool_use_id": "c1",
                                       "tool_name": "Bash", "tool_response": {"stdout": output, "exit_code": exit_code}})
                self.assertEqual(state["commandPreview"]["output"], expected)

    def test_active_command_survives_unrelated_tool_without_resetting_result_age(self):
        base = {"session_id": "s1", "turn_id": "t1"}
        start = self.run_hook({**base, "hook_event_name": "PreToolUse", "tool_use_id": "c1",
                               "tool_name": "Bash", "tool_input": {"command": "curl --version"}})
        read = self.run_hook({**base, "hook_event_name": "PreToolUse", "tool_use_id": "r1",
                              "tool_name": "Read", "tool_input": {"file_path": "README.md"}})
        self.assertEqual(read["commandPreview"], start["commandPreview"])
        done = self.run_hook({**base, "hook_event_name": "PostToolUse", "tool_use_id": "c1",
                              "tool_name": "Bash", "tool_response": {"exit_code": 0}})
        read = self.run_hook({**base, "hook_event_name": "PreToolUse", "tool_use_id": "r2",
                              "tool_name": "Read", "tool_input": {"file_path": "README.md"}})
        self.assertEqual(read["commandPreviewAt"], done["commandPreviewAt"])
        self.assertEqual(self.read("claude-sessions.json")["s1"]["commandPreviewAt"], done["commandPreviewAt"])

    def test_yielded_command_recovers_label_during_terminal_poll(self):
        base = {"session_id": "s1", "turn_id": "t1"}
        self.run_hook({**base, "hook_event_name": "PreToolUse", "tool_use_id": "c1",
                       "tool_name": "exec_command", "tool_input": {"cmd": "npm run build"}})
        state = self.run_hook({**base, "hook_event_name": "PostToolUse", "tool_use_id": "c1",
                               "tool_name": "exec_command", "tool_response": {"session_id": 42, "output": ""}})
        self.assertEqual(state["commandPreview"], {"label": "npm run build", "status": "running", "output": "", "callId": "c1", "sessionId": "42"})
        expected_running = dict(state["commandPreview"])
        for event_name in ("PreToolUse", "PostToolUse"):
            state = self.run_hook({**base, "hook_event_name": event_name, "tool_use_id": "read1",
                                   "tool_name": "Read", "tool_input": {"file_path": "README.md"},
                                   "tool_response": {"stdout": "file content", "exit_code": 0}})
            self.assertEqual(state["commandPreview"], expected_running)
        state = self.run_hook({**base, "hook_event_name": "PreToolUse", "tool_use_id": "c2",
                               "tool_name": "write_stdin", "tool_input": {"session_id": 42}})
        self.assertEqual(state["commandPreview"], {"label": "npm run build", "status": "running", "output": "", "callId": "c2", "sessionId": "42"})
        state = self.run_hook({**base, "hook_event_name": "PostToolUse", "tool_use_id": "c2",
                               "tool_name": "write_stdin", "tool_input": {"session_id": 42},
                               "tool_response": {"exit_code": 0, "output": "done"}})
        self.assertEqual(state["commandPreview"], {"label": "npm run build", "status": "success", "output": "done", "callId": "c2", "sessionId": "42"})

    def test_terminal_poll_without_matching_session_has_no_preview(self):
        for terminal_id in (43, "other"):
            self.run_hook({"hook_event_name": "PreToolUse", "session_id": "s1", "tool_use_id": "c1",
                           "tool_name": "exec_command", "tool_input": {"cmd": "npm run build"}})
            self.run_hook({"hook_event_name": "PostToolUse", "session_id": "s1", "tool_use_id": "c1",
                           "tool_name": "exec_command", "tool_response": {"session_id": 42}})
            state = self.run_hook({"hook_event_name": "PostToolUse", "session_id": "s1", "tool_use_id": "c1",
                                   "tool_name": "write_stdin", "tool_input": {"session_id": terminal_id},
                                   "tool_response": {"exit_code": 0}})
            self.assertIsNone(state["commandPreview"])

    def test_stop_preserves_completed_output(self):
        self.run_hook({"hook_event_name": "PreToolUse", "session_id": "s1", "tool_use_id": "c1",
                       "tool_name": "Bash", "tool_input": {"command": "npm run build"}})
        self.run_hook({"hook_event_name": "AfterTool", "session_id": "s1", "tool_use_id": "c1",
                       "tool_response": {"stdout": "done", "exit_code": 0}})
        expected = {"label": "npm run build", "status": "success", "output": "done", "callId": "c1"}
        for event_name in ("PreToolUse", "PostToolUse"):
            state = self.run_hook({"hook_event_name": event_name, "session_id": "s1", "tool_use_id": "read1",
                                   "tool_name": "Read", "tool_response": {"stdout": "unrelated", "exit_code": 1}})
            self.assertEqual(state["commandPreview"], expected)
        state = self.run_hook({"hook_event_name": "Stop", "session_id": "s1"})
        self.assertEqual(state["commandPreview"], {"label": "npm run build", "status": "success", "output": "done", "callId": "c1"})

    def test_preview_does_not_cross_call_or_session(self):
        for changed in ({"tool_use_id": "c2"}, {"session_id": "s2"}):
            self.run_hook({"hook_event_name": "PreToolUse", "session_id": "s1", "tool_use_id": "c1",
                           "tool_name": "Bash", "tool_input": {"command": "npm run build"}})
            state = self.run_hook({"hook_event_name": "AfterTool", "session_id": "s1", "tool_use_id": "c1",
                                   "tool_name": "Bash", "tool_response": {"exit_code": 0}, **changed})
            self.assertIsNone(state["commandPreview"])
            self.assertNotIn("after", state)

    def test_interrupt_and_failure_finish_current_preview(self):
        for event_name, status in (("Interrupt", "failure"), ("PostToolUseFailure", "failure")):
            self.run_hook({"hook_event_name": "PreToolUse", "session_id": "s1", "tool_use_id": "c1",
                           "tool_name": "Bash", "tool_input": {"command": "npm run build"}})
            state = self.run_hook({"hook_event_name": event_name, "session_id": "s1", "tool_use_id": "c1"})
            self.assertEqual(state["commandPreview"]["label"], "npm run build")
            self.assertEqual(state["commandPreview"]["status"], status)

    def test_mixed_up_models_file_does_not_break_the_hook(self):
        # 以前 claude-models.json 和 claude-sessions.json 共用一个临时文件，几个钩子同时写时会互相写错
        (self.state / "claude-models.json").write_text(json.dumps({"s1": {"pose": "running", "ts": 1}}))
        state = self.run_hook({"hook_event_name": "PreToolUse", "session_id": "s1", "tool_name": "Read"})
        self.assertEqual(state["pose"], "reading")

    def test_mixed_up_sessions_file_heals(self):
        (self.state / "claude-sessions.json").write_text(json.dumps({"old": "claude-opus-5"}))
        self.run_hook({"hook_event_name": "PreToolUse", "session_id": "s1", "tool_name": "Read"})
        self.assertEqual(set(self.read("claude-sessions.json")), {"s1"})

    def test_cursor_running_claude_hooks_writes_nothing(self):
        # Cursor 默认也跑 Claude Code 的钩子；Cursor 有自己的接入，这里什么都不写（心跳也不算 Claude 的）
        home = Path(self.temp.name) / "home"
        cursor = home / ".cursor"
        cursor.mkdir(parents=True)
        (cursor / "hooks.json").write_text(json.dumps({"hooks": {"postToolUse": [
            {"command": "python crosspet-cursor-bridge.py gpt"}]}}), encoding="utf-8")
        self.env.update(HOME=str(home), USERPROFILE=str(home))
        self.run_hook({"hook_event_name": "PreToolUse", "conversation_id": "c1", "generation_id": "g1",
                       "cursor_version": "2.0.0", "tool_name": "Shell", "model": "gpt-5"})
        self.assertEqual(sorted(p.name for p in self.state.iterdir()), [])

    def test_session_start_after_compaction_keeps_working(self):
        self.run_hook({"hook_event_name": "UserPromptSubmit", "session_id": "s1"})
        self.run_hook({"hook_event_name": "PreToolUse", "session_id": "s1", "tool_name": "Edit"})
        state = self.run_hook({"hook_event_name": "SessionStart", "session_id": "s1", "source": "compact"})
        self.assertEqual((state["event"], state["pose"]), ("PreToolUse", "writing"))
        state = self.run_hook({"hook_event_name": "SessionStart", "session_id": "s2", "source": "startup"})
        self.assertEqual(state["pose"], "idle")

    def test_launch_events_follow_the_data_dir(self):
        # 临时运行目录里关掉了「AI 开始工作时自动出现」：钩子照它办，不去打开真的桌宠（macOS 上以前看的是真的设置）
        self.run_hook({"hook_event_name": "UserPromptSubmit", "session_id": "s1"})
        self.assertIn("不打开", (self.state / "autostart.txt").read_text(encoding="utf-8-sig"))

    @unittest.skipUnless(os.name == "nt", "Windows file-sharing semantics")
    def test_transient_state_reader_does_not_fail_the_observer(self):
        # The native UI may hold the previous state open while a hook replaces it.
        path = self.state / "gpt-state.json"
        path.write_text('{"pose":"idle"}', encoding="utf-8")
        reader = path.open("rb")
        p = subprocess.Popen([sys.executable, str(HOOK), "gpt"], stdin=subprocess.PIPE,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=self.env)
        try:
            p.stdin.write(json.dumps({"hook_event_name": "PreToolUse", "session_id": "s1",
                                      "turn_id": "t1", "tool_name": "Read"}).encode("utf-8"))
            p.stdin.flush()
            deadline = time.monotonic() + 5
            while p.poll() is None and not list(self.state.glob(".gpt-state.*.json")) and time.monotonic() < deadline:
                time.sleep(.001)
            time.sleep(.01)
            reader.close()
            _, stderr = p.communicate(timeout=5)
            self.assertEqual((p.returncode, stderr.decode("utf-8", errors="replace")), (0, ""))
            self.assertEqual(self.read("gpt-state.json")["pose"], "reading")
        finally:
            reader.close()
            if p.poll() is None:
                p.kill()
                p.communicate()


if __name__ == "__main__":
    unittest.main()
