; VPNFlow — bộ cài Windows 1-click (Inno Setup 6)
;
; Vì sao Inno Setup: chỉ cần khách tải 1 file .exe, bấm Next là xong — không phải
; cài .NET, không phải cài WireGuard (bản app đã nhúng wintun.dll + wireguard-go.exe
; chạy userspace, xem windows/assets/THIRD_PARTY.md), và cũng không phải cài thêm gì cho
; đường "hysteria2 bọc trong WebSocket" (nhúng flowvpnrelay.exe + sing-box.exe).
;
; Build (trên máy Windows):
;   powershell -ExecutionPolicy Bypass -File windows\installer\build.ps1
; Kết quả: windows\installer\out\VPNFlow-Setup-<version>.exe
;
; Chạy tay khi đã publish sẵn:
;   ISCC.exe windows\installer\VPNFlow.iss /DAppVersion=1.0.0 /DSourceDir=C:\path\to\publish

#define AppName "VPNFlow"
#define AppPublisher "FlowTech"
#define AppExeName "PrivateVPNWindows.App.exe"

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

; Thư mục chứa output của `dotnet publish` (mặc định: build.ps1 publish vào ..\installer\publish)
#ifndef SourceDir
  #define SourceDir "publish"
#endif

; ---------------------------------------------------------------------------
; Chặn NGAY LÚC BUILD (ISPP) nếu bộ publish thiếu binary tunnel.
;
; TUYỆT ĐỐI không kiểm tra kiểu này trong [Code] InitializeSetup: `{#SourceDir}` là
; đường dẫn trên MÁY BUILD, nên khi khách chạy bộ cài trên máy họ thì FileExists luôn
; sai ⇒ mọi khách đều bị báo "thiếu wintun.dll / wireguard-go.exe" rồi bộ cài tự huỷ.
; (Đã xảy ra thực tế: khách tải bản trên trang buy và không cài được.)
; ---------------------------------------------------------------------------
#if !FileExists(AddBackslash(SourceDir) + "wintun.dll")
  #error Bo publish thieu wintun.dll - chay: bash windows/assets/fetch-assets.sh roi publish lai
#endif
#if !FileExists(AddBackslash(SourceDir) + "wireguard-go.exe")
  #error Bo publish thieu wireguard-go.exe - chay: bash windows/assets/fetch-assets.sh roi publish lai
#endif
#if !FileExists(AddBackslash(SourceDir) + "PrivateVPNWindows.App.exe")
  #error Bo publish thieu PrivateVPNWindows.App.exe - chay lai dotnet publish
#endif
; Đường hysteria2-over-WS: app chạy 2 tiến trình con cạnh chính nó (AppContext.BaseDirectory),
; thiếu file thì app vẫn mở nhưng đường relay không dựng được — chặn ngay ở đây.
#if !FileExists(AddBackslash(SourceDir) + "flowvpnrelay.exe")
  #error Bo publish thieu flowvpnrelay.exe - chay: bash windows/assets/fetch-assets.sh roi publish lai
#endif
#if !FileExists(AddBackslash(SourceDir) + "sing-box.exe")
  #error Bo publish thieu sing-box.exe - chay: bash windows/assets/fetch-assets.sh roi publish lai
#endif

