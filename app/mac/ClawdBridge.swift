// SPDX-License-Identifier: AGPL-3.0-only
import Foundation
import CoreFoundation
import CoreGraphics
import Darwin

enum PlusDistribution {
    static func importPreferences(original: [String: Any], current: [String: Any]) -> [String: Any] {
        original.merging(current) { _, existing in existing }
    }
    static func assetName(tag: String, arch: String) -> String? {
        guard ["arm64", "x64"].contains(arch) else { return nil }
        let version = tag.hasPrefix("v") ? String(tag.dropFirst()) : tag
        guard !version.isEmpty, version.range(of: "^[0-9A-Za-z.+-]+$", options: .regularExpression) != nil else { return nil }
        return "CrossPet-Plus-\(version)-macOS-\(arch).zip"
    }
}

/// The wire format is shared with desktop/src/crosspet-service.js.
/// Keep this module independent of AppKit so protocol/lifecycle tests run without a GUI.
struct ClawdSnapshot {
    let instance: String
    let pid: Int
    let revision: Int
    let pendingCount: Int
    let doNotDisturb: Bool
    let sessions: [[String: Any]]

    static func number(_ value: Any?) -> Double? {
        guard let n = value as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(), n.doubleValue.isFinite else { return nil }
        return n.doubleValue
    }
    static func integer(_ value: Any?) -> Int? {
        guard let n = number(value), n.rounded() == n, n >= 0, n < Double(Int.max) else { return nil }
        return Int(n)
    }
    static func parse(_ data: Data, now: Double, hostPid: Int) -> ClawdSnapshot? {
        guard data.count <= 2_000_000,
              let d = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              integer(d["schemaVersion"]) == 1, integer(d["hostPid"]) == hostPid,
              let at = number(d["at"]), abs(now - at) <= 8,
              let pid = integer(d["pid"]), pid > 0,
              let revision = integer(d["revision"]), let pending = integer(d["pendingCount"]),
              let instance = d["instance"] as? String, (8...80).contains(instance.count),
              instance.range(of: "^[a-z0-9]+$", options: .regularExpression) != nil,
              let rows = d["sessions"] as? [[String: Any]], rows.count <= 2000 else { return nil }
        let valid = rows.filter {
            guard let key = $0["key"] as? String, !key.isEmpty, key.count <= 1024,
                  let character = $0["character"] as? String, !character.isEmpty, character.count <= 128,
                  let client = $0["client"] as? String, !client.isEmpty, client.count <= 128,
                  let pose = $0["pose"] as? String, !pose.isEmpty, pose.count <= 128,
                  let ts = number($0["ts"]), now - ts < 600, ts <= now + 8 else { return false }
            return true
        }
        let interface = d["interface"] as? [String: Any]
        return ClawdSnapshot(instance: instance, pid: pid, revision: revision, pendingCount: pending,
                             doNotDisturb: interface?["doNotDisturb"] as? Bool ?? false, sessions: valid)
    }
    static func electronBounds(_ frame: CGRect, primaryTop: CGFloat) -> [String: Double] {
        ["x": Double(frame.minX), "y": Double(primaryTop - frame.maxY), "width": Double(frame.width), "height": Double(frame.height)]
    }
    static func json(_ value: Any) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]),
              let text = String(data: data, encoding: .utf8) else { return "{}" }
        return text
    }
}

final class ClawdPresentation {
    private(set) var snapshot: ClawdSnapshot?
    private var played: [String: String] = [:]
    var characters: Set<String> { Set(snapshot?.sessions.compactMap { $0["character"] as? String } ?? []) }
    func resetPlayback() { played.removeAll() }

