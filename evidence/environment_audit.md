# ENVIRONMENT AUDIT — PRIVATEVPN iOS MVP

Date: 2026-08-19
Commit (baseline): (none yet — fresh repo)

## Toolchain
```
Xcode 26.6
Build version 17F113
---
swift-driver version: 1.148.6 Apple Swift version 6.3.3 (swiftlang-6.3.3.1.3 clang-2100.1.1.101)
Target: arm64-apple-macosx26.0
---
Version: 2.46.0
---
git version 2.50.1 (Apple Git-155)
```

## Simulators (available)
```
== Devices ==
-- iOS 18.2 --
    iPhone 16 Pro (3997A603-0BDB-4C65-817C-BD31C4C1B1E4) (Shutdown) 
    iPhone 16 Pro Max (F5DC5412-E23C-4095-994B-5DEA08F2116C) (Shutdown) 
    iPhone 16 (DC3C82A0-F21C-4A97-873B-27BF1A4ED8C1) (Shutdown) 
    iPhone 16 Plus (99BCA5E7-3F16-4B69-A370-0881CD0EF0A6) (Shutdown) 
    iPhone SE (3rd generation) (26C96EC4-F139-4CDA-B085-40536CFC842B) (Shutdown) 
    iPad Pro 11-inch (M4) (35E88816-A13E-43B4-A5C4-DFBE98607668) (Shutdown) 
    iPad Pro 13-inch (M4) (40E5C142-1D57-4522-8C56-9A80B08FB862) (Shutdown) 
    iPad Air 11-inch (M2) (8AAFD31C-2F55-425C-937C-74EDFA6838FA) (Shutdown) 
    iPad Air 13-inch (M2) (7C5418EF-0787-4E06-8AC2-66EB3BFBBB36) (Shutdown) 
    iPad mini (A17 Pro) (E2B0FC39-919C-450A-A5EE-EE49F0517352) (Shutdown) 
    iPad (10th generation) (187CAE1F-84BB-4754-B7EF-4827865C8E5D) (Shutdown) 
-- iOS 18.6 --
    iPhone 16 Pro (0C548476-08EC-4640-8E42-C9C1948A3111) (Shutdown) 
    iPhone 16 Pro Max (92AB35FE-0C5C-4C10-8A78-94A8E75C9BE2) (Shutdown) 
    iPhone 16e (78CB5661-9ACE-4BBA-9B6E-7045E2832C25) (Shutdown) 
    iPhone 16 (E903B718-E86B-4E9C-BB7E-A4E2BAB4F273) (Shutdown) 
    iPhone 16 Plus (84218DEE-8688-49BB-95BB-849E5FB4544F) (Shutdown) 
    iPad Pro 11-inch (M4) (0384470C-57FC-4159-AD2C-19543B421C1B) (Shutdown) 
    iPad Pro 13-inch (M4) (AD6794DB-9398-40B0-9B4A-8E9AAF136312) (Shutdown) 
    iPad mini (A17 Pro) (6F154FEE-78DD-4EB7-9CFD-826AA7B59635) (Shutdown) 
    iPad (A16) (B766D55B-CABA-4133-B10C-44F476787E85) (Shutdown) 
    iPad Air 13-inch (M3) (59988BBC-7667-47C3-A3C8-027CEEF96D93) (Shutdown) 
    iPad Air 11-inch (M3) (50FAADCF-51E8-4235-9E54-1622ECDE87FF) (Shutdown) 
-- iOS 26.5 --
-- iOS 26.5 --
    iPhone 17 Pro (DEA1B2B9-F1FD-42F2-9424-74679DC6D74D) (Shutdown) 
    iPhone 17 Pro Max (3E1893EB-8EA8-485A-80B3-A7535EE92D87) (Shutdown) 
    iPhone 17e (23D5F2AD-20C1-4451-B236-25516B7EE73E) (Shutdown) 
    iPhone Air (8C19CE62-7F31-42E8-AF72-0E598DCF83CD) (Shutdown) 
    iPhone 17 (CB3E3B72-7067-4FA0-851F-5F11DDB7B870) (Shutdown) 
    iPad Pro 13-inch (M5) (0FF044F2-7890-4F34-B993-1831084D8A35) (Shutdown) 
    iPad Pro 11-inch (M5) (3B263147-E3E7-46E3-9685-0173DC27C375) (Shutdown) 
    iPad mini (A17 Pro) (1D46E4D6-32CA-4008-9FDD-885C400964C5) (Shutdown) 
    iPad Air 13-inch (M4) (CF837A7B-B68D-4D22-9927-1B8BED0A27EB) (Shutdown) 
    iPad Air 11-inch (M4) (103215CE-14A0-4210-8D1F-DDDFAB34C3D8) (Shutdown) 
    iPad (A16) (4A59E5EF-A90C-411C-B61F-2D41DA4F377B) (Shutdown) 
```

## Code signing
```
  1) F29914EBF2900E2FA41FAD91C5B131B94456FA1F "Apple Development: minhnb2@me.com (K2QKJ93A6V)"
  2) EC7B4DAFE7970B9A4BE07B4711F183B6B3667D03 "Apple Configurator: FPT SOFTWARE COMPANY LIMITED (1D563CAF-E4B9-4DDC-9EFE-E2ED57232B26)"
  3) 49BA86CA65FE9CD6605096409D6D0B1AB7310FCB "Apple Distribution: Minh Nguyen (G6XW3RN6LJ)"
  4) D4A1C4AD1BA8B125FCA59E3BBFBD2D55F03A5E99 "Developer ID Application: Minh Nguyen (G6XW3RN6LJ)"
     4 valid identities found
```

## Assessment
- Xcode present, build version matches claimed 17F113.
- Swift 6.3.3 available.
- xcodegen 2.46.0 installed at /opt/homebrew/bin/xcodegen.
- iOS 26.5 simulators available (iPhone 17 family). No signing team configured; simulator build uses CODE_SIGNING_ALLOWED=NO / ad-hoc.
- Apple Development identity exists (minhnb2@me.com) but Network Extension on simulator is build-only; runtime VPN E2E requires real device (documented blocker for GATE 2+, not for GATE 1).
