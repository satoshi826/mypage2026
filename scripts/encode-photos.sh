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

count=0
for f in "$SRC"/*; do
  [ -f "$f" ] || continue
  # 拡張子は大文字小文字を問わない。カメラの書き出しは .JPG のことが多い
  case $(printf '%s' "${f##*.}" | tr '[:upper:]' '[:lower:]') in
    jpg | jpeg | png) ;;
    *) continue ;;
  esac
  name=$(basename "$f"); name=${name%.*}
  # 中央基準で切り出してグリッド実寸へ。全写真が同じアスペクトである必要がある
  magick "$f" -resize "${W}x${H}^" -gravity center -extent "${W}x${H}" -colorspace Gray "$tmp/$name.png"
  cwebp -quiet -q "$QUALITY" "$tmp/$name.png" -o "$DST/$name.webp"
  printf '%s  %s bytes\n' "$name.webp" "$(wc -c < "$DST/$name.webp" | tr -d ' ')"
  count=$((count + 1))
done

# 1枚も変換しないまま正常終了すると、書き出し先を空にしたことに気づけない
[ "$count" -gt 0 ] || { echo "$SRC に jpg / jpeg / png がない" >&2; exit 1; }
echo "$count 枚を $DST へ書き出した"

