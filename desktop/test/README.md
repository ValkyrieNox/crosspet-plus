Run `npm test` from the workspace root for the backend suite and the native
Plus bridge, packaging, tray-resource and command-display checks. Run
`npm run test:mac:bridge` separately on macOS for the Swift bridge tests.

Backend state, subagent, notification and geometry tests use synthetic themes
from `helpers/runtime-theme.js`. Scaffold and validator tests create temporary
theme files. These fixtures keep behavior tests independent of the inert
`service.svg` shipped by the Plus background service.

Imported checks of original Clawd artwork, provenance, issue forms and upstream
publication workflows report explicit skips where those inputs are excluded
from Plus. Generic parser, security and runtime tests in the same files still
run. The retained source checks can be enabled with `CROSSPET_TEST_UPSTREAM=1`
when the corresponding upstream files are available. The helper in
`helpers/upstream-artifacts.js` implements that switch. Workflow checks with
explicit upstream-only skip reasons document release processes that Plus does
not use. Current Plus version, architecture, workflow and packaging assertions
run against the workspace's native build scripts and workflow.

Spawned hook fixtures remove inherited Codex Desktop originator metadata before
applying an explicitly supplied test environment. Ephemeral-thread tests can
still set that metadata themselves.
