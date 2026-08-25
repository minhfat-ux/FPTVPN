#!/usr/bin/env bash
# setup-apfs-ssd.sh — move the PrivateVPN workspace + heavy toolchain dirs onto an
# external APFS SSD, so we can drop the ExFAT workarounds (._* sidecars breaking
# aapt/d8, no exec bits for the JDK, build outputs exiled to the internal disk).
#
# Why APFS: proper UNIX permissions, no AppleDouble sidecars, symlink support.
# An external SSD cannot "extend" the internal APFS volume — it becomes its own
# APFS container; we relocate the heavy dirs there and symlink them back.
#
# Usage:
#   bash scripts/setup-apfs-ssd.sh detect
#       List external disks so you can pick the target.
#   bash scripts/setup-apfs-ssd.sh format DISK_ID          # e.g. disk4
#       DESTRUCTIVE: erase the external disk and create a single APFS volume
#       named "VPNSSD". Prompts twice; requires the disk to be external.
#   bash scripts/setup-apfs-ssd.sh migrate /Volumes/VPNSSD [--de-exfat]
#       Copy the workspace + move heavy dirs to the SSD and symlink them back.
#       With --de-exfat, also strip the ExFAT workarounds from
#       android/gradle.properties and android/app/build.gradle.kts (backed up).
#       Run with DRY_RUN=1 first to preview every step.
#   bash scripts/setup-apfs-ssd.sh verify
#       Check symlinks, disk space, JDK, and a Gradle dry run.
#   bash scripts/setup-apfs-ssd.sh undo /Volumes/VPNSSD
#       Remove symlinks and restore config backups (does not delete SSD data).
#
# Env overrides:
#   SSD_NAME      volume name created by format        (default VPNSSD)
#   WORKSPACE_SRC source workspace dir to copy         (default this repo)
#   DRY_RUN=1     print commands without executing
#   SKIP_HEAVY    comma list, e.g. "gradle,xcode"      (skip moving a dir)
set -euo pipefail

export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"

SSD_NAME="${SSD_NAME:-VPNSSD}"
WORKSPACE_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$HOME/.setup-apfs-ssd-backup"
DRY="${DRY_RUN:-0}"

say()  { printf '\033[1;34m%s\033[0m\n' "$*"; }
warn() { printf '\033[1;33mWARN: %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

run() {
  if [ "$DRY" = "1" ]; then
    printf '  [dry-run] %s\n' "$*"
  else
    printf '  %s\n' "$*"
    "$@"
  fi
}

skip() { # skip <name> — true if name is in SKIP_HEAVY
  case ",${SKIP_HEAVY:-}," in
    *",$1,"*) return 0 ;;
    *) return 1 ;;
  esac
}

require_rootless() {
  if [ "$(id -u)" = "0" ]; then
    die "do not run as root (sudo breaks ~/ and /Volumes paths)"
  fi
}

# ---------------------------------------------------------------- detect
cmd_detect() {
  echo "External disks:"
  diskutil list external | sed -n '1,40p'
  echo
  echo "Hint: pick the disk identifier (e.g. disk4) of the SSD you want to use,"
  echo "then run:  bash scripts/setup-apfs-ssd.sh format disk4"
}

# ---------------------------------------------------------------- format
cmd_format() {
  local disk="$1"
  diskutil info "$disk" >/dev/null 2>&1 || die "no such disk: $disk"
  diskutil info "$disk" | grep -q 'Device Location:.*External' \
    || die "refusing: $disk is not an external disk"
  diskutil info "$disk" | grep -q 'Protocol:.*Disk Image' \
    && die "refusing: $disk is a disk image"

  echo "You are about to ERASE this disk:"
  diskutil info "$disk" | sed -n '1,14p'
  read -r -p "Type the disk id ($disk) to confirm: " ans
  [ "$ans" = "$disk" ] || die "confirmation mismatch — aborting"
  read -r -p "Really erase $disk? This destroys ALL data on it. Type YES: " ans
  [ "$ans" = "YES" ] || die "aborted"

  run diskutil eraseDisk APFS "$SSD_NAME" "$disk"
  echo
  say "Done. Volume '$SSD_NAME' should be at /Volumes/$SSD_NAME"
  say "Next: bash scripts/setup-apfs-ssd.sh migrate /Volumes/$SSD_NAME --de-exfat"
}