    func update(_ next: ClawdSnapshot?) {
        if snapshot?.instance != next?.instance { played.removeAll() }
        snapshot = next
        let keys = Set(next?.sessions.map { replayKey($0) } ?? [])
        played = played.filter { keys.contains($0.key) }
    }
    private func replayKey(_ e: [String: Any]) -> String {
        ClawdSnapshot.json([e["character"] as? String ?? "", e["client"] as? String ?? ""])
    }
    func sessions(for character: String, native: [String: Any]) -> [String: Any] {
        var merged = native
        for e in snapshot?.sessions ?? [] where e["character"] as? String == character {
            guard let key = e["key"] as? String else { continue }
            if var old = merged[key] as? [String: Any],
               (ClawdSnapshot.number(old["ts"]) ?? 0) >= (ClawdSnapshot.number(e["ts"]) ?? 0) - 2 {
                let pose = old["pose"] as? String ?? ""
                let event = old["event"] as? String ?? ""
                if (ClawdSnapshot.number(e["subagents"]) ?? 0) > 0,
                   !["Stop", "SessionEnd"].contains(event),
                   !["asking", "idle", "sleeping", "happy", "proud"].contains(pose) {
                    old["subagents"] = e["subagents"]; merged[key] = old
                }
            } else { merged[key] = e }
        }
        return merged
    }
    func nativeIsCurrent(character: String, client: String? = nil, state: [String: Any], now: Double) -> Bool {
        let ts = ClawdSnapshot.number(state["ts"]) ?? 0
        return !(snapshot?.sessions.contains {
            $0["character"] as? String == character && (client == nil || $0["client"] as? String == client) &&
            (ClawdSnapshot.number($0["ts"]) ?? 0) > ts + 2 && now - (ClawdSnapshot.number($0["ts"]) ?? 0) < 600
        } ?? false)
    }
    func characterEventIsCurrent(_ e: [String: Any], native: [String: Any], current: [String: Any]?) -> Bool {
        let ts = ClawdSnapshot.number(e["ts"]) ?? 0
        if (snapshot?.sessions ?? []).contains(where: {
            $0["character"] as? String == e["character"] as? String && (ClawdSnapshot.number($0["ts"]) ?? 0) > ts
        }) { return false }
        let observations = native.values.compactMap { $0 as? [String: Any] } + (current.map { [$0] } ?? [])
        return !observations.contains { (ClawdSnapshot.number($0["ts"]) ?? 0) >= ts - 2 }
    }
    func events(paused: Bool, now: Double, native: (String) -> [String: Any],
                current: (String, String) -> [String: Any]? = { _, _ in nil }) -> [[String: Any]] {
        guard !paused else { resetPlayback(); return [] }
        var winners: [String: [String: Any]] = [:]
        for e in snapshot?.sessions ?? [] {
            let key = replayKey(e)
            if let old = winners[key] {
                let oldTS = ClawdSnapshot.number(old["ts"]) ?? 0, newTS = ClawdSnapshot.number(e["ts"]) ?? 0
                if oldTS > newTS || (oldTS == newTS && (old["key"] as? String ?? "") <= (e["key"] as? String ?? "")) { continue }
            }
            winners[key] = e
        }
        return winners.values.sorted { (ClawdSnapshot.number($0["ts"]) ?? 0) < (ClawdSnapshot.number($1["ts"]) ?? 0) }.filter { e in
            guard let id = e["character"] as? String, let key = e["key"] as? String, let client = e["client"] as? String,
                  let ts = ClawdSnapshot.number(e["ts"]), now - ts < 600 else { return false }
            let signature = ClawdSnapshot.json(e), replay = replayKey(e)
            guard played[replay] != signature else { return false }
            let observations = native(id)
            if let old = observations[key] as? [String: Any], (ClawdSnapshot.number(old["ts"]) ?? 0) >= ts - 2 { return false }
            let clientRows = observations.values.compactMap { $0 as? [String: Any] }.filter { $0["client"] as? String == client }
                + (current(id, client).map { [$0] } ?? [])
            if clientRows.contains(where: { (ClawdSnapshot.number($0["ts"]) ?? 0) >= ts - 2 }) { return false }
            played[replay] = signature
            return true
        }
    }
}

/// A lock file must remain on disk: unlinking it would let a third process lock another inode.
final class PlusHostLock {
    private let fd: Int32
    let acquired: Bool
    init(directory: URL) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        fd = Darwin.open(directory.appendingPathComponent("host.lock").path, O_CREAT | O_RDWR | O_CLOEXEC, 0o600)
        guard fd >= 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
        acquired = flock(fd, LOCK_EX | LOCK_NB) == 0
    }
    deinit { Darwin.close(fd) }
}

final class ClawdBridge {
    let directory: URL
    let executable: URL
    let arguments: [String]
    private let hostPid = Int(ProcessInfo.processInfo.processIdentifier)
    private var child: Process?
    private var launchedAt = -Double.infinity
    private var stopping = false
    private var recoveringAt: Double?
    private var consecutiveFailures = 0
    private var queue: [String] = []
    private(set) var failure: String?
    private(set) var snapshot: ClawdSnapshot?
    private let log: (String) -> Void
    private var commands: URL { directory.appendingPathComponent("clawd-commands", isDirectory: true) }

