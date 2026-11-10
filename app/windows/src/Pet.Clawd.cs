// SPDX-License-Identifier: AGPL-3.0-only
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;

namespace CrossPet
{
    // Keep the native CrossPet host, web renderer and all original behaviours.
    // Clawd supplies an additional task feed and its existing approval/SSH UI.
    sealed partial class Pet
    {
        Dictionary<string, Dictionary<string, object>> clawdSessions = new Dictionary<string, Dictionary<string, object>>();
        readonly Dictionary<string, string> clawdPlayed = new Dictionary<string, string>();
        string clawdRevision, clawdInstance;
        DateTime clawdLaunchAt, clawdAnchorAt;
        int clawdPending;
        bool clawdDoNotDisturb;
        readonly HashSet<string> clawdDeferredActions = new HashSet<string>();
        bool clawdStopping;
        string ClawdSnapshot => Path.Combine(Store.State, "clawd-snapshot.json");
        string ClawdExe => Path.Combine(Store.Install, "runtime", "CrossPet Plus.exe");
        static double Number(Dictionary<string, object> value, string key) =>
            value.TryGetValue(key, out var x) && x != null ? Convert.ToDouble(x) : 0;

        void EnsureClawdService()
        {
            if (clawdStopping || !File.Exists(ClawdExe) || (DateTime.UtcNow - clawdLaunchAt).TotalSeconds < 30) return;
            var status = Store.ReadJson(ClawdSnapshot);
            if (status != null && Math.Abs(DateTimeOffset.UtcNow.ToUnixTimeSeconds() - Number(status,"at")) < 8) return;
            clawdLaunchAt = DateTime.UtcNow;
            try
            {
                var start = new ProcessStartInfo(ClawdExe, "--crosspet-service")
                    { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = Path.GetDirectoryName(ClawdExe) };
                start.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
                start.EnvironmentVariables["CROSSPET_STATE_DIR"] = Store.State;
                start.EnvironmentVariables["CROSSPET_HOST_PID"] = Process.GetCurrentProcess().Id.ToString();
                Process.Start(start);
            }
            catch (Exception e) { Store.Log("任务后台启动失败: " + e.Message); }
        }