[Setup]
AppId={{8C1F2E64-6B7A-4E8D-9C31-2F5A7D4B0E11}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
VersionInfoVersion={#AppVersion}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\{#AppExeName}
; --- KÝ SỐ (NFR-WIN-002) -----------------------------------------------------
; Chỉ bật khi build.ps1 truyền /DSignedBuild kèm /Ssigntool=<wrapper .cmd>; khi đó:
;   - SignTool     : ký chính file Setup
;   - SignedUninstaller: ký luôn uninstaller (không ký thì lúc GỠ cài, SAC/SmartScreen lại chặn)
; Cố ý KHÔNG đặt mặc định: bật mà không có chứng chỉ thì ISCC báo lỗi "Sign Tool not found".
; Build tay (ISCC trực tiếp) muốn ký thì thêm: /DSignedBuild /Ssigntool=<wrapper>
#ifdef SignedBuild
SignTool=signtool
SignedUninstaller=yes
#endif
OutputDir=out
OutputBaseFilename=VPNFlow-Setup-{#AppVersion}
SetupIconFile=..\assets\vpnflow.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
; App yêu cầu quyền admin để dựng tunnel (app.manifest: requireAdministrator) — bộ cài cũng vậy.
PrivilegesRequired=admin
; wintun + wireguard-go chỉ có bản x64.
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
MinVersion=10.0.17763
; Nâng cấp đè bản cũ: đóng app đang chạy thay vì báo lỗi "file đang dùng".
; Vì sao `force` (đã kiểm chứng 21/09/2026): app chạy elevated nên khi chỉ để `yes`, bộ cài
; KHÔNG đóng được app ⇒ cài silent trả **exit code 5** (2 lần liên tiếp trên máy test) và khách
; phải tự tắt app trước. `force` đóng thẳng không hỏi, nên cài đè luôn sạch (đã cài lại OK với
; /FORCECLOSEAPPLICATIONS). `RestartApplications=no` giữ nguyên: app tự bật lại khi khách mở.
CloseApplications=force
RestartApplications=no
AllowNoIcons=yes

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"
; Muốn thêm tiếng Việt/Trung: tải file ngôn ngữ chính thức rồi bỏ comment 2 dòng dưới.
; Name: "vi"; MessagesFile: "compiler:Languages\Vietnamese.isl"
; Name: "zh"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Toàn bộ output publish (self-contained: có sẵn .NET runtime, Avalonia, wintun.dll,
; wireguard-go.exe, flowvpnrelay.exe, sing-box.exe).
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\{#AppExeName}"
Name: "{group}\{cm:UninstallProgram,{#AppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\{#AppExeName}"; Tasks: desktopicon

[InstallDelete]
; Cài đè là UPDATE, không tạo app thứ hai: xoá sạch file cũ trong thư mục cài đặt trước khi copy.
; (Dữ liệu người dùng nằm ở %APPDATA%\VPNFlow nên KHÔNG bị ảnh hưởng.)
Type: filesandordirs; Name: "{app}"

[Run]
Filename: "{app}\{#AppExeName}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent

[Code]
// Bản cũ từng được cài với AppId/tên khác (PrivateVPN / FlowVPN / FlowTech …) nên Windows coi là
// app riêng ⇒ khách thấy 2 app. Trước khi cài, tìm các mục đó trong registry và gỡ sạch.
const
  OwnUninstallKey = '{8C1F2E64-6B7A-4E8D-9C31-2F5A7D4B0E11}_is1';

function IsLegacyBrand(const DisplayName: String): Boolean;
begin
  Result :=
    (Pos('VPNFlow', DisplayName) > 0) or
    (Pos('PrivateVPN', DisplayName) > 0) or
    (Pos('FlowVPN', DisplayName) > 0) or
    (Pos('FlowTech', DisplayName) > 0) or
    (Pos('FPT Harness', DisplayName) > 0);
end;

procedure RemoveLegacyUninstallEntry(const RootKey: Integer; const Parent, SubKey: String);
var
  DisplayName, Uninstall, Loc, Quoted: String;
  ResultCode: Integer;
  Full: String;
begin
  Full := Parent + '\' + SubKey;
  if not RegQueryStringValue(RootKey, Full, 'DisplayName', DisplayName) then
    Exit;
  if not IsLegacyBrand(DisplayName) then
    Exit;
  if CompareText(SubKey, OwnUninstallKey) = 0 then
    Exit;   // chính bản này — để Inno tự nâng cấp

  // 1) gỡ im lặng bản cũ (nếu có uninstaller)
  if RegQueryStringValue(RootKey, Full, 'UninstallString', Uninstall) then
  begin
    Quoted := RemoveQuotes(Uninstall);
    if FileExists(Quoted) then
      Exec(Quoted, '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART', '', SW_HIDE,
           ewWaitUntilTerminated, ResultCode);
  end;

  // 2) dọn thư mục cài cũ còn sót (khác thư mục đang cài)
  if RegQueryStringValue(RootKey, Full, 'InstallLocation', Loc) then
  begin
    Loc := RemoveBackslashUnlessRoot(Loc);
    if (Loc <> '') and (CompareText(Loc, ExpandConstant('{app}')) <> 0) and DirExists(Loc) then
      DelTree(Loc, True, True, True);
  end;

  // 3) xoá luôn mục registry cũ để "Apps & features" không còn 2 dòng
  RegDeleteKeyIncludingSubkeys(RootKey, Full);
end;

procedure RemoveLegacyInstalls();
var
  Names: TArrayOfString;
  i: Integer;
  Parent: String;
begin
  Parent := 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall';
  if RegGetSubkeyNames(HKLM, Parent, Names) then
    for i := 0 to GetArrayLength(Names) - 1 do
      RemoveLegacyUninstallEntry(HKLM, Parent, Names[i]);
  Parent := 'SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall';
  if RegGetSubkeyNames(HKLM, Parent, Names) then
    for i := 0 to GetArrayLength(Names) - 1 do
      RemoveLegacyUninstallEntry(HKLM, Parent, Names[i]);
  Parent := 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall';
  if RegGetSubkeyNames(HKCU, Parent, Names) then
    for i := 0 to GetArrayLength(Names) - 1 do
      RemoveLegacyUninstallEntry(HKCU, Parent, Names[i]);
end;

// Kiểm tra SAU KHI CÀI — chạy trên MÁY KHÁCH, soi đúng thư mục cài đặt (ExpandConstant app).
// Mục đích: nếu phần mềm diệt virus cách ly wintun.dll / wireguard-go.exe / flowvpnrelay.exe /
// sing-box.exe thì khách biết ngay lý do, thay vì mở app rồi báo "không kết nối được".
procedure CurStepChanged(CurStep: TSetupStep);
var
  Missing: String;
begin
  if CurStep = ssInstall then
  begin
    RemoveLegacyInstalls();
  end;

  if CurStep = ssPostInstall then
  begin
    Missing := '';
    if not FileExists(ExpandConstant('{app}\wintun.dll')) then
      Missing := Missing + '  - wintun.dll' + #13#10;
    if not FileExists(ExpandConstant('{app}\wireguard-go.exe')) then
      Missing := Missing + '  - wireguard-go.exe' + #13#10;
    if not FileExists(ExpandConstant('{app}\flowvpnrelay.exe')) then
      Missing := Missing + '  - flowvpnrelay.exe' + #13#10;
    if not FileExists(ExpandConstant('{app}\sing-box.exe')) then
      Missing := Missing + '  - sing-box.exe' + #13#10;
    if Missing <> '' then
      MsgBox('Cài đặt đã xong nhưng thiếu binary tunnel trong thư mục cài đặt:' + #13#10 +
             Missing + #13#10 +
             'Nguyên nhân thường gặp: phần mềm diệt virus cách ly tệp.' + #13#10 +
             'Hãy thêm ngoại lệ (exception) cho thư mục cài đặt VPNFlow rồi chạy lại bộ cài này.',
             mbCriticalError, MB_OK);
  end;
end;

{ Khi gỡ cài đặt: hỏi có xoá phiên đăng nhập (%APPDATA%\VPNFlow) hay không. }
function InitializeUninstall(): Boolean;
begin
  Result := True;
  if MsgBox('Xoá luôn dữ liệu đăng nhập của VPNFlow (phiên làm việc, thiết bị đã đăng ký)?',
            mbConfirmation, MB_YESNO) = IDYES then
    DelTree(ExpandConstant('{userappdata}\VPNFlow'), True, True, True);
end;
