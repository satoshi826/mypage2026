#!/bin/sh
# 原本から、サイトで使う派生画像を書き出し、一覧 src/photos/manifest.json を生成する。
#
#   ./scripts/encode-photos.sh ~/path/to/originals
#
# | 派生      | 置き場          | 形 |
# |-----------|-----------------|----|
# | photos 用 | public/gallery/ | 長辺 LONG px、カラー、トリミングなし。全部 |
# | hero 用   | public/photos/  | 粒子グリッド実寸（src/hero/table.ts の SOURCE_W/H）、中央トリミング、
# |           |                 | グレースケール。manifest で hero: true のものだけ |
#
# カテゴリと hero の選択は既存の manifest から引き継ぐ。新規の写真は彩度で color / street を
# 仮置きし、hero は false。手で manifest.json を編集して調整する。
# 必要なツール: imagemagick, cwebp
set -eu

SRC=${1:?使い方: ./scripts/encode-photos.sh <原本のディレクトリ>}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
GALLERY=${GALLERY:-$ROOT/public/gallery}
HERO=${HERO:-$ROOT/public/photos}
LIST=${LIST:-$ROOT/src/photos/manifest.json}
LONG=${LONG:-2000}
QUALITY=${QUALITY:-82}
HERO_QUALITY=${HERO_QUALITY:-92}
# 平均彩度（HSL の S、0〜1）がこれを超えたらカラー扱い
COLOR_THRESHOLD=${COLOR_THRESHOLD:-0.08}

# hero の配信解像度は src/hero/table.ts を唯一の出典にする
TABLE=$ROOT/src/hero/table.ts
W=$(grep "export const SOURCE_W" "$TABLE" | sed "s/[^0-9]//g")
H=$(grep "export const SOURCE_H" "$TABLE" | sed "s/[^0-9]//g")

mkdir -p "$GALLERY" "$HERO" "$(dirname "$LIST")"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

prev=$([ -f "$LIST" ] && cat "$LIST" || echo '[]')
# 既存の manifest から file の行を引く。なければ空
lookup() { printf '%s' "$prev" | grep "\"file\": *\"$1\"" || true; }

count=0
printf '[\n' > "$tmp/list.json"
for f in "$SRC"/*; do
  [ -f "$f" ] || continue
  case $(printf '%s' "${f##*.}" | tr '[:upper:]' '[:lower:]') in
    jpg | jpeg | png) ;;
    *) continue ;;
  esac
  name=$(basename "$f"); name=${name%.*}
  line=$(lookup "$name")
  category=$(printf '%s' "$line" | sed -n 's/.*"category": *"\([a-z]*\)".*/\1/p')
  hero=false
  printf '%s' "$line" | grep -q '"hero": *true' && hero=true
  if [ -z "$category" ]; then
    sat=$(magick "$f" -define jpeg:size=400x400 -resize 200x200 -colorspace HSL -channel G -separate -format '%[fx:mean]' info:)
    category=$(awk -v s="$sat" -v t="$COLOR_THRESHOLD" 'BEGIN{print (s>t)?"color":"street"}')
  fi

  # photos 用: 長辺を LONG に。縦横は保ったまま
  magick "$f" -auto-orient -resize "${LONG}x${LONG}>" -strip "$tmp/$name.png"
  cwebp -quiet -q "$QUALITY" "$tmp/$name.png" -o "$GALLERY/$name.webp"
  read -r w h <<EOS
$(magick identify -format '%w %h' "$GALLERY/$name.webp")
EOS
  # hero 用: 中央基準で切り出してグリッド実寸へ、グレースケール
  if [ "$hero" = true ]; then
    magick "$f" -auto-orient -resize "${W}x${H}^" -gravity center -extent "${W}x${H}" -colorspace Gray "$tmp/$name-hero.png"
    cwebp -quiet -q "$HERO_QUALITY" "$tmp/$name-hero.png" -o "$HERO/$name.webp"
  fi

  [ "$count" -gt 0 ] && printf ',\n' >> "$tmp/list.json"
  printf '  {"file": "%s", "w": %s, "h": %s, "category": "%s", "hero": %s}' "$name" "$w" "$h" "$category" "$hero" >> "$tmp/list.json"
  printf '%s  %sx%s  %s  hero=%s\n' "$name" "$w" "$h" "$category" "$hero"
  count=$((count + 1))
done
printf '\n]\n' >> "$tmp/list.json"

[ "$count" -gt 0 ] || { echo "$SRC に jpg / jpeg / png がない" >&2; exit 1; }
mv "$tmp/list.json" "$LIST"
echo "$count 枚を書き出し、$LIST を更新した"
