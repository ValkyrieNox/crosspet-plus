// SPDX-License-Identifier: AGPL-3.0-only
import Cocoa
import WebKit

extension App {
    var isPlus: Bool { Bundle.main.object(forInfoDictionaryKey: "CrossPetPlusService") as? Bool == true }
    var plusStateDir: URL { root.appendingPathComponent("plus-runtime", isDirectory: true) }
    var plusExecutable: URL {
        Bundle.main.bundleURL.appendingPathComponent("Contents/Helpers/CrossPet Plus.app/Contents/MacOS/CrossPet Plus")
    }

    func nativeSessions(_ id: String) -> [String: Any] {
        guard let data = try? Data(contentsOf: stateDir.appendingPathComponent("\(id)-sessions.json")),
              let value = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return [:] }
        return value
    }
    func nativeClawdState(_ id: String, client: String? = nil) -> [String: Any]? {
        let name = client.map { "\(id)@\($0)-state.json" } ?? "\(id)-state.json"
        let file = stateDir.appendingPathComponent(name)
        guard let data = try? Data(contentsOf: file), data.count <= 2_000_000,
              let value = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let ts = ClawdSnapshot.number(value["ts"]), abs(Date().timeIntervalSince1970 - ts) < 600 else { return nil }
        return value
    }
    func mergedClawdSessions(_ id: String, _ text: String) -> String {
        guard isPlus else { return text }
        let native = text.data(using: .utf8).flatMap { (try? JSONSerialization.jsonObject(with: $0)) as? [String: Any] } ?? [:]
        return ClawdSnapshot.json(clawdPresentation.sessions(for: id, native: native))
    }

    func pollClawdService() {
        guard isPlus else { return }
        let now = Date().timeIntervalSince1970
        let previousCharacters = clawdPresentation.characters
        let next = clawdBridge.poll(now: now)
        clawdPresentation.update(next)

        // Drop only bridge-owned cache values. Native observations must survive backend loss.
        let currentClients = Set((next?.sessions ?? []).compactMap { e -> String? in
            guard let id = e["character"] as? String, let client = e["client"] as? String else { return nil }
            return "\(id)@\(client)"
        })
        var removedActor = false
        for (renderKey, entry) in clawdRenderedStates where !currentClients.contains(renderKey) || entry["_crosspetPlus"] as? String != next?.instance {
            guard let id = entry["character"] as? String, let client = entry["client"] as? String else { continue }
            let text = ClawdSnapshot.json(entry), key = "\(id)@\(client)"
            let removedClient = clientStates[key]?.text == text
            let removedCharacter = charStates[id]?.text == text
            if removedClient {
                clientStates.removeValue(forKey: key)
                stamps.removeValue(forKey: "\(key)-state")
                if !clientStates.keys.contains(where: { $0.hasPrefix(id + "@") }) { clientStateSeen.remove(id) }
            }
            if removedCharacter {
                charStates.removeValue(forKey: id)
                stamps.removeValue(forKey: "\(id)-state")
            }
            if lastPose[id]?.at.timeIntervalSince1970 == ClawdSnapshot.number(entry["ts"]) { lastPose.removeValue(forKey: id) }
            let keepClientMode = clientStates.contains { $0.key.hasPrefix(id + "@") && Date().timeIntervalSince($0.value.at) < 600 }
            let instance = entry["_crosspetPlus"] as? String ?? ""
            let clear = "clearClawdState(\(quote(id)), \(quote(client)), \(quote(instance)), \(keepClientMode))"
            js(clear)
            for c in companions.values where c.character == id {
                c.js(clear)
                if (removedClient || removedCharacter), c.lastPose?.at.timeIntervalSince1970 == ClawdSnapshot.number(entry["ts"]) { c.lastPose = nil }
            }
            clawdRenderedStates.removeValue(forKey: renderKey)
            removedActor = true
        }
        if removedActor { clawdPresentation.resetPlayback() }

        let signature = (next?.instance ?? "") + ClawdSnapshot.json(next?.sessions ?? []) + String(pauseRealEvents)
        if signature != clawdSessionSignature {
            clawdSessionSignature = signature
            for id in previousCharacters.union(clawdPresentation.characters) where id == "current" || characterIds.contains(id) {
                let text = ClawdSnapshot.json(clawdPresentation.sessions(for: id, native: nativeSessions(id)))
                if !pauseRealEvents { js("setSessions(\(quote(id)), \(text))") }
                noteSessions(id, text)
            }
        }
        var latest: (id: String, at: Double)?
        for raw in clawdPresentation.events(paused: pauseRealEvents, now: now, native: { self.nativeSessions($0) },
                                            current: { self.nativeClawdState($0, client: $1) }) {
            var entry = raw
            entry["_crosspetPlus"] = next?.instance
            guard let id = entry["character"] as? String, id == "current" || characterIds.contains(id),
                  let client = entry["client"] as? String, let ts = ClawdSnapshot.number(entry["ts"]) else { continue }
            let text = ClawdSnapshot.json(entry), pose = entry["pose"] as? String ?? "idle"
            let stamp = Date(timeIntervalSince1970: ts)
            let playCharacter = clawdPresentation.characterEventIsCurrent(entry, native: nativeSessions(id), current: nativeClawdState(id))
            if playCharacter {
                lastPose[id] = (pose, stamp)
                js("applyCharState(\(quote(id)), \(text))")
                notePet(id, entry, "played", "plus")
            }
            clawdRenderedStates["\(id)@\(client)"] = entry
            if id != "current" {
                if playCharacter { noteCharState(id, text, stamp) }
                clientStateSeen.insert(id)
                clientStates["\(id)@\(client)"] = (text, stamp)
                if companionsForwarding {
                    js("applyClientState(\(quote(id)), \(quote(client)), \(text))")
                    for c in companions.values where c.key == "\(id)@\(client)" { c.applyState(text, at: stamp) }
                }
                if playCharacter, pose != "idle", pose != "sleeping", (now - ts) < 30, ts > (latest?.at ?? 0) { latest = (id, ts) }
            }
        }
        if let latest { followEvent(latest.id) }
        if next != nil, Date().timeIntervalSince(clawdAnchorAt) >= 1, let frame = panel?.frame, let screen = NSScreen.screens.first {
            clawdAnchorAt = Date()
            clawdBridge.sendAnchor(ClawdSnapshot.electronBounds(frame, primaryTop: screen.frame.maxY))
        }
    }

    func openClawd(_ action: String) {
        guard isPlus else { return }
        if !clawdBridge.request(action) {
            let alert = NSAlert()
            alert.messageText = "Plus 任务后台暂时不可用"
            alert.informativeText = clawdBridge.failure ?? "请稍后重试。"
            NSApp.activate(ignoringOtherApps: true)
            alert.runModal()
        }
    }
    @objc func openClawdDashboard() { openClawd("dashboard") }
    @objc func openClawdApprovals() { openClawd("approvals") }
    @objc func openClawdAgents() { openClawd("agents") }
    @objc func openClawdConnections() { openClawd("connections") }
    @objc func openClawdSettings() { openClawd("settings") }
    @objc func toggleClawdDoNotDisturb() {
        openClawd(clawdPresentation.snapshot?.doNotDisturb == true ? "resume-tasks" : "pause-tasks")
    }
}
