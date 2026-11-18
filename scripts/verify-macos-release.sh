#!/usr/bin/env bash
set -euo pipefail

dmg=${1:?Falta la ruta del DMG.}
arch=${2:?Falta la arquitectura.}
team=${3:?Falta el Team ID de Apple.}
version=${4:?Falta la versión.}

case "$arch" in
  arm64) macho_arch=arm64 ;;
  x64) macho_arch=x86_64 ;;
  *) printf 'Arquitectura desconocida: %s\n' "$arch" >&2; exit 1 ;;
esac
if [[ ! "$team" =~ ^[A-Z0-9]{10}$ ]]; then
  printf 'El Team ID de Apple no es válido.\n' >&2
  exit 1
fi

requirement="anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] exists and certificate leaf[field.1.2.840.113635.100.6.1.13] exists and certificate leaf[subject.OU] = \"$team\""
codesign --verify --strict --verbose=2 -R="$requirement" "$dmg"
xcrun stapler validate "$dmg"
spctl --assess --type open --context context:primary-signature --verbose=2 "$dmg"

mountpoint=$(mktemp -d "${TMPDIR:-/tmp}/openroute-dmg.XXXXXX")
mounted=0
cleanup() {
  if (( mounted )); then
    hdiutil detach "$mountpoint" >/dev/null || return 1
  fi
  rmdir "$mountpoint"
}
trap cleanup EXIT
hdiutil attach -nobrowse -readonly -mountpoint "$mountpoint" "$dmg"
mounted=1

app="$mountpoint/OpenRoute.app"
codesign --verify --deep --strict --all-architectures --verbose=2 "$app"
codesign --verify --strict -R="$requirement and identifier \"es.openroute.app\"" "$app"
plist="$app/Contents/Info.plist"
app_version=$(plutil -extract CFBundleShortVersionString raw -o - "$plist")
if [[ "$app_version" != "$version" ]]; then
  printf 'El DMG contiene la versión %s. Se esperaba %s.\n' "$app_version" "$version" >&2
  exit 1
fi
app_arch=$(lipo -archs "$app/Contents/MacOS/OpenRoute")
if [[ "$app_arch" != "$macho_arch" ]]; then
  printf 'El DMG contiene arquitectura %s. Se esperaba %s.\n' "$app_arch" "$macho_arch" >&2
  exit 1
fi

signature=$(codesign --display --verbose=4 "$app" 2>&1)
if [[ ! "$signature" =~ flags=[^[:space:]]*\(.*runtime.*\) ]]; then
  printf 'La firma de OpenRoute no habilita el hardened runtime.\n' >&2
  exit 1
fi
xcrun stapler validate "$app"
spctl --assess --type execute --verbose=2 "$app"
