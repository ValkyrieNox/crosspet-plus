import Foundation

func check(_ value: @autoclosure () -> Bool, _ message: String) {
    guard value() else { fatalError(message) }
}

@main struct MacPlusTests {
    static func main() throws {
        let pid = Int(ProcessInfo.processInfo.processIdentifier)
        let now = Date().timeIntervalSince1970
        func entry(_ key: String = "local", _ ts: Double? = nil, _ extras: [String: Any] = [:]) -> [String: Any] {
            var e: [String: Any] = ["key": key, "character": "gpt", "client": "codex", "pose": "writing", "event": "Tool", "ts": ts ?? now, "subagents": 2]
            e.merge(extras) { _, n in n }; return e
        }
        func snapshot(_ changes: [String: Any] = [:]) -> ClawdSnapshot? {
            var data: [String: Any] = ["schemaVersion": 1, "hostPid": pid, "pid": pid, "instance": "abcdef12345678", "at": now, "revision": 1, "pendingCount": 2, "sessions": [entry()]]
            data.merge(changes) { _, n in n }
            return ClawdSnapshot.parse(try! JSONSerialization.data(withJSONObject: data), now: now, hostPid: pid)
        }
        check(snapshot() != nil, "valid snapshot")
        check(snapshot()?.doNotDisturb == false, "older snapshots default task do-not-disturb to off")
        check(snapshot(["interface": ["doNotDisturb": true]])?.doNotDisturb == true, "native menu receives upstream task do-not-disturb state")
        check(snapshot(["schemaVersion": 2]) == nil, "unknown schema")
        check(snapshot(["hostPid": pid + 1]) == nil, "foreign host")
        check(snapshot(["hostPid": true]) == nil, "boolean is not pid")
        check(snapshot(["at": now - 9]) == nil, "stale heartbeat")
        check(snapshot(["at": now + 20]) == nil, "future heartbeat")
        check(snapshot(["sessions": "bad"]) == nil, "invalid sessions")
        let model = ClawdPresentation()
        model.update(snapshot())
        let native: [String: Any] = ["local": entry("local", now + 1, ["pose": "reading", "subagents": 0])]
        let merged = model.sessions(for: "gpt", native: native)
        check(merged.count == 1, "deduplicate native and Plus")
        check((merged["local"] as? [String: Any])?["pose"] as? String == "reading", "new native pose wins")
        check((merged["local"] as? [String: Any])?["subagents"] as? Int == 2, "retain live child count")
        let stopped = model.sessions(for: "gpt", native: ["local": entry("local", now + 1, ["pose": "happy", "event": "Stop", "subagents": 0])])
        check((stopped["local"] as? [String: Any])?["subagents"] as? Int == 0, "completed native event has no children")
        check(model.events(paused: true, now: now, native: { _ in [:] }).isEmpty, "pause suppresses events")
        check(model.events(paused: false, now: now, native: { _ in [:] }).count == 1, "resume plays latest event")
        check(model.events(paused: false, now: now, native: { _ in [:] }).isEmpty, "no repeated playback")
        _ = model.events(paused: true, now: now, native: { _ in [:] })
        check(model.events(paused: false, now: now, native: { _ in [:] }).count == 1, "pause after playback must restore the active state")
        model.resetPlayback()
        check(model.events(paused: false, now: now, native: { _ in [:] }).count == 1, "page reload must restore current state")
        model.update(snapshot(["instance": "bbbbbbbb12345678"]))
        check(model.events(paused: false, now: now, native: { _ in native }).isEmpty, "do not replay over newer native event")
        check(model.nativeIsCurrent(character: "gpt", client: "codex", state: entry("old", now - 10), now: now) == false, "older native file cannot overwrite new Plus event")
        model.update(snapshot(["sessions": [entry(), entry("clawd:remote")]]))
        check(model.sessions(for: "gpt", native: native).count == 2, "remote session remains distinct")
        model.update(nil)
        check(model.sessions(for: "gpt", native: native).count == 1, "heartbeat loss restores native only")
        check(model.characters.isEmpty, "no stale character cache")
        model.update(snapshot(["sessions": [entry("old", now - 20)]]))
        check(model.events(paused: false, now: now, native: { _ in ["new": entry("new", now - 5)] }).isEmpty, "newer native session wins over older remote session on same client")
        model.update(snapshot(["sessions": [entry("old", now - 20), entry("new", now - 5)]]))
        check(model.events(paused: false, now: now, native: { _ in [:] }).count == 1, "only latest client event plays")
        model.update(snapshot(["sessions": [entry("old", now - 20, ["pose": "asking"]), entry("new", now - 5)]]))
        check(model.events(paused: false, now: now, native: { _ in [:] }).isEmpty, "changed older session cannot overwrite unchanged newest session")
        check(!model.characterEventIsCurrent(entry("old", now - 20), native: [:], current: nil), "older client cannot override latest character event")
        check(!model.characterEventIsCurrent(entry("new", now - 5), native: [:], current: entry("legacy", now)), "latest native character file wins even without native sessions")
        model.resetPlayback()
        check(model.events(paused: false, now: now, native: { _ in [:] }, current: { _, _ in entry("legacy-client", now) }).isEmpty, "latest native client file wins without a sessions file")
        let bounds = ClawdSnapshot.electronBounds(CGRect(x: -300, y: 1100, width: 200, height: 300), primaryTop: 1080)
        check(bounds["x"] == -300 && bounds["y"] == -320, "secondary screen negative coordinates in logical points")
        check(PlusDistribution.assetName(tag: "v1.3.10-plus.4", arch: "arm64") == "CrossPet-Plus-1.3.10-plus.4-macOS-arm64.zip", "Plus updates require architecture-specific combined archive")
        check(PlusDistribution.assetName(tag: "v1.3.10-plus.4", arch: "universal") == nil, "unknown update architecture is rejected")
        let preferences = PlusDistribution.importPreferences(original: ["character": "gpt", "petScale": 0.8], current: ["character": "claude"])
        check(preferences["character"] as? String == "claude" && preferences["petScale"] as? Double == 0.8, "import original native settings without overwriting Plus choices")

        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("crosspet-plus-test-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let lock1 = try PlusHostLock(directory: dir)
        check(lock1.acquired, "first host owns lock")
        let lock2 = try PlusHostLock(directory: dir)
        check(!lock2.acquired, "second host excluded")

        let fixture = dir.appendingPathComponent("backend.sh")
        try """
        #!/bin/sh
        printf '{"schemaVersion":1,"hostPid":%s,"pid":%s,"instance":"abcdef12345678","at":%s,"revision":1,"pendingCount":0,"sessions":[]}' "$CROSSPET_HOST_PID" "$$" "$(date +%s)" > "$CROSSPET_STATE_DIR/clawd-snapshot.json"
        exec sleep 2
        """.write(to: fixture, atomically: true, encoding: .utf8)
        let bridge = ClawdBridge(directory: dir, executable: URL(fileURLWithPath: "/bin/sh"), arguments: [fixture.path])
        check(!bridge.request("allow"), "approval decisions are not bridge commands")
        check(bridge.request("dashboard"), "initial menu click queued")
        var received: ClawdSnapshot?
        for _ in 0..<60 {
            received = bridge.poll()
            if received != nil { break }
            Thread.sleep(forTimeInterval: 0.05)
        }
        check(received != nil, "backend launched with owned heartbeat")
        let commands = try FileManager.default.contentsOfDirectory(at: dir.appendingPathComponent("clawd-commands"), includingPropertiesForKeys: nil)
        check(commands.count == 1, "queued first click delivered exactly once")
        let command = try JSONSerialization.jsonObject(with: Data(contentsOf: commands[0])) as! [String: Any]
        check(command["action"] as? String == "dashboard", "correct action")
        check(command["instance"] as? String == "abcdef12345678", "current service instance")
        check(bridge.request("settings"), "task settings remain accessible from the native menu")
        check(bridge.request("pause-tasks"), "native task do-not-disturb can be enabled")
        check(bridge.request("resume-tasks"), "native task do-not-disturb can be disabled")
        bridge.stop()
        let afterStop = try FileManager.default.contentsOfDirectory(at: dir.appendingPathComponent("clawd-commands"), includingPropertiesForKeys: nil)
        check(afterStop.count == 5, "settings, task controls and quit sent to owned backend")
        let failed = ClawdBridge(directory: dir.appendingPathComponent("missing"), executable: URL(fileURLWithPath: "/does-not-exist"))
        _ = failed.request("agents")
        check(failed.failure != nil, "missing runtime reports failure")
        let retryDir = dir.appendingPathComponent("retry")
        let exitFixture = dir.appendingPathComponent("exit.sh")
        try "exit 0\n".write(to: exitFixture, atomically: true, encoding: .utf8)
        let retry = ClawdBridge(directory: retryDir, executable: URL(fileURLWithPath: "/bin/sh"), arguments: [exitFixture.path])
        _ = retry.poll(now: now)
        Thread.sleep(forTimeInterval: 0.1)
        _ = retry.poll(now: now + 1)
        check(retry.failure != nil, "backend exit is reported")
        try "printf '%s' \"$CROSSPET_HOST_PID\" > \"$CROSSPET_STATE_DIR/restarted\"\nexec sleep 2\n".write(to: exitFixture, atomically: true, encoding: .utf8)
        _ = retry.poll(now: now + 31)
        Thread.sleep(forTimeInterval: 0.1)
        check(FileManager.default.fileExists(atPath: retryDir.appendingPathComponent("restarted").path), "exited owned child restarts with backoff")
        _ = retry.poll(now: now + 65)
        check(retry.failure != nil, "stalled heartbeat detected")
        try FileManager.default.removeItem(at: retryDir.appendingPathComponent("restarted"))
        check(retry.request("agents"), "manual retry can recover an owned child with no heartbeat")
        for _ in 0..<60 {
            _ = retry.poll()
            if FileManager.default.fileExists(atPath: retryDir.appendingPathComponent("restarted").path) { break }
            Thread.sleep(forTimeInterval: 0.05)
        }
        check(FileManager.default.fileExists(atPath: retryDir.appendingPathComponent("restarted").path), "manual retry actually relaunches the owned child")
        retry.stop()
        print("PASS macOS Plus snapshot, merge, pause/restart, coordinates, host lock, startup queue and cleanup")
    }
}
