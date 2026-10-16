#!/usr/bin/env python3
"""Produce a branded Fitdog Owner Portal group-class tutorial from a screen recording."""

from __future__ import annotations

import asyncio
import math
import os
import struct
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

EDGE_VOICE = "en-US-AvaNeural"
EDGE_RATE = "+4%"
CAPTIONS_VTT = Path(
    "/Users/fitdog/Desktop/Digi_white_board/fitdog-gingr-status-board/public/assets/fitdog/owner-portal/group-class-booking-captions.vtt"
)

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
SRC_MOV = ROOT / "src" / "owner-portal-group-class.mov"
OUT_MP4 = Path.home() / "Desktop" / "Fitdog-How-to-Book-a-Group-Class.mp4"
OUT_COPY = ROOT / "Fitdog-How-to-Book-a-Group-Class.mp4"
LOGO_DARK = Path(
    "/Users/fitdog/Desktop/Digi_white_board/fitdog-gingr-status-board/public/assets/fitdog-lobby-whiteboard/01-brand/logo/fitdog-logo-lockup-dark-transparent.png"
)
LOGO_LIGHT = Path(
    "/Users/fitdog/Desktop/Digi_white_board/fitdog-gingr-status-board/public/assets/fitdog-lobby-whiteboard/01-brand/logo/fitdog-logo-lockup-light-transparent.png"
)
BADGE = Path(
    "/Users/fitdog/Desktop/Digi_white_board/fitdog-gingr-status-board/public/assets/fitdog/brand/fitdog-logo-circle-badge-256.png"
)

W, H, FPS = 1920, 1080, 30
TITLE_S = 5.2
END_S = 4.4
SRC_END = 61.8  # before Home / screenshot toolbar
ORANGE = (241, 95, 42)
NAVY = (18, 28, 46)
INK = (22, 28, 42)
WHITE = (255, 255, 255)
CREAM = (247, 244, 239)

# Output-time (after title) step banners keyed to source seconds.
STEPS = [
    (0.0, 3.0, "1", "Select your dog", "Tap your pet, then tap Book."),
    (3.0, 6.4, "2", "Choose Other", "Group classes live under Other."),
    (6.4, 13.6, "3", "Pick your class", "Choose Group Training or Sports Sign Ups."),
    (13.6, 23.4, "4", "Pick date and time", "Select the day, then a van and time."),
    (23.4, 32.0, "5", "How your dog arrives", "Club drop-off, or Fitdog van at home."),
    (32.0, 49.2, "6", "Add notes", "Tell the team anything they should know."),
    (49.2, 56.4, "7", "Review and submit", "Check the details, then Submit Request."),
    (56.4, 99.0, "8", "You're booked", "Fitdog will review and confirm."),
]

VO_LINES = [
    (0.55, "Here's how to book a group class in the Fitdog Owner Portal."),
    (5.45, "First, tap your dog, then tap Book."),
    (9.15, "Choose Other. That is where group classes and sports sign-ups live."),
    (13.4, "Pick the class you want. You can choose a group training class, or sports sign-ups."),
    (18.2, "In this example, we open Sports Sign Ups, then Adventure Hike."),
    (22.6, "Tap the date for your class."),
    (26.4, "Choose a van, then tap a time."),
    (31.6, "Tap Options."),
    (33.6, "Tell us how your dog is getting there. Check Owner Drop Off at Fitdog Club, and Owner Pick Up at Fitdog Club. Use Fitdog to Pick Up at Home if you need the van."),
    (44.2, "Add any notes for the team, then tap Review."),
    (55.4, "Look over the details, then tap Submit Request."),
    (62.2, "You're all set. Fitdog will review the request and confirm. Thanks for booking with Fitdog."),
]


def ffmpeg_exe() -> str:
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        ("/System/Library/Fonts/Avenir Next.ttc", 1 if bold else 0),
        ("/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf", 0),
        ("/System/Library/Fonts/HelveticaNeue.ttc", 1 if bold else 0),
    ]
    last = None
    for path, index in candidates:
        try:
            return ImageFont.truetype(path, size=size, index=index)
        except Exception as exc:  # noqa: BLE001
            last = exc
    raise RuntimeError(last)


