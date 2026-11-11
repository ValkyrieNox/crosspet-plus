import Foundation
import Darwin

func testFailure(_ message: String) -> Never {
    fputs("FAIL \(message)\n", stderr)
    exit(1)
}
func check(_ value: @autoclosure () -> Bool, _ message: String) {
    if !value() { testFailure(message) }
}
func rejects(_ message: String, _ body: () throws -> Void) {
    do { try body(); testFailure("accepted \(message)") } catch {}
}

@main struct UpdateTests {
    static func main() {
        do { try runTests() }
        catch { testFailure(error.localizedDescription) }
    }
    static func runTests() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent("CrossPet update 'tests' \(UUID().uuidString)")
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: root) }
        #if arch(arm64)
        let arch = "arm64"
        #else
        let arch = "x64"
        #endif
        let fixtureSource = root.appendingPathComponent("fixture.swift")
        let fixtureBinary = root.appendingPathComponent("fixture")
        try "import Darwin\nexit(0)\n".write(to: fixtureSource, atomically: true, encoding: .utf8)
        try PlusUpdateInstaller.run("/usr/bin/swiftc", [fixtureSource.path, "-o", fixtureBinary.path])
        func fixture(_ name: String, version: String = "2.0.0-plus.1", architecture: String? = nil) throws -> URL {
            let app = root.appendingPathComponent(name)
            let contents = app.appendingPathComponent("Contents")
            let helper = contents.appendingPathComponent("Helpers/CrossPet Plus.app/Contents/MacOS")
            try fm.createDirectory(at: contents.appendingPathComponent("MacOS"), withIntermediateDirectories: true)
            try fm.createDirectory(at: helper, withIntermediateDirectories: true)
            for binary in [contents.appendingPathComponent("MacOS/CrossPet"), helper.appendingPathComponent("CrossPet Plus")] {
                try fm.copyItem(at: fixtureBinary, to: binary)
            }
            let resources = contents.appendingPathComponent("Helpers/CrossPet Plus.app/Contents/Resources")
            try fm.createDirectory(at: resources, withIntermediateDirectories: true)
            try Data("fixture".utf8).write(to: resources.appendingPathComponent("app.asar"))
            let metadata: [String: Any] = ["CFBundleIdentifier": "com.valkyrienox.crosspet-plus.native", "CFBundleExecutable": "CrossPet",
                "CFBundlePackageType": "APPL", "CrossPetPlusService": true, "CrossPetPlusArch": architecture ?? arch, "CrossPetVersion": version]
            try PropertyListSerialization.data(fromPropertyList: metadata, format: .xml, options: 0).write(to: contents.appendingPathComponent("Info.plist"))
            try PlusUpdateInstaller.run("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", app.path])
            return app
        }
        let valid = try fixture("Valid.app")
        try PlusUpdateInstaller.validatePackage(valid, version: "2.0.0-plus.1", arch: arch)
        rejects("wrong version") { try PlusUpdateInstaller.validatePackage(valid, version: "3.0.0", arch: arch) }
        rejects("wrong architecture") { try PlusUpdateInstaller.validatePackage(valid, version: "2.0.0-plus.1", arch: arch == "arm64" ? "x64" : "arm64") }
        let incomplete = try fixture("Incomplete.app")
        try fm.removeItem(at: incomplete.appendingPathComponent("Contents/Helpers"))
        rejects("missing service") { try PlusUpdateInstaller.validatePackage(incomplete, version: "2.0.0-plus.1", arch: arch) }
        let tampered = try fixture("Tampered.app")
        try Data("bad".utf8).write(to: tampered.appendingPathComponent("Contents/MacOS/CrossPet"))
        rejects("invalid signature") { try PlusUpdateInstaller.validatePackage(tampered, version: "2.0.0-plus.1", arch: arch) }
        rejects("application exits before startup acknowledgement") { try PlusUpdateInstaller.launchApplication(valid) }
        let destination = try fixture("Installed 'pet'.app", version: "1.0.0")
        let zip = root.appendingPathComponent("release.zip")
        // Release archives always contain CrossPet.app.
        let release = root.appendingPathComponent("CrossPet.app")
        try fm.moveItem(at: valid, to: release)
        try PlusUpdateInstaller.run("/usr/bin/ditto", ["-c", "-k", "--keepParent", release.path, zip.path])
        let request = try PlusUpdateInstaller.stage(archive: zip, destination: destination, version: "2.0.0-plus.1", arch: arch,
                                                  installer: URL(fileURLWithPath: "/usr/bin/true"), parentPid: 0)
        var launched: [String] = []
        try PlusUpdateInstaller.install(request) { app in
            launched.append(app.path)
            rejects("simultaneous install") { try PlusUpdateInstaller.install(request) { _ in } }
        }
        check(launched == [destination.path], "new app automatically launched at original path")
        try PlusUpdateInstaller.validatePackage(destination, version: "2.0.0-plus.1", arch: arch)
        try fm.removeItem(at: destination)
        _ = try fixture("Installed 'pet'.app", version: "1.0.0")
        let rollback = try PlusUpdateInstaller.stage(archive: zip, destination: destination, version: "2.0.0-plus.1", arch: arch,
                                                   installer: URL(fileURLWithPath: "/usr/bin/true"), parentPid: 0)
        var attempts = 0
        rejects("failed launch") {
            try PlusUpdateInstaller.install(rollback) { _ in
                attempts += 1
                if attempts == 1 { throw NSError(domain: "fixture", code: 1) }
            }
        }
        check(attempts == 2, "old app reopens after failed new launch")
        try PlusUpdateInstaller.validatePackage(destination, version: "1.0.0", arch: arch)
        let blockedBackup = try PlusUpdateInstaller.stage(archive: zip, destination: destination, version: "2.0.0-plus.1", arch: arch,
            installer: URL(fileURLWithPath: "/usr/bin/true"), parentPid: 0)
        try fm.createDirectory(at: blockedBackup.workspace.appendingPathComponent("previous.app"), withIntermediateDirectories: false)
        var reopened = false
        rejects("cannot move old bundle") {
            try PlusUpdateInstaller.install(blockedBackup) { _ in reopened = true }
        }
        check(reopened, "old application reopens when replacement cannot begin")
        try PlusUpdateInstaller.validatePackage(destination, version: "1.0.0", arch: arch)
        let waiting = try PlusUpdateInstaller.stage(archive: zip, destination: destination, version: "2.0.0-plus.1", arch: arch,
                                                  installer: URL(fileURLWithPath: "/usr/bin/true"), parentPid: getpid())
        rejects("live old process") { try PlusUpdateInstaller.install(waiting, timeout: 0.02) { _ in testFailure("launched while old host lives") } }
        check(fm.fileExists(atPath: destination.path), "timeout preserves old application")
        print("PASS Plus update validation, atomic replacement, automatic launch, rollback, concurrent installer and parent timeout")
    }
}
