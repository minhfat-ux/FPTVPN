; VPNFlow — bộ cài Windows 1-click (Inno Setup 6)
;
; Vì sao Inno Setup: chỉ cần khách tải 1 file .exe, bấm Next là xong — không phải
; cài .NET, không phải cài WireGuard (bản app đã nhúng wintun.dll + wireguard-go.exe
; chạy userspace, xem windows/assets/THIRD_PARTY.md).
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
CloseApplications=yes
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
; Toàn bộ output publish (self-contained: có sẵn .NET runtime, Avalonia, wintun.dll, wireguard-go.exe).
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\{#AppExeName}"
Name: "{group}\{cm:UninstallProgram,{#AppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExeName}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent

[Code]
{ Chặn sớm nếu bộ publish thiếu binary tunnel — thà báo lúc build còn hơn để khách cài ra app không kết nối được. }
function InitializeSetup(): Boolean;
var
  Missing: String;
begin
  Missing := '';
  if not FileExists(ExpandConstant('{#SourceDir}\wintun.dll')) then
    Missing := Missing + '  - wintun.dll' + #13#10;
  if not FileExists(ExpandConstant('{#SourceDir}\wireguard-go.exe')) then
    Missing := Missing + '  - wireguard-go.exe' + #13#10;
  if Missing <> '' then
  begin
    MsgBox('Bộ cài thiếu binary tunnel:' + #13#10 + Missing + #13#10 +
           'Chạy `bash windows/assets/fetch-assets.sh` rồi publish lại trước khi build bộ cài.', mbCriticalError, MB_OK);
    Result := False;
  end
  else
    Result := True;
end;

{ Khi gỡ cài đặt: hỏi có xoá phiên đăng nhập (%APPDATA%\VPNFlow) hay không. }
function InitializeUninstall(): Boolean;
begin
  Result := True;
  if MsgBox('Xoá luôn dữ liệu đăng nhập của VPNFlow (phiên làm việc, thiết bị đã đăng ký)?',
            mbConfirmation, MB_YESNO) = IDYES then
    DelTree(ExpandConstant('{userappdata}\VPNFlow'), True, True, True);
end;
