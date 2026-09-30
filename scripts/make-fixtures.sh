#!/usr/bin/env bash
# PLAN.md F절 S9 / B절 P0-4 픽스처 생성. FFMPEG 환경변수로 ffmpeg 경로를 덮어쓴다.
set -euo pipefail

FFMPEG="${FFMPEG:-ffmpeg}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/fixtures"
DUR=3
FPS=60
mkdir -p "$OUT"

# 공통 인코딩: H.264, yuv420p, limited range, BT.709 태그(컨테이너 + VUI)
ENC=(-c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -r "$FPS" -an
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv
  -x264-params colorprim=bt709:transfer=bt709:colormatrix=bt709:range=tv
  -movflags +faststart)

# 램프: 상단 70% 수평 0~100% 그라디언트, 하단 30% 11단 계단 패치(0,10,...,100%).
# geq는 limited range 코드값(Y 16~235)으로 직접 그린다.
make_ramp() { # $1=W $2=H
  local w=$1 h=$2
  "$FFMPEG" -hide_banner -loglevel error -y \
    -f lavfi -i "color=c=black:s=${w}x${h}:r=${FPS}:d=${DUR},format=yuv420p" \
    -vf "geq=lum='if(lt(Y,H*0.7),16+219*X/W,16+219*floor(X*11/W)/10)':cb=128:cr=128,format=yuv420p" \
    "${ENC[@]}" "$OUT/ramp-${h}p60.mp4"
}

# 컬러바: smptehdbars(BT.709 기반 SMPTE HD 컬러바)
make_bars() { # $1=W $2=H
  local w=$1 h=$2
  "$FFMPEG" -hide_banner -loglevel error -y \
    -f lavfi -i "smptehdbars=size=${w}x${h}:rate=${FPS}:duration=${DUR},format=yuv420p" \
    "${ENC[@]}" "$OUT/colorbars-${h}p60.mp4"
}

make_ramp 1920 1080
make_ramp 3840 2160
make_bars 1920 1080
make_bars 3840 2160
ls -l "$OUT"/*.mp4