def rounded_rect(draw: ImageDraw.ImageDraw, xy, radius: int, fill, outline=None, width=1):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def load_logo(path: Path, height: int) -> Image.Image:
    im = Image.open(path).convert("RGBA")
    w = int(im.width * (height / im.height))
    return im.resize((max(1, w), height), Image.Resampling.LANCZOS)


def make_title_frame(t: float, logo: Image.Image, badge: Image.Image) -> Image.Image:
    im = Image.new("RGB", (W, H), NAVY)
    draw = ImageDraw.Draw(im)
    # subtle orange glow
    glow = Image.new("RGB", (W, H), NAVY)
    g = ImageDraw.Draw(glow)
    g.ellipse((1100, -200, 2100, 800), fill=(48, 32, 28))
    g.ellipse((-400, 600, 700, 1400), fill=(24, 36, 58))
    im = Image.blend(im, glow, 0.55)
    draw = ImageDraw.Draw(im)
    fade = min(1.0, t / 0.6)
    y_shift = int((1 - fade) * 18)

    im.paste(logo, (120, 118 + y_shift), logo)

    title = font(72, bold=True)
    sub = font(34, bold=False)
    small = font(22, bold=True)
    draw.text((120, 300 + y_shift), "How to book a group class", font=title, fill=WHITE)
    draw.text((120, 392 + y_shift), "A quick walkthrough of the Owner Portal.", font=sub, fill=(220, 224, 232))

    pill_w, pill_h = 430, 52
    rounded_rect(draw, (120, 470 + y_shift, 120 + pill_w, 470 + y_shift + pill_h), 26, ORANGE)
    draw.text((120 + 28, 482 + y_shift), "OWNER PORTAL  ·  FITDOG", font=small, fill=WHITE)

    steps = [
        "Select your dog",
        "Choose Other, then your class",
        "Pick a date and time",
        "Set drop-off and pick-up",
        "Add notes and submit",
    ]
    y = 580
    for i, s in enumerate(steps, 1):
        rounded_rect(draw, (120, y, 168, y + 42), 12, (32, 46, 72))
        draw.text((136, y + 8), str(i), font=font(22, True), fill=ORANGE)
        draw.text((188, y + 6), s, font=font(26), fill=WHITE)
        y += 58

    draw.rectangle((0, H - 8, int(W * min(1.0, t / TITLE_S)), H), fill=ORANGE)
    return im