# ---------------------------------------------------------------- migrate
# dirs: <local>|<name>|<ssd-relative-dest>
HEAVY_DIRS=(
  "$HOME/.gradle|gradle|gradle"
  "$HOME/Library/Android/sdk|android-sdk|android-sdk"
  "$HOME/.vpnflow-build|vpnflow-build|vpnflow-build"
  "$HOME/Library/Developer/Xcode/Archives|xcode-archives|xcode/Archives"
  "$HOME/Library/Developer/Xcode/DerivedData|xcode-deriveddata|xcode/DerivedData"
  "$HOME/Library/Developer/CoreSimulator|core-simulator|xcode/CoreSimulator"
)

cmd_migrate() {
  local ssd="${1:-}"
  [ -n "$ssd" ] || die "usage: setup-apfs-ssd.sh migrate /Volumes/VPNSSD [--de-exfat]"
  local de_exfat=0
  [ "${2:-}" = "--de-exfat" ] && de_exfat=1

  [ -d "$ssd" ] || die "SSD not mounted at $ssd — plug it in and check /Volumes"
  local fs
  fs="$(diskutil info "$ssd" | awk -F': ' '/File System Personality/ {print $2}' | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"
  echo "SSD filesystem: $fs"
  case "$fs" in
    APFS*) ;;
    *) die "expected APFS, found '$fs' — ExFAT/HFS+ will not fix the sidecar problem" ;;
  esac

  require_rootless

  # 1. Workspace copy (only when source is not already on this SSD).
  if [ "${WORKSPACE_SRC#$ssd/}" = "$WORKSPACE_SRC" ]; then
    say "1/4 Copying workspace -> $ssd/PrivateVPN"
    [ -d "$ssd/PrivateVPN" ] && die "$ssd/PrivateVPN already exists — migrate once, then switch working dirs"
    run mkdir -p "$ssd/PrivateVPN"
    # Exclude build artifacts and the JDK (relinked separately below).
    run rsync -a --info=progress2 \
      --exclude 'build/' --exclude '.derivedData-*/' --exclude '.tools/' \
      "$WORKSPACE_SRC/" "$ssd/PrivateVPN/"
    say "   workspace copied — future work happens in $ssd/PrivateVPN"
  else
    say "1/4 Workspace already on SSD — skipping copy"
  fi

  # 2. JDK symlink.
  say "2/4 Relocating JDK"
  local jdk_src="$WORKSPACE_SRC/.tools/jdk/temurin-17.jdk"
  local jdk_dst="$ssd/toolchains/jdk/temurin-17.jdk"
  if [ -d "$jdk_src" ] && ! skip jdk; then
    run mkdir -p "$ssd/toolchains/jdk"
    [ -e "$jdk_dst" ] || run mv "$jdk_src" "$jdk_dst"
    run ln -sfn "$jdk_dst" "$WORKSPACE_SRC/.tools/jdk/temurin-17.jdk"
    say "   JDK -> $jdk_dst"
  fi

  # 3. Heavy dirs -> SSD + symlink back.
  say "3/4 Moving heavy dirs (SKIP_HEAVY=${SKIP_HEAVY:-none})"
  local entry local_path name dest
  for entry in "${HEAVY_DIRS[@]}"; do
    IFS='|' read -r local_path name dest <<<"$entry"
    skip "$name" && { say "   skip $name (SKIP_HEAVY)"; continue; }
    if [ ! -e "$local_path" ]; then
      say "   $name: no local dir ($local_path) — nothing to move"
      continue
    fi
    if [ -L "$local_path" ]; then
      say "   $name: already a symlink ($(readlink "$local_path"))"
      continue
    fi
    local ssd_path="$ssd/$dest"
    [ -e "$ssd_path" ] && die "$ssd_path already exists — refusing to clobber"
    run mkdir -p "$(dirname "$ssd_path")"
    say "   moving $local_path -> $ssd_path"
    run mv "$local_path" "$ssd_path"
    run ln -sfn "$ssd_path" "$local_path"
  done

  # 4. Strip ExFAT workarounds (optional).
  if [ "$de_exfat" = "1" ]; then
    say "4/4 Removing ExFAT workarounds (backups in $BACKUP_DIR)"
    run mkdir -p "$BACKUP_DIR"
    local gp="$WORKSPACE_SRC/android/gradle.properties"
    local bg="$WORKSPACE_SRC/android/app/build.gradle.kts"
    if [ -f "$gp" ]; then
      run cp "$gp" "$BACKUP_DIR/gradle.properties.bak"
      # Point buildDir at the SSD instead of the internal disk.
      run sed -i '' -E \
        "s|^android\.buildDir=.*|android.buildDir=$ssd/vpnflow-build|" "$gp"
    fi
    if [ -f "$bg" ]; then
      run cp "$bg" "$BACKUP_DIR/build.gradle.kts.bak"
      # Remove the cleanAppleDoubleDebug task + its comment (ExFAT-only hack).
      run perl -0pi -e 's/\n\s*\/\/ The ExFAT volume[\s\S]*?\n\}\n//' "$bg" \
        || true
    fi
  else
    say "4/4 Skipping config patch (add --de-exfat to remove ExFAT workarounds)"
  fi

  echo
  say "Migration preview/finished. Next steps:"
  echo "  cd $ssd/PrivateVPN && bash scripts/setup-apfs-ssd.sh verify"
  echo "  (older commands in $WORKSPACE_SRC keep working via symlinks)"
}

