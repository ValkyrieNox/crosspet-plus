# Mac Plus automatic update implementation plan

The user selected automatic installation and immediate restart after download and verification.

## Goal and architecture

Use the existing native update menu and settings button. Download the architecture-specific combined Plus ZIP over HTTPS from the configured release repository. Stage and validate the complete native application and embedded service before exiting. A copy of the native executable runs as an independent installer, waits for the old host to exit, swaps directories on the same filesystem, and launches the new application. Restore and reopen the previous application if replacement or launch fails.

## Constraints and review focus

- Keep preferences, characters and integration data in their existing locations.
- Update the native host and embedded service together.
- Reject mismatched versions, architectures, incomplete packages and invalid signatures.
- Use unique staging directories and argument arrays for paths containing spaces or shell characters.
- Abort safely when the old process stays alive or the target cannot be written.
- Prevent simultaneous installers from replacing the same application.

## Tasks

- [x] Add failing Swift tests for package identity checks, replacement, rollback, parent timeout and concurrent installation.
- [x] Implement `PlusUpdateInstaller` in `app/mac/PlusUpdateInstaller.swift`, with independently testable filesystem replacement and package validation.
- [x] Wire a detached installer entry point into `app/mac/main.swift` and the download / handoff flow into `app/mac/App+Update.swift`.
- [x] Run the Swift tests, existing bridge tests and complete `npm test` suite.
- [x] Rebuild the Mac package, verify its signature and ZIP, and run a real staged update/restart against disposable copies of the application.

Implementation proceeds in the current shared workspace and keeps existing uncommitted work.

## Verification

- Full backend suite passed with 15,329 passes, zero failures and 190 skips. Plus suite passed all 14 tests.
- Real combined ZIP installation, launch acknowledgement and cleanup passed. The published release download has not been installed during verification.
- An additional regression verifies that failure to move the old bundle reopens the original app.
- Initial test fixtures and trapping assertions generated macOS crash dialogs. Fixtures now use a locally compiled executable and assertions exit normally with status 1. Full-suite rerun produced no new crash reports.
- Scoped independent review found no important or critical issues.