def make_end_frame(t: float, logo: Image.Image, badge: Image.Image) -> Image.Image:
    im = Image.new("RGB", (W, H), NAVY)
    glow = Image.new("RGB", (W, H), NAVY)
    g = ImageDraw.Draw(glow)
    g.ellipse((900, 200, 1900, 1200), fill=(52, 34, 28))
    im = Image.blend(im, glow, 0.45)
    draw = ImageDraw.Draw(im)
    badge_s = badge.resize((118, 118), Image.Resampling.LANCZOS)
    im.paste(badge_s, (901, 200), badge_s)
    lw, lh = logo.size
    im.paste(logo, ((W - lw) // 2, 340), logo)
    title = font(64, True)
    sub = font(30)
    tw = draw.textlength("You're all set", font=title)
    draw.text(((W - tw) / 2, 470), "You're all set", font=title, fill=WHITE)
    msg = "Fitdog will review your request and confirm."
    mw = draw.textlength(msg, font=sub)
    draw.text(((W - mw) / 2, 560), msg, font=sub, fill=(220, 224, 232))
    hint = "Questions? Message the Fitdog team in the Owner Portal."
    hw = draw.textlength(hint, font=font(22))
    draw.text(((W - hw) / 2, 720), hint, font=font(22), fill=(168, 176, 190))
    return im


def overlay_chrome(frame: Image.Image, src_t: float, logo: Image.Image) -> Image.Image:
    im = frame.convert("RGBA")
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)

    # top bar
    d.rectangle((0, 0, W, 64), fill=(18, 28, 46, 236))
    d.rectangle((0, 64, W, 68), fill=ORANGE + (255,))
    small_logo = logo.resize((int(logo.width * 32 / logo.height), 32), Image.Resampling.LANCZOS)
    overlay.paste(small_logo, (28, 16), small_logo)
    d.text((28 + small_logo.width + 18, 18), "OWNER PORTAL TUTORIAL", font=font(20, True), fill=WHITE + (255,))
    d.text((W - 390, 18), "How to book a group class", font=font(20), fill=(230, 232, 238, 255))

    step = next((s for s in STEPS if s[0] <= src_t < s[1]), STEPS[-1])
    _, _, num, title, blurb = step
    bar_top = H - 118
    d.rounded_rectangle((40, bar_top, W - 40, H - 22), radius=22, fill=(18, 28, 46, 242))
    d.rounded_rectangle((58, bar_top + 16, 126, H - 38), radius=16, fill=ORANGE + (255,))
    label = "✓" if num == "8" else num
    nw = d.textlength(label, font=font(30, True))
    d.text((58 + (68 - nw) / 2, bar_top + 26), label, font=font(30, True), fill=WHITE + (255,))
    d.text((148, bar_top + 14), title, font=font(30, True), fill=WHITE + (255,))
    d.text((148, bar_top + 52), blurb, font=font(22), fill=(214, 218, 226, 255))
    inner = [148, H - 34, W - 58, H - 28]
    d.rounded_rectangle(inner, radius=3, fill=(48, 58, 76, 255))
    prog = min(1.0, max(0.0, src_t / SRC_END))
    d.rounded_rectangle((inner[0], inner[1], inner[0] + int((inner[2] - inner[0]) * prog), inner[3]), radius=3, fill=ORANGE + (255,))

    out = Image.alpha_composite(im, overlay).convert("RGB")
    return out


def wav_duration(dest: Path) -> float:
    with wave.open(str(dest), "rb") as wf:
        return wf.getnframes() / float(wf.getframerate())


def say_to_wav(text: str, dest: Path, rate: int = 168) -> float:
    aiff = dest.with_suffix(".aiff")
    subprocess.check_call(
        ["say", "-v", "Samantha", "-r", str(rate), "-o", str(aiff), text],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    subprocess.check_call(
        ["afconvert", "-f", "WAVE", "-d", "LEI16@44100", str(aiff), str(dest)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    aiff.unlink(missing_ok=True)
    return wav_duration(dest)


async def _edge_tts_save(text: str, mp3: Path) -> None:
    import edge_tts

    communicate = edge_tts.Communicate(text, EDGE_VOICE, rate=EDGE_RATE)
    await communicate.save(str(mp3))


def edge_to_wav(text: str, dest: Path, ff: str) -> float:
    mp3 = dest.with_suffix(".mp3")
    asyncio.run(_edge_tts_save(text, mp3))
    subprocess.check_call(
        [ff, "-y", "-hide_banner", "-loglevel", "error", "-i", str(mp3), "-ar", "44100", "-ac", "1", str(dest)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    mp3.unlink(missing_ok=True)
    return wav_duration(dest)


def speech_to_wav(text: str, dest: Path, ff: str) -> float:
    try:
        return edge_to_wav(text, dest, ff)
    except Exception as exc:  # noqa: BLE001
        print(f"  edge-tts failed ({exc}); falling back to macOS say")
        return say_to_wav(text, dest)


def format_vtt_time(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    h, rem = divmod(ms, 3_600_000)
    m, rem = divmod(rem, 60_000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def write_captions_vtt(durations: list[tuple[float, float, str]]) -> None:
    CAPTIONS_VTT.parent.mkdir(parents=True, exist_ok=True)
    lines = ["WEBVTT", ""]
    for start, end, text in durations:
        lines.append(f"{format_vtt_time(start)} --> {format_vtt_time(end)}")
        lines.append(text)
        lines.append("")
    CAPTIONS_VTT.write_text("\n".join(lines), encoding="utf-8")
    print("wrote captions", CAPTIONS_VTT)


def mix_voiceover(total_s: float, work: Path, ff: str) -> Path:
    sample_rate = 44100
    n = int(total_s * sample_rate) + sample_rate
    mix = np.zeros(n, dtype=np.float64)
    caption_events: list[tuple[float, float, str]] = []
    for i, (start, text) in enumerate(VO_LINES):
        wav_path = work / f"vo_{i:02d}.wav"
        dur = speech_to_wav(text, wav_path, ff)
        caption_events.append((start, start + dur, text))
        print(f"  VO {i:02d} @{start:6.2f}s  {dur:5.2f}s  {text[:64]}")
        with wave.open(str(wav_path), "rb") as wf:
            raw = wf.readframes(wf.getnframes())
            audio = np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768.0
        off = int(start * sample_rate)
        end = min(len(mix), off + len(audio))
        mix[off:end] += audio[: end - off]
    peak = np.max(np.abs(mix)) or 1.0
    mix = np.clip(mix / peak * 0.92, -1, 1)
    out = work / "voiceover.wav"
    pcm = (mix * 32767).astype(np.int16)
    with wave.open(str(out), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm.tobytes())
    write_captions_vtt(caption_events)
    return out


def main() -> int:
    if not SRC_MOV.exists():
        print("missing source", SRC_MOV)
        return 1
    ff = ffmpeg_exe()
    logo = load_logo(LOGO_DARK, 56)
    title_logo = load_logo(LOGO_DARK, 78)
    badge = Image.open(BADGE).convert("RGBA")

    src_frames = int(round(SRC_END * FPS))
    title_frames = int(round(TITLE_S * FPS))
    end_frames = int(round(END_S * FPS))
    total_frames = title_frames + src_frames + end_frames
    total_s = total_frames / FPS
    print(f"timeline {total_s:.2f}s  ({total_frames} frames)")

    work = ROOT / "build"
    work.mkdir(exist_ok=True)
    print(f"recording voiceover ({EDGE_VOICE})…")
    vo = mix_voiceover(total_s, work, ff)

    decode = subprocess.Popen(
        [
            ff,
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(SRC_MOV),
            "-ss",
            "0",
            "-t",
            f"{SRC_END}",
            "-vf",
            "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    encode = subprocess.Popen(
        [
            ff,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-s",
            f"{W}x{H}",
            "-r",
            str(FPS),
            "-i",
            "-",
            "-i",
            str(vo),
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-crf",
            "17",
            "-preset",
            "medium",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-shortest",
            "-movflags",
            "+faststart",
            str(OUT_MP4),
        ],
        stdin=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert decode.stdout and encode.stdin
    frame_bytes = W * H * 3

    print("writing title…")
    for i in range(title_frames):
        t = i / FPS
        img = make_title_frame(t, title_logo, badge)
        encode.stdin.write(img.tobytes())

    print("compositing portal recording…")
    for i in range(src_frames):
        raw = decode.stdout.read(frame_bytes)
        if len(raw) < frame_bytes:
            print(f"decode ended early at frame {i}")
            raw = raw + b"\x00" * (frame_bytes - len(raw))
        arr = np.frombuffer(raw, dtype=np.uint8).reshape((H, W, 3)).copy()
        frame = Image.fromarray(arr, "RGB")
        src_t = i / FPS
        out = overlay_chrome(frame, src_t, logo)
        encode.stdin.write(out.tobytes())
        if i % 90 == 0:
            print(f"  {src_t:5.1f}s")

    decode.stdout.close()
    decode.wait()

    print("writing end card…")
    for i in range(end_frames):
        img = make_end_frame(i / FPS, title_logo, badge)
        encode.stdin.write(img.tobytes())

    encode.stdin.close()
    err = encode.stderr.read().decode("utf-8", "ignore") if encode.stderr else ""
    code = encode.wait()
    if code != 0:
        print("ffmpeg encode failed", code, err)
        return code
    import shutil

    shutil.copy2(OUT_MP4, OUT_COPY)
    print("wrote", OUT_MP4, OUT_MP4.stat().st_size)
    print("copy", OUT_COPY)
    return 0


if __name__ == "__main__":
    sys.exit(main())