        void ClawdCommand(string action, Dictionary<string, object> bounds = null)
        {
            EnsureClawdService();
            var snapshot = Store.ReadJson(ClawdSnapshot);
            if (snapshot == null || !snapshot.TryGetValue("instance", out var instance) ||
                Math.Abs(DateTimeOffset.UtcNow.ToUnixTimeSeconds() - Number(snapshot,"at")) > 8) {
                if (!clawdStopping && bounds == null) clawdDeferredActions.Add(action);
                return;
            }
            var request = new Dictionary<string, object> {
                ["instance"] = instance, ["at"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds(), ["action"] = action
            };
            if (bounds != null) request["bounds"] = bounds;
            Store.WriteJson(Path.Combine(Store.State, "clawd-commands", Guid.NewGuid().ToString("N") + ".json"), request);
        }

        public void OpenTaskSettings() => ClawdCommand("settings");

        // Both sources use the agent's raw session id locally, so adding the
        // Clawd integration cannot turn one local conversation into two tasks.
        Dictionary<string, object> MergeClawdSessions(string id, Dictionary<string, object> native)
        {
            var merged = new Dictionary<string, object>(native ?? new Dictionary<string, object>());
            if (clawdSessions.TryGetValue(id, out var extra))
                foreach (var pair in extra)
                {
                    if (merged.TryGetValue(pair.Key, out var prior) && prior is Dictionary<string, object> old &&
                        pair.Value is Dictionary<string, object> incoming && Number(old,"ts") >= Number(incoming,"ts") - 2) {
                        // Keep the native pose/event, but retain the trusted
                        // child count carried only by the Clawd observation.
                        var pose = old.TryGetValue("pose", out var p) ? p as string : null;
                        var ev = old.TryGetValue("event", out var e) ? e as string : null;
                        if (Number(incoming,"subagents") > 0 && ev != "Stop" && ev != "SessionEnd" &&
                            pose != "asking" && pose != "idle" && pose != "sleeping" && pose != "happy" && pose != "proud") {
                            var combined = new Dictionary<string, object>(old) { ["subagents"] = incoming["subagents"] };
                            merged[pair.Key] = combined;
                        }
                        continue;
                    }
                    merged[pair.Key] = pair.Value;
                }
            return merged;
        }

        void PushClawdSessions(IEnumerable<string> ids)
        {
            foreach (var id in ids.Distinct())
            {
                var merged = MergeClawdSessions(id, Store.ReadJson(Path.Combine(Store.State, id + "-sessions.json")));
                var json = Store.Json.Serialize(merged);
                if (!Paused) Js($"setSessions({Q(id)}, {json})");
                NoteSessions(id, json);
            }
        }

        void PollClawdService()
        {
            EnsureClawdService();
            var data = Store.ReadJson(ClawdSnapshot);
            if (data == null || Math.Abs(DateTimeOffset.UtcNow.ToUnixTimeSeconds() - Number(data,"at")) > 8)
            {
                if (clawdSessions.Count > 0) {
                    var previous = clawdSessions.Keys.ToArray();
                    clawdSessions.Clear(); clawdPlayed.Clear(); clawdRevision = null; clawdPending = 0;
                    PushClawdSessions(previous);
                }
                return;
            }
            clawdPending = (int)Number(data,"pendingCount");
            if (data.TryGetValue("interface", out var interfaceState) && interfaceState is Dictionary<string, object> serviceUi)
                clawdDoNotDisturb = serviceUi.TryGetValue("doNotDisturb", out var dnd) && dnd is bool on && on;
            foreach (var action in clawdDeferredActions.ToArray()) {
                clawdDeferredActions.Remove(action);
                ClawdCommand(action);
            }
            clawdInstance = data["instance"] as string;
            if ((DateTime.UtcNow - clawdAnchorAt).TotalSeconds > 1 && Host != null) {
                clawdAnchorAt = DateTime.UtcNow;
                ClawdCommand("anchor",new Dictionary<string, object> { ["x"] = Host.Left, ["y"] = Host.Top,
                    ["width"] = Host.Width, ["height"] = Host.Height });
            }
            var revision = clawdInstance + ":" + Number(data,"revision");
            if (revision == clawdRevision) return;
            clawdRevision = revision;
            var before = clawdSessions.Keys.ToArray();
            clawdSessions = new Dictionary<string, Dictionary<string, object>>();
            if (!(data.TryGetValue("sessions",out var list) && list is object[] entries)) return;
            var latest = (id:(string)null, ts:0.0);
            foreach (var entry in entries.OfType<Dictionary<string, object>>().OrderBy(x => Number(x,"ts")))
            {
                var id = entry.TryGetValue("character",out var character) ? character as string : null;
                var key = entry.TryGetValue("key",out var sessionKey) ? sessionKey as string : null;
                if (id == null || key == null || (id != "current" && !Characters().Any(c => c.id == id))) continue;
                if (!clawdSessions.TryGetValue(id,out var map)) clawdSessions[id] = map = new Dictionary<string, object>();
                map[key] = entry;
                var client = entry.TryGetValue("client",out var cv) ? cv as string : "agent";
                var at = Number(entry,"ts");
                var playedKey = id + "@" + client;
                var replayKey = id + "@" + key;
                var json = Store.Json.Serialize(entry);
                if (clawdPlayed.TryGetValue(replayKey,out var played) && played == json) continue;
                clawdPlayed[replayKey] = json;
                if (Paused || DateTimeOffset.UtcNow.ToUnixTimeSeconds() - at > 600) continue;
                var native = Store.ReadJson(Path.Combine(Store.State,id + "-sessions.json"));
                if (native != null && native.TryGetValue(key,out var value) && value is Dictionary<string, object> n && Number(n,"ts") >= at - 2) continue;
                var pose = entry.TryGetValue("pose",out var pv) ? pv as string : "idle";
                lastPose[id] = (pose,DateTime.UtcNow);
                Js($"applyCharState({Q(id)}, {json})");
                if (id != "current") {
                    NoteCharState(id,json,pose,DateTime.UtcNow);
                    // Feed the original multi-pet/client routing, including
                    // newly created companions that request their cached state.
                    clientStateSeen.Add(id);
                    clientStates[playedKey] = (json,pose,DateTime.UtcNow);
                    if (CompanionsForwarding) {
                        Js($"applyClientState({Q(id)}, {Q(client)}, {json})");
                        foreach (var pet in companions.Values.Where(c => c.Key == playedKey)) pet.ApplyState(json,pose);
                    }
                    if (pose != "idle" && pose != "sleeping" && at > latest.ts && DateTimeOffset.UtcNow.ToUnixTimeSeconds()-at < 30) latest = (id,at);
                }
            }
            PushClawdSessions(before.Concat(clawdSessions.Keys));
            if (latest.id != null) _ = FollowEvent(latest.id);
        }

        void StopClawdService() { clawdStopping = true; ClawdCommand("quit"); }
    }
}
