#!/bin/sh
# 写真を粒子グリッドの実寸・グレースケール・WebP に変換して public/photos へ書き出す。
#
#   ./scripts/encode-photos.sh ~/path/to/originals
#
# 粒子は輝度しか使わず、配信解像度より細かい画素は捨てられるので、
# 配信するのはこの形が最小になる（カラー1536px比で約1/10、デコードは約4倍速い）。
# 必要なツール: imagemagick, cwebp
set -eu

SRC=${1:?使い方: ./scripts/encode-photos.sh <原本のディレクトリ>}
DST=$(cd "$(dirname "$0")/.." && pwd)/public/photos
QUALITY=${QUALITY:-92}

# 配信解像度は src/table.ts を唯一の出典にする
TABLE=$(cd "$(dirname "$0")/.." && pwd)/src/hero/table.ts
W=$(grep "export const SOURCE_W" "$TABLE" | sed "s/[^0-9]//g")
H=$(grep "export const SOURCE_H" "$TABLE" | sed "s/[^0-9]//g")

mkdir -p "$DST"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

for f in "$SRC"/*.jpg "$SRC"/*.jpeg "$SRC"/*.png; do
  [ -e "$f" ] || continue
  name=$(basename "$f"); name=${name%.*}
  # 中央基準で切り出してグリッド実寸へ。全写真が同じアスペクトである必要がある
  magick "$f" -resize "${W}x${H}^" -gravity center -extent "${W}x${H}" -colorspace Gray "$tmp/$name.png"
  cwebp -quiet -q "$QUALITY" "$tmp/$name.png" -o "$DST/$name.webp"
  printf '%s  %s bytes\n' "$name.webp" "$(wc -c < "$DST/$name.webp" | tr -d ' ')"
done
