"""S7: 프레임 예산 모델 (메모리 대역폭 기준). 근거: PLAN.md F절 S7, '확정된 사용자 환경' 절.

기준 하드웨어: Apple M1 Pro GPU, 메모리 대역폭 약 200 GB/s (PLAN.md). XDR 네이티브 해상도:
14" 3024x1964, 16" 3456x2234. 프레임 예산 = 1000/60 = 16.6 ms.
이 모델은 대역폭만 본다(ALU/셰이더 시간, 디코더, 전력 제한은 미포함). 클라우드에서 검증 불가이며
0a 실측(P0-4 gpuMs/JS p95)과 2배 이상 괴리하면 Opus 에스컬레이션(PLAN.md F절).

임의로 정한 사항 (계획에 수치 없음, 모두 가정):
  - 캔버스 = 소스와 '표시 콘텐츠 사각형(16:9 를 디스플레이에 contain 맞춤, 네이티브 픽셀)' 의 축별 min.
    PLAN.md 의 min(원본 해상도, 표시 크기 x DPR) 을 종횡비를 유지하는 축별 min 으로 해석.
    "소스 해상도" 시나리오는 표시 제한 없이 캔버스 = 소스.
  - 캔버스 픽셀 8 B (rgba16float).
  - 프레임당 트래픽 = 소스 프레임 읽기(NV12 8bit, 1.5 B/px x 소스 픽셀)
      + 캔버스 쓰기(8 B/px) + 컴포지터의 캔버스 읽기(8 B/px)
      + 원본 video 레이어 읽기(4 B/px x 콘텐츠 사각형, 숨기지 않은 경우; PLAN.md G3 가 '원본 video 레이어 처리 검토' 를 언급)
      + 페이지 UI 레이어 읽기(4 B/px x 디스플레이 전체, 1 레이어)
      + 프레임버퍼 쓰기(8 B/px x 디스플레이 전체, EDR fp16 가정).
    디스플레이 스캔아웃 읽기와 디코더 쓰기는 포함하지 않는다. 캐시 히트/타일 압축은 무시(상한 추정에 가깝다).
  - 실효 대역폭 효율 60% 를 보수 시나리오로 함께 표시(임의).
"""

from dataclasses import dataclass

from sim._md import md_table

BW_GBPS = 200.0  # M1 Pro (PLAN.md)
EFF = 0.6  # 임의
FPS = 60
BUDGET_MS = 1000.0 / FPS
CANVAS_BPP = 8
SRC_BPP = 1.5
VIDEO_LAYER_BPP = 4
UI_BPP = 4
FB_BPP = 8

SOURCES = {"1080p": (1920, 1080), "1440p": (2560, 1440), "2160p": (3840, 2160)}
DISPLAYS = {"XDR 14": (3024, 1964), "XDR 16": (3456, 2234)}


def content_rect(disp, aspect=(16, 9)):
    """디스플레이에 종횡비를 유지해 contain 맞춤한 사각형 (정수 픽셀)."""
    w, h = disp
    if w * aspect[1] <= h * aspect[0]:
        return w, int(w * aspect[1] / aspect[0])
    return int(h * aspect[0] / aspect[1]), h


def canvas_size(src, disp=None):
    if disp is None:
        return src
    cw, ch = content_rect(disp)
    return min(src[0], cw), min(src[1], ch)


@dataclass
class Row:
    label: str
    src: tuple
    canvas: tuple
    disp: tuple
    canvas_mb: float
    canvas_gbps: float
    total_gbps: float
    ms_peak: float
    ms_eff: float

    @property
    def pct_peak(self):
        return self.ms_peak / BUDGET_MS * 100

    @property
    def pct_eff(self):
        return self.ms_eff / BUDGET_MS * 100


def model(label, src, disp, fps=FPS, bw=BW_GBPS, eff=EFF, hide_video_layer=False):
    """disp=None 이면 표시 제한 없음(캔버스=소스), 이 경우 콘텐츠=소스, 디스플레이=소스 크기로 본다."""
    canvas = canvas_size(src, disp)
    d = disp if disp is not None else src
    content = content_rect(disp) if disp is not None else src
    cpx = canvas[0] * canvas[1]
    bytes_frame = (
        src[0] * src[1] * SRC_BPP
        + cpx * CANVAS_BPP
        + cpx * CANVAS_BPP
        + (0 if hide_video_layer else content[0] * content[1] * VIDEO_LAYER_BPP)
        + d[0] * d[1] * UI_BPP
        + d[0] * d[1] * FB_BPP
    )
    total_gbps = bytes_frame * fps / 1e9
    ms_peak = bytes_frame / (bw * 1e9) * 1e3
    return Row(label, src, canvas, d, cpx * CANVAS_BPP / 1e6, cpx * CANVAS_BPP * fps / 1e9, total_gbps, ms_peak, bytes_frame / (bw * eff * 1e9) * 1e3)


def scenarios(**kw):
    rows = []
    for sn, s in SOURCES.items():
        rows.append(model(f"{sn} 소스 해상도", s, None, **kw))
    for dn, d in DISPLAYS.items():
        for sn, s in SOURCES.items():
            rows.append(model(f"{sn} 소스 / {dn} 전체화면", s, d, **kw))
    return rows


def report():
    lines = [
        "### S7 프레임 예산 (M1 Pro 약 200 GB/s, 60 fps, 예산 16.6 ms)",
        "",
        f"대역폭 모델만 반영 (ALU/디코더 제외). 효율 {EFF:.0%} 열은 임의 가정. 캔버스 열은 캔버스 해상도 x 8 B x 60 fps.",
        "",
    ]
    for title, kw in (("원본 video 레이어 유지", {}), ("원본 video 레이어 숨김", {"hide_video_layer": True})):
        lines += [f"{title}:", ""]
        rows = [
            [r.label, f"{r.canvas[0]}x{r.canvas[1]}", r.canvas[0] * r.canvas[1] / 1e6, r.canvas_mb, r.canvas_gbps,
             r.total_gbps, r.ms_peak, r.pct_peak, r.ms_eff, r.pct_eff]
            for r in scenarios(**kw)
        ]
        lines.append(md_table(["시나리오", "캔버스", "캔버스 MPix", "캔버스 MB/프레임", "캔버스 8B x fps GB/s", "합성 포함 총 GB/s",
                               "ms (200 GB/s)", "예산 %", f"ms ({EFF:.0%} 효율)", "예산 % (효율)"], rows))
        lines.append("")
    return "\n".join(lines).rstrip()


if __name__ == "__main__":
    print(report())
