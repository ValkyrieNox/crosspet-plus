// SPDX-License-Identifier: AGPL-3.0-only
using System;
using System.Diagnostics;
using System.Threading;
using Microsoft.Win32;

namespace CrossPet
{
    // One owner for both native settings and the embedded task service. The
    // Windows startup approval is independent of the presence of a Run entry.
    static class WindowsLogin
    {
        const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        const string ApprovalKey = @"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
        const string Name = "CrossPet";
        static string Command => "\"" + Process.GetCurrentProcess().MainModule.FileName + "\"";
        static bool Owned(object value) => value is string text &&
            string.Equals(text, Command, StringComparison.OrdinalIgnoreCase);

        static bool Approved()
        {
            using (var key = Registry.CurrentUser.OpenSubKey(ApprovalKey))
            {
                var value = key?.GetValue(Name);
                if (value == null) return true;
                if (!(value is byte[] bytes) || bytes.Length < 4) return false;
                var state = BitConverter.ToUInt32(bytes, 0);
                return state == 2 || state == 6;
            }
        }

        public static bool Enabled
        {
            get { using (var key = Registry.CurrentUser.OpenSubKey(RunKey))
                return Owned(key?.GetValue(Name)) && Approved(); }
        }

        public static void SetEnabled(bool enabled)
        {
            // Never take over a same-named entry pointing at another program.
            using (var key = Registry.CurrentUser.OpenSubKey(RunKey))
            {
                var previous = key?.GetValue(Name);
                if (previous != null && !Owned(previous))
                    throw new InvalidOperationException("CrossPet startup entry points to another installation.");
            }
            if (enabled)
            {
                using (var key = Registry.CurrentUser.CreateSubKey(RunKey))
                    key.SetValue(Name, Command, RegistryValueKind.String);
                // Clear this app's opt-out and let Windows use its enabled
                // default. Do not synthesize the undocumented approval bytes.
                using (var key = Registry.CurrentUser.OpenSubKey(ApprovalKey, true))
                    key?.DeleteValue(Name, false);
            }
            else using (var key = Registry.CurrentUser.OpenSubKey(RunKey, true))
                key?.DeleteValue(Name, false);
            if (Enabled != enabled) throw new InvalidOperationException("Windows startup change could not be verified.");
            if (enabled)
            {
                // Startup managers can undo a write immediately after it is
                // accepted. Report that failure rather than commit a false UI.
                for (var attempt = 0; attempt < 10; attempt++)
                {
                    Thread.Sleep(100);
                    if (!Enabled) throw new InvalidOperationException(
                        "Windows 禁用了 CrossPet 的开机启动，请检查启动项管理软件中的 CrossPet 设置。");
                }
            }
        }

        // These fixed commands exit before singleton/window creation, so a
        // settings update cannot create a pet or recenter the existing one.
        // Status: 0 enabled, 1 disabled, 2 error. Writes: 0 verified, 2 error.
        public static bool HandleCommand(string[] args)
        {
            if (args.Length != 1 || (args[0] != "--login-status" &&
                args[0] != "--login-enable" && args[0] != "--login-disable")) return false;
            try
            {
                if (args[0] == "--login-status") Environment.ExitCode = Enabled ? 0 : 1;
                else { SetEnabled(args[0] == "--login-enable"); Environment.ExitCode = 0; }
            }
            catch (Exception e) { Store.Log("开机启动设置失败: " + e.Message); Environment.ExitCode = 2; }
            return true;
        }
    }
}
