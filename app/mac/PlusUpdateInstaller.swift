// SPDX-License-Identifier: AGPL-3.0-only
import Foundation
import Darwin

struct PlusUpdateRequest: Codable {
    let destination: URL
    let stagedApp: URL
    let workspace: URL
    let version: String
    let arch: String
    let parentPid: Int32
    var helper: URL { workspace.appendingPathComponent("installer") }
    var file: URL { workspace.appendingPathComponent("request.json") }
}

enum PlusUpdateInstaller {
    static func failure(_ message: String) -> NSError {
        NSError(domain: "CrossPetUpdate", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }

    static func run(_ executable: String, _ arguments: [String]) throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        try process.run()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else { throw failure("\(URL(fileURLWithPath: executable).lastPathComponent) 执行失败（\(process.terminationStatus)）") }
    }

    static func validatePackage(_ app: URL, version: String, arch: String) throws {
        let fm = FileManager.default
        let contents = app.appendingPathComponent("Contents")
        let data = try Data(contentsOf: contents.appendingPathComponent("Info.plist"))
        guard let info = try PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any],
              info["CFBundleIdentifier"] as? String == "com.valkyrienox.crosspet-plus.native",
              info["CFBundleExecutable"] as? String == "CrossPet",
              info["CrossPetPlusService"] as? Bool == true,
              info["CrossPetVersion"] as? String == version,
              ["arm64", "x64"].contains(arch), info["CrossPetPlusArch"] as? String == arch else {
            throw failure("更新包的版本、架构或 Plus 应用标识不匹配")
        }
        for relative in ["MacOS/CrossPet", "Helpers/CrossPet Plus.app/Contents/MacOS/CrossPet Plus"] {
            let binary = contents.appendingPathComponent(relative)
            guard fm.isExecutableFile(atPath: binary.path) else { throw failure("更新包缺少可执行组件 \(relative)") }
            guard try supportsArchitecture(binary, arch: arch) else { throw failure("更新包的可执行文件架构不匹配") }
        }
        guard fm.fileExists(atPath: contents.appendingPathComponent("Helpers/CrossPet Plus.app/Contents/Resources/app.asar").path) else {
            throw failure("更新包缺少 Plus 后台资源")
        }
        try run("/usr/bin/codesign", ["--verify", "--deep", "--strict", app.path])
    }

    static func supportsArchitecture(_ binary: URL, arch: String) throws -> Bool {
        let file = try FileHandle(forReadingFrom: binary)
        defer { try? file.close() }
        let bytes = [UInt8](try file.read(upToCount: 4096) ?? Data())
        guard bytes.count >= 8 else { return false }
        func word(_ offset: Int) -> UInt32 {
            bytes[offset..<offset + 4].reduce(UInt32(0)) { ($0 << 8) | UInt32($1) }
        }
        let cpu: UInt32 = arch == "arm64" ? 0x0100000c : 0x01000007
        switch word(0) {
        case 0xcffaedfe: return word(4).byteSwapped == cpu
        case 0xfeedfacf: return word(4) == cpu
        case 0xcafebabe, 0xcafebabf:
            let count = Int(word(4)), stride = word(0) == 0xcafebabe ? 20 : 32
            guard count <= 64, bytes.count >= 8 + count * stride else { return false }
            return (0..<count).contains { word(8 + $0 * stride) == cpu }
        default: return false
        }
    }

    static func stage(archive: URL, destination: URL, version: String, arch: String,
                      installer: URL, parentPid: Int32) throws -> PlusUpdateRequest {
        let fm = FileManager.default
        let parent = destination.deletingLastPathComponent()
        guard fm.isWritableFile(atPath: parent.path) else { throw failure("应用所在文件夹无法写入，请将 CrossPet 放到可写的应用程序文件夹") }
        let workspace = parent.appendingPathComponent(".CrossPet-update-\(UUID().uuidString)", isDirectory: true)
        try fm.createDirectory(at: workspace, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
        do {
            let extracted = workspace.appendingPathComponent("package")
            try run("/usr/bin/ditto", ["-x", "-k", archive.path, extracted.path])
            let app = extracted.appendingPathComponent("CrossPet.app")
            try validatePackage(app, version: version, arch: arch)
            let request = PlusUpdateRequest(destination: destination, stagedApp: app, workspace: workspace,
                                            version: version, arch: arch, parentPid: parentPid)
            try fm.copyItem(at: installer, to: request.helper)
            try JSONEncoder().encode(request).write(to: request.file, options: .atomic)
            return request
        } catch {
            try? fm.removeItem(at: workspace)
            throw error
        }
    }

    static func install(_ request: PlusUpdateRequest, timeout: TimeInterval = 30,
                        launch: (URL) throws -> Void = launchApplication) throws {
        let fm = FileManager.default
        // A stable sibling lock serializes separate installers, including their rollback.
        let lockURL = request.destination.deletingLastPathComponent().appendingPathComponent(".CrossPet-update.lock")
        let fd = open(lockURL.path, O_CREAT | O_RDWR | O_NOFOLLOW, 0o600)
        guard fd >= 0 else { throw failure("无法锁定更新目录") }
        defer { close(fd) }
        guard flock(fd, LOCK_EX | LOCK_NB) == 0 else { throw failure("另一个更新正在安装") }
        defer { flock(fd, LOCK_UN) }
        let deadline = Date().addingTimeInterval(timeout)
        while request.parentPid > 0 && kill(request.parentPid, 0) == 0 {
            guard Date() < deadline else { throw failure("旧版尚未退出，已取消安装") }
            Thread.sleep(forTimeInterval: 0.05)
        }
        let backup = request.workspace.appendingPathComponent("previous.app")
        var backedUp = false
        var replaced = false
        do {
            try validatePackage(request.stagedApp, version: request.version, arch: request.arch)
            try fm.moveItem(at: request.destination, to: backup)
            backedUp = true
            try fm.moveItem(at: request.stagedApp, to: request.destination)
            replaced = true
            try launch(request.destination)
        } catch {
            let installError = error
            if replaced { try fm.moveItem(at: request.destination, to: request.stagedApp) }
            if backedUp { try fm.moveItem(at: backup, to: request.destination) }
            do { try launch(request.destination) }
            catch { throw failure("更新失败，旧版已恢复但未能打开。\(error.localizedDescription)") }
            throw failure("更新失败，已恢复并重新打开旧版。\(installError.localizedDescription)")
        }
        try? fm.removeItem(at: request.workspace)
    }

    static func launchApplication(_ app: URL) throws {
        let receipt = FileManager.default.temporaryDirectory.appendingPathComponent("crosspet-update-ready-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: receipt) }
        let process = Process()
        process.executableURL = app.appendingPathComponent("Contents/MacOS/CrossPet")
        process.arguments = ["--crosspet-update-ready", receipt.path]
        process.standardInput = FileHandle.nullDevice
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        try process.run()
        let deadline = Date().addingTimeInterval(30)
        while process.isRunning && Date() < deadline {
            if let text = try? String(contentsOf: receipt, encoding: .utf8), text == String(process.processIdentifier) { return }
            Thread.sleep(forTimeInterval: 0.1)
        }
        if process.isRunning {
            process.terminate()
            let stopDeadline = Date().addingTimeInterval(5)
            while process.isRunning && Date() < stopDeadline { Thread.sleep(forTimeInterval: 0.1) }
            if process.isRunning { kill(process.processIdentifier, SIGKILL) }
        }
        process.waitUntilExit()
        throw failure("新版未能完成启动")
    }

    static func acknowledgeLaunch() {
        let args = CommandLine.arguments
        guard let index = args.firstIndex(of: "--crosspet-update-ready"), index + 1 < args.count else { return }
        try? String(getpid()).write(toFile: args[index + 1], atomically: true, encoding: .utf8)
    }
}