    init(directory: URL, executable: URL, arguments: [String] = [], log: @escaping (String) -> Void = { _ in }) {
        self.directory = directory; self.executable = executable; self.arguments = arguments; self.log = log
    }
    private func fail(_ message: String) {
        if failure != message { log(message) }
        failure = message
    }
    private func read(now: Double) -> ClawdSnapshot? {
        let file = directory.appendingPathComponent("clawd-snapshot.json")
        guard let size = (try? file.resourceValues(forKeys: [.fileSizeKey]))?.fileSize, size <= 2_000_000,
              let data = try? Data(contentsOf: file) else { return nil }
        return ClawdSnapshot.parse(data, now: now, hostPid: hostPid)
    }
    private func ensure(now: Double) {
        guard !stopping, failure == nil, snapshot == nil, child?.isRunning != true, now - launchedAt >= 30 else { return }
        launchedAt = now
        guard FileManager.default.isExecutableFile(atPath: executable.path) else { fail("找不到 Plus 任务后台，请重新构建或下载完整的 Mac Plus 安装包。"); return }
        do {
            try FileManager.default.createDirectory(at: commands, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            let process = Process()
            process.executableURL = executable
            process.arguments = arguments + ["--crosspet-service"]
            process.currentDirectoryURL = executable.deletingLastPathComponent()
            var env = ProcessInfo.processInfo.environment
            env.removeValue(forKey: "ELECTRON_RUN_AS_NODE")
            env["CROSSPET_STATE_DIR"] = directory.path
            env["CROSSPET_HOST_PID"] = String(hostPid)
            // Finder launches have a minimal PATH; the backend's existing Node discovery still applies.
            env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:" + (env["PATH"] ?? "/usr/bin:/bin:/usr/sbin:/sbin")
            process.environment = env
            let logfile = directory.appendingPathComponent("backend.log")
            if !FileManager.default.fileExists(atPath: logfile.path) { FileManager.default.createFile(atPath: logfile.path, contents: nil) }
            let handle = try FileHandle(forWritingTo: logfile)
            try handle.seekToEnd()
            process.standardOutput = handle; process.standardError = handle
            defer { try? handle.close() }
            try process.run()
            child = process
        } catch { fail("Plus 后台启动失败：\(error.localizedDescription)") }
    }
    @discardableResult func request(_ action: String) -> Bool {
        guard ["dashboard", "approvals", "agents", "connections", "settings", "pause-tasks", "resume-tasks"].contains(action), !stopping else { return false }
        if failure != nil {
            consecutiveFailures = 0
            if child?.isRunning == true {
                child?.terminate() // Only the exact process created by this bridge, never a standalone Clawd.
                recoveringAt = Date().timeIntervalSince1970
            } else { child = nil; launchedAt = -Double.infinity }
            failure = nil
        }
        if queue.count < 8, !queue.contains(action) { queue.append(action) }
        _ = poll()
        return failure == nil
    }
    func poll(now: Double = Date().timeIntervalSince1970) -> ClawdSnapshot? {
        guard !stopping else { return nil }
        if let recoveringAt {
            if let child, child.isRunning {
                if now - recoveringAt > 3 { Darwin.kill(child.processIdentifier, SIGKILL) }
                return nil
            }
            self.recoveringAt = nil; child = nil; launchedAt = -Double.infinity; snapshot = nil
        }
        snapshot = read(now: now)
        if snapshot == nil, let child, !child.isRunning, now - launchedAt > 0.25 {
            if failure == nil {
                consecutiveFailures += 1
                fail("Plus 后台已退出。若独立 Clawd 已在运行，请先退出它，再从桌宠菜单重试。日志：\(directory.appendingPathComponent("backend.log").path)")
            }
            if now - launchedAt >= 30, consecutiveFailures < 3 { self.child = nil; failure = nil }
        }
        if snapshot == nil, child?.isRunning == true, now - launchedAt > 30 {
            fail("Plus 后台启动超时，请查看 \(directory.appendingPathComponent("backend.log").path)。")
        }
        ensure(now: now)
        if snapshot != nil {
            failure = nil; consecutiveFailures = 0
            let pending = queue
            queue.removeAll()
            for action in pending { send(action, now: now) }
        }
        return snapshot
    }
    func sendAnchor(_ bounds: [String: Double]) { send("anchor", bounds: bounds) }
    private func send(_ action: String, bounds: [String: Double]? = nil, now: Double = Date().timeIntervalSince1970) {
        guard let snapshot = read(now: now) else { return }
        var request: [String: Any] = ["instance": snapshot.instance, "at": now, "action": action]
        if let bounds { request["bounds"] = bounds }
        do {
            let data = try JSONSerialization.data(withJSONObject: request)
            let file = commands.appendingPathComponent(UUID().uuidString.lowercased() + ".json")
            try data.write(to: file, options: .atomic)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
        } catch { fail("无法写入 Plus 后台命令：\(error.localizedDescription)") }
    }
    func stop() {
        guard !stopping else { return }
        send("quit")
        stopping = true; queue.removeAll()
        // The service also watches the host PID. If it has not published yet, terminate only our child.
        if snapshot == nil, child?.isRunning == true { child?.terminate() }
    }
}
