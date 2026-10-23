# Change Log

All notable changes to the "jxscout-vscode" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added

- Project scope in the Analysis view: per-file descriptor trees from the
  server's project-wide analysis
- File Explorer view wired to the WebSocket client; file scope shows related
  assets for the focused file
- Findings view with severity filter, and Bookmarks view backed by the REST API
- Match filter cycling (`all` / `unseen` / `interesting`) with per-workspace
  persisted match state
- `npm test` (node:test + native TypeScript) and a CI workflow running
  typecheck, lint, tests and bundle

### Fixed

- WebSocket requests now time out after 30 s and pending promises are rejected
  when the socket closes, instead of hanging forever
- Findings view renders its empty state

## [0.0.5]

- Initial release
