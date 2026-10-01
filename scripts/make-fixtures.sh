#!/usr/bin/env bash
# PLAN.md F절 S9 / B절 P0-4 픽스처 생성. FFMPEG 환경변수로 ffmpeg 경로를 덮어쓴다.
set -euo pipefail

FFMPEG="${FFMPEG:-ffmpeg}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/fixtures"
DUR=12
FPS=60
mkdir -p "$OUT"

# 공통 인코딩: H.264, yuv420p, limited range, BT.709 태그(컨테이너 + VUI)
ENC=(-c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -r "$FPS" -an
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv
  -x264-params colorprim=bt709:transfer=bt709:colormatrix=bt709:range=tv
  -movflags +faststart)

# 프레임 식별용 이동 박스: 우하단 모서리(가장자리 여백 안쪽)의 30x24 격자를 프레임 번호 N으로 순회한다.
# 720칸 = 12초x60fps이므로 모든 프레임에서 위치가 서로 다르다(DUR/FPS를 바꾸면 격자도 맞춘다).
# drawbox의 t는 시간이 아니라 두께라 프레임 수식을 쓸 수 없으므로 geq(N)로 luma만 칠한다.
# 회색(luma 126)은 램프 마지막 패치(흰색)와 컬러바 우하단(검정 계열) 모두에서 보인다.
# 램프 계단 패치 11개 중 마지막 패치의 우하단 모서리만 좁게 덮고, 컬러바 색 영역(상단·중단)은 덮지 않는다.
# $1=H (1080 기준 보폭 2, 박스 12, 여백 8px를 H/1080으로 배율). geq 조건식(따옴표 없음)을 출력한다.
boxcond() {
  local step=$((2 * $1 / 1080)) bs=$((12 * $1 / 1080)) m=$((8 * $1 / 1080))
  local x0="(W-${m}-${bs}-29*${step}+mod(N,30)*${step})" y0="(H-${m}-${bs}-23*${step}+floor(N/30)*${step})"
  echo "gte(X,${x0})*lt(X,${x0}+${bs})*gte(Y,${y0})*lt(Y,${y0}+${bs})"
}
BOXY=126

# 램프: 상단 70% 수평 0~100% 그라디언트, 하단 30% 11단 계단 패치(0,10,...,100%).
# geq는 limited range 코드값(Y 16~235)으로 직접 그린다.
make_ramp() { # $1=W $2=H
  local w=$1 h=$2 box
  box=$(boxcond "$h")
  "$FFMPEG" -hide_banner -loglevel error -y \
    -f lavfi -i "color=c=black:s=${w}x${h}:r=${FPS}:d=${DUR},format=yuv420p" \
    -vf "geq=lum='if(${box},${BOXY},if(lt(Y,H*0.7),16+219*X/W,16+219*floor(X*11/W)/10))':cb=128:cr=128,format=yuv420p" \
    "${ENC[@]}" "$OUT/ramp-${h}p60.mp4"
}

# 컬러바: smptehdbars(BT.709 기반 SMPTE HD 컬러바)
make_bars() { # $1=W $2=H
  local w=$1 h=$2 box
  box=$(boxcond "$h")
  "$FFMPEG" -hide_banner -loglevel error -y \
    -f lavfi -i "smptehdbars=size=${w}x${h}:rate=${FPS}:duration=${DUR},format=yuv420p,geq=lum='if(${box},${BOXY},lum(X,Y))':cb='cb(X,Y)':cr='cr(X,Y)',format=yuv420p" \
    "${ENC[@]}" "$OUT/colorbars-${h}p60.mp4"
}

make_ramp 1920 1080
make_ramp 3840 2160
make_bars 1920 1080
make_bars 3840 2160

# VP9 대조 픽스처(FIX_GUIDE N3): 기존 ramp-1080p60.mp4를 입력으로 재인코딩한다.
# 이유: geq를 720프레임 1080p에 다시 돌리는 것보다 빠르고, 램프·이동 박스 내용이 mp4와 정확히 같다(내용 동일성).
# 반드시 make_ramp 1920 1080 뒤에 실행한다. limited range·bt709 태그를 명시해 유지한다. 2160p VP9는 만들지 않는다.
make_ramp_vp9() {
  "$FFMPEG" -hide_banner -loglevel error -y -i "$OUT/ramp-1080p60.mp4" \
    -c:v libvpx-vp9 -b:v 0 -crf 32 -deadline good -cpu-used 2 -row-mt 1 \
    -pix_fmt yuv420p -r "$FPS" -an \
    -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
    "$OUT/ramp-1080p60.webm"
}
make_ramp_vp9

# VP9 2160p 입력 방식 실험 픽스처(FIX_GUIDE Q3): 기존 ramp-2160p60.mp4를 재인코딩한다(내용 동일).
# 빠른 인코딩을 위해 -deadline good -cpu-used 5와 -row-mt 1을 쓴다. 반드시 make_ramp 3840 2160 뒤에 실행한다.
# G3 일괄 측정(MATRIX_FIXTURES)에는 넣지 않는다.
make_ramp_vp9_2160() {
  "$FFMPEG" -hide_banner -loglevel error -y -i "$OUT/ramp-2160p60.mp4" \
    -c:v libvpx-vp9 -b:v 0 -crf 32 -deadline good -cpu-used 5 -row-mt 1 \
    -pix_fmt yuv420p -r "$FPS" -an \
    -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
    "$OUT/ramp-2160p60.webm"
}
make_ramp_vp9_2160
ls -l "$OUT"/*.mp4 "$OUT"/*.webm
