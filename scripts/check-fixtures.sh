#!/usr/bin/env bash
# 픽스처 해상도·fps·pix_fmt·bt709 태그 검사. FFPROBE 환경변수로 경로 덮어쓰기 가능. FAIL 있으면 exit 1.
set -uo pipefail

FFPROBE="${FFPROBE:-ffprobe}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/fixtures"
fail=0

printf '%-24s %-10s %-8s %-8s %-10s %-10s %-10s %-10s %s\n' file res fps pix_fmt primaries transfer space dur result
for spec in ramp-1080p60.mp4:1920x1080:h264 ramp-2160p60.mp4:3840x2160:h264 colorbars-1080p60.mp4:1920x1080:h264 colorbars-2160p60.mp4:3840x2160:h264 ramp-1080p60.webm:1920x1080:vp9; do
  file="${spec%%:*}"; rest="${spec#*:}"; want="${rest%%:*}"; wantcodec="${rest##*:}"; name="${file%.*}"; f="$DIR/$file"
  if [ ! -f "$f" ]; then printf '%-24s missing  FAIL\n' "$file"; fail=1; continue; fi
  # csv는 요청 순서가 아닌 ffprobe 내부 순서로 출력되므로 key=value로 읽는다
  probe=$("$FFPROBE" -v error -select_streams v:0 \
    -show_entries stream=codec_name,width,height,pix_fmt,r_frame_rate,color_primaries,color_transfer,color_space \
    -of default=nw=1 "$f")
  get() { printf '%s\n' "$probe" | sed -n "s/^$1=//p"; }
  codec=$(get codec_name); w=$(get width); h=$(get height); pix=$(get pix_fmt)
  fps=$(get r_frame_rate); prim=$(get color_primaries); trc=$(get color_transfer); space=$(get color_space)
  dur=$("$FFPROBE" -v error -show_entries format=duration -of csv=p=0 "$f")
  ok=PASS
  [ "$codec" = "$wantcodec" ] || ok=FAIL
  [ "${w}x${h}" = "$want" ] || ok=FAIL
  [ "$fps" = "60/1" ] || ok=FAIL
  [ "$pix" = yuv420p ] || ok=FAIL
  [ "$prim" = bt709 ] && [ "$trc" = bt709 ] && [ "$space" = bt709 ] || ok=FAIL
  awk -v d="$dur" 'BEGIN{exit !(d>=11 && d<=13)}' || ok=FAIL
  [ "$ok" = PASS ] || fail=1
  printf '%-24s %-10s %-8s %-8s %-10s %-10s %-10s %-10s %s\n' "$file" "${w}x${h}" "$fps" "$pix" "$prim" "$trc" "$space" "$dur" "$ok"
done
exit $fail
