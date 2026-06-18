# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.2](https://github.com/Primajin/webapp-console-log-action/compare/v1.6.1...v1.6.2) (2026-06-18)


### Bug Fixes

* Align Release Please + Dependabot conventions and normalize release tags for Marketplace ([#47](https://github.com/Primajin/webapp-console-log-action/issues/47)) ([5d4d47e](https://github.com/Primajin/webapp-console-log-action/commit/5d4d47ed1e31616f54461f6e0b9b17c5f526d956))
* remove unsupported changelog-type from release-please config ([791269c](https://github.com/Primajin/webapp-console-log-action/commit/791269cb62f0f19d965408fe3c1751ee591ac900))

## [1.6.1](https://github.com/Primajin/webapp-console-log-action/compare/webapp-console-log-action-v1.6.0...webapp-console-log-action-v1.6.1) (2026-06-16)


### Bug Fixes

* remove unsupported changelog-type from release-please config ([791269c](https://github.com/Primajin/webapp-console-log-action/commit/791269cb62f0f19d965408fe3c1751ee591ac900))

## [Unreleased]

## [1.6.0] - 2026-06-16

### Added
- `pre-script-path` input: path to a repo-local JavaScript module that can log in or otherwise prepare the app before console capture begins ([#41](https://github.com/Primajin/webapp-console-log-action/pull/41))
- `pre-script-timeout` input: timeout in milliseconds that bounds pre-script execution, defaulting to 30 000 ms ([#41](https://github.com/Primajin/webapp-console-log-action/pull/41))
- Pre-script runtime exposes `browser`, `context`, `page`, `url`, and a `startCapture()` hook so scripts can begin log collection mid-flow ([#41](https://github.com/Primajin/webapp-console-log-action/pull/41))
- Example workflow and login script demonstrating authenticated console capture against an external site ([#41](https://github.com/Primajin/webapp-console-log-action/pull/41))
- `docs/pre-scripts.md` documenting the full pre-script contract ([#41](https://github.com/Primajin/webapp-console-log-action/pull/41))

### Changed
- Dependencies bumped: `playwright` 1.60.0 → 1.61.0, `vitest` / `@vitest/coverage-v8` 4.1.8 → 4.1.9 ([#40](https://github.com/Primajin/webapp-console-log-action/pull/40))

## [1.5.0] - 2026-04-22

### Changed
- Dependencies bumped across multiple updates: `playwright` through 1.58.x → 1.60.0, plus other package upgrades ([#27](https://github.com/Primajin/webapp-console-log-action/pull/27), [#28](https://github.com/Primajin/webapp-console-log-action/pull/28), [#29](https://github.com/Primajin/webapp-console-log-action/pull/29), [#30](https://github.com/Primajin/webapp-console-log-action/pull/30), [#31](https://github.com/Primajin/webapp-console-log-action/pull/31), [#32](https://github.com/Primajin/webapp-console-log-action/pull/32), [#33](https://github.com/Primajin/webapp-console-log-action/pull/33), [#34](https://github.com/Primajin/webapp-console-log-action/pull/34))

## [1.4.0] - 2026-03-20

### Fixed
- CI: resolved rolldown native binding failure and switched to clean npm installs ([#26](https://github.com/Primajin/webapp-console-log-action/pull/26))

### Changed
- Node.js version in action bumped to LTS 22 ([#26](https://github.com/Primajin/webapp-console-log-action/pull/26))
- Dependencies bumped: 5 packages updated ([#22](https://github.com/Primajin/webapp-console-log-action/pull/22))

## [1.3.0] - 2026-03-20

### Added
- Dependabot configuration for automated dependency updates ([#23](https://github.com/Primajin/webapp-console-log-action/pull/23))

### Changed
- Dependencies bumped: 5 packages updated ([#24](https://github.com/Primajin/webapp-console-log-action/pull/24))

## [1.2.0] - 2025-01-18

### Added
- Example of the resulting PR comment added to the README ([#14](https://github.com/Primajin/webapp-console-log-action/pull/14))

### Fixed
- Action now always outputs a message even when no console logs were captured ([#16](https://github.com/Primajin/webapp-console-log-action/pull/16))

## [1.1.0] - 2025-01-12

### Added
- `regexp-error`, `regexp-info`, `regexp-verbose`, and `regexp-warning` inputs for filtering log messages with regular expressions ([#13](https://github.com/Primajin/webapp-console-log-action/pull/13))

## [1.0.0] - 2025-01-08

### Added
- Initial release: captures browser console logs from a web application using Playwright and posts them as a pull request comment
- Support for serving a locally-built app via `http-server` when `webapp-url` points to `localhost`
- `artifact-name`, `comment-tag`, `headline`, `max-log-level`, `min-log-level`, `port`, `show-emoji`, `wait-time`, and `webapp-url` inputs
- `console` output containing the captured log as JSON
- Markdown-formatted comment with per-level sections and optional emoji
- `show-emoji` input to toggle emoji in the comment
- Action path resolution allowing the action to be used outside of the project repository ([#1](https://github.com/Primajin/webapp-console-log-action/pull/1), [#3](https://github.com/Primajin/webapp-console-log-action/pull/3), [#4](https://github.com/Primajin/webapp-console-log-action/pull/4), [#5](https://github.com/Primajin/webapp-console-log-action/pull/5), [#6](https://github.com/Primajin/webapp-console-log-action/pull/6), [#7](https://github.com/Primajin/webapp-console-log-action/pull/7), [#8](https://github.com/Primajin/webapp-console-log-action/pull/8), [#9](https://github.com/Primajin/webapp-console-log-action/pull/9), [#11](https://github.com/Primajin/webapp-console-log-action/pull/11))

[Unreleased]: https://github.com/Primajin/webapp-console-log-action/compare/v1.6.0...HEAD
[1.6.0]: https://github.com/Primajin/webapp-console-log-action/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/Primajin/webapp-console-log-action/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/Primajin/webapp-console-log-action/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/Primajin/webapp-console-log-action/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/Primajin/webapp-console-log-action/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Primajin/webapp-console-log-action/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Primajin/webapp-console-log-action/commits/v1.0.0
