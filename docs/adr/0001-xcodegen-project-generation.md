# ADR-0001: Xcode project generated with xcodegen

- **Status:** ACCEPTED
- **Date:** 2026-08-19

## Context

The repo is created from scratch. Xcode project files are large, noisy diffs and
hard to keep in sync. xcodegen 2.46.0 is installed and the project targets one
app + one extension. No owner-installed Xcode templates.

## Decision

Use xcodegen with a `project.yml` at the repo root to generate
`PrivateVPN.xcodeproj`. Do not hand-maintain the .pbxproj.

## Alternatives

- Hand-rolled .xcodeproj — rejected: error-prone, unreadable diffs.
- Swift Package only — rejected: iOS app + Network Extension still need an .xcodeproj.

## Consequences

- Reproducible project definition in YAML; xcodegen must be re-run after changes.
- `.xcodeproj` is generated (gitignored); `project.yml` is the source of truth.

## Verified

- `xcodegen 2.46.0` runs and generates a valid project (GATE 1 evidence).
