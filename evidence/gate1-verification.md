# GATE 1 — iOS VPN Skeleton: Verification Evidence

- **Date:** 2026-08-19
- **Requirement baseline:** RS-20260819-01
- **Rule baseline:** RULESET-0001
- **Verifier:** Culi/orchestrator session (evidence-based; formal gate review pending)

## 1. Simulator build (BUILD SUCCEEDED)

- Log: `evidence/builds/2026-08-19-gate1-simulator-build.log`
- Command:
  ```
  xcodebuild -project PrivateVPN.xcodeproj -scheme PrivateVPN \
    -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
  ```
- Result: exit 0 — `** BUILD SUCCEEDED **`
- Targets built: PrivateVPN (app), PrivateVPNPacketTunnel (appex, embedded)

## 1b. Xcode signing fix (adhoc sign, runnable from Xcode)

- Root cause of "The executable is not codesigned" run error: project-level
  `CODE_SIGNING_ALLOWED: NO` in `project.yml` disabled all signing, so Xcode
  could not install the app on the simulator.
- Fix: removed `CODE_SIGNING_ALLOWED: NO` from project-level settings; regenerated
  the project with xcodegen.
- Result: app + extension now sign ad-hoc (`codesign -dv` → `Signature=adhoc`,
  `Identifier=com.privatevpn.app`, `com.privatevpn.app.packet-tunnel`) and build
  from Xcode for the simulator → BUILD SUCCEEDED.

## 2. Unit tests (TEST SUCCEEDED — 9/9 passed)

- Log: `evidence/builds/2026-08-19-gate1-tests.log`
- Command:
  ```
  xcodebuild -project PrivateVPN.xcodeproj -scheme PrivateVPN \
    -destination 'platform=iOS Simulator,id=3997A603-0BDB-4C65-817C-BD31C4C1B1E4' \
    CODE_SIGNING_ALLOWED=NO -parallel-testing-enabled NO test
  ```
- Result: exit 0 — `** TEST SUCCEEDED **`, `Executed 9 tests, with 0 failures`
- Covered: NEVPNStatus → VPNState mapping (6), action guards canConnect/canDisconnect (3)

## 3. Requirement states (impl field)

| Req | State | Basis |
|-----|-------|-------|
| FR-VPN-005 | IMPLEMENTED | Real state model (VPNState) driven by NEVPNStatus; no fake connected; 9 unit tests |
| NFR-UX-001 | IMPLEMENTED | One-tap Connect/Disconnect in ContentView, state-driven enablement |
| NFR-SEC-003 | IMPLEMENTED | Secret scan of code/config/docs passed; Keychain noted for GATE 2+ |
| FR-DIAG-001 | PARTIAL | lastError surfaced in UI (basic); full diagnostics deferred to GATE 5 |
| NFR-PERF-001 | PARTIAL | State transitions immediate; no unbounded waits verified (simulator scope) |
| NFR-REL-001 | PARTIAL | State derives from NEVPNStatus at init/refresh; restart handling GATE 2+ |
| NFR-OBS-001 | PARTIAL | Status JSON + dashboard updated this session; automation pending |

## 4. Environment note (blocker, not GATE 1 scope)

- Internal system disk was 100% full (300 MB free) during the session → caused
  simulator crash (Mach -308), app install failures (IXErrorDomain code 3), and
  xcodebuild hangs ("No space left on device"). Freed ~2 GB of DerivedData/
  module caches; disk now ~2.3 GB free. Real-device E2E (GATE 2+) additionally
  needs a physical iPhone and control-plane credentials (documented blockers).

## 5. Remaining for GATE 1 formal verification

- Independent review of evidence by verifier authority (spec §33).
- Optional: `xcodebuild analyze` + SwiftLint-style checks are not part of the
  GATE 1 acceptance criteria (skeleton + state model + build + unit tests).