# ---------------------------------------------------------------- verify
cmd_verify() {
  say "Disk space"
  df -h / /System/Volumes/Data /Volumes/* 2>/dev/null | grep -vE '^map|devfs'
  echo
  say "Symlinks"
  for entry in "${HEAVY_DIRS[@]}"; do
    IFS='|' read -r local_path name dest <<<"$entry"
    [ -L "$local_path" ] && echo "  OK  $local_path -> $(readlink "$local_path")"
  done
  [ -L "$WORKSPACE_SRC/.tools/jdk/temurin-17.jdk" ] && \
    echo "  OK  JDK -> $(readlink "$WORKSPACE_SRC/.tools/jdk/temurin-17.jdk")"
  echo
  say "JDK"
  "$WORKSPACE_SRC/.tools/jdk/temurin-17.jdk/Contents/Home/bin/java" -version 2>&1
  echo
  say "Gradle dry run (compiles Android unit tests)"
  export JAVA_HOME="$WORKSPACE_SRC/.tools/jdk/temurin-17.jdk/Contents/Home"
  (cd "$WORKSPACE_SRC/android" && ./gradlew :app:testDebugUnitTest --dry-run --console=plain) 2>&1 | tail -8
}

# ---------------------------------------------------------------- undo
cmd_undo() {
  local ssd="${1:-}"
  [ -n "$ssd" ] || die "usage: setup-apfs-ssd.sh undo /Volumes/VPNSSD"
  require_rootless
  say "Removing symlinks (SSD data stays intact)"
  for entry in "${HEAVY_DIRS[@]}"; do
    IFS='|' read -r local_path name dest <<<"$entry"
    if [ -L "$local_path" ]; then
      local real; real="$(readlink "$local_path")"
      case "$real" in
        "$ssd/"*)
          run rm "$local_path"
          [ -d "$real" ] && run mv "$real" "$local_path"
          say "   restored $local_path"
          ;;
        *) say "   $local_path -> $real (not this SSD, left alone)" ;;
      esac
    fi
  done
  if [ -f "$BACKUP_DIR/gradle.properties.bak" ]; then
    run cp "$BACKUP_DIR/gradle.properties.bak" "$WORKSPACE_SRC/android/gradle.properties"
    say "   restored android/gradle.properties"
  fi
  if [ -f "$BACKUP_DIR/build.gradle.kts.bak" ]; then
    run cp "$BACKUP_DIR/build.gradle.kts.bak" "$WORKSPACE_SRC/android/app/build.gradle.kts"
    say "   restored android/app/build.gradle.kts"
  fi
  say "Done. Workspace dirs are local again; SSD copy remains at $ssd."
}

# ---------------------------------------------------------------- main
require_rootless
case "${1:-}" in
  detect)  cmd_detect ;;
  format)  cmd_format "${2:?usage: format DISK_ID}" ;;
  migrate) cmd_migrate "${2:-}" "${3:-}" ;;
  verify)  cmd_verify ;;
  undo)    cmd_undo "${2:-}" ;;
  *) cat <<'EOF'
setup-apfs-ssd.sh — move PrivateVPN workspace + toolchains onto an external APFS SSD

Usage:
  bash scripts/setup-apfs-ssd.sh detect
  bash scripts/setup-apfs-ssd.sh format DISK_ID
  bash scripts/setup-apfs-ssd.sh migrate /Volumes/VPNSSD [--de-exfat]
  bash scripts/setup-apfs-ssd.sh verify
  bash scripts/setup-apfs-ssd.sh undo /Volumes/VPNSSD

Env: SSD_NAME (default VPNSSD), WORKSPACE_SRC, SKIP_HEAVY, DRY_RUN=1
EOF
    exit 1 ;;
esac
