#!/usr/bin/env bash
# Svelto development entrypoint. Build outside synced source folders to avoid signing metadata.
set -euo pipefail
SVELTO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-run}"
case "$MODE" in run|--verify|--logs|--debug) ;; *) echo "Usage: $0 [run|--verify|--logs|--debug]" >&2; exit 2 ;; esac
ROOT_ID="$(printf '%s' "$SVELTO_ROOT" | shasum -a 256 | cut -c 1-12)"
SVELTO_BUILD_ROOT="${SVELTO_BUILD_ROOT:-${TMPDIR:-/private/tmp}/svelto-development-$ROOT_ID}"
mkdir -p "$SVELTO_BUILD_ROOT" "$SVELTO_ROOT/output"
if [ "$SVELTO_BUILD_ROOT" != "$SVELTO_ROOT" ]; then
  /usr/bin/rsync -a --exclude='.git*' --exclude='.codex' --exclude='/dist/' --exclude='/output/' --exclude='/docs/' --exclude='*.dataless-backup' "$SVELTO_ROOT/" "$SVELTO_BUILD_ROOT/"
fi
cd "$SVELTO_BUILD_ROOT"
if [ "$(uname -m)" = "arm64" ]; then
  BUILD_TASK=buildMacArm
  APP_BUNDLE="$SVELTO_BUILD_ROOT/dist/app/mac-arm64/Svelto.app"
else
  BUILD_TASK=buildMacIntel
  APP_BUNDLE="$SVELTO_BUILD_ROOT/dist/app/mac/Svelto.app"
fi
if [ ! -f node_modules/electron/path.txt ]; then
  node node_modules/electron/install.js
fi
npm run postinstall
pkill -x Svelto >/dev/null 2>&1 || true
npm run "$BUILD_TASK"
printf '%s\n' "$APP_BUNDLE" > "$SVELTO_ROOT/output/build-path.txt"
if [ "$MODE" = "--debug" ]; then
  exec lldb -- "$APP_BUNDLE/Contents/MacOS/Svelto"
fi
open -n "$APP_BUNDLE"
if [ "$MODE" = "--verify" ]; then
  for attempt in 1 2 3 4 5; do
    if pgrep -x Svelto >/dev/null; then echo "Svelto is running: $APP_BUNDLE"; exit 0; fi
    sleep 1
  done
  echo "Svelto did not start." >&2; exit 1
elif [ "$MODE" = "--logs" ]; then
  exec /usr/bin/log stream --info --style compact --predicate 'process == "Svelto"'
fi
