#!/usr/bin/env bash
# Fetch and prepare the bass samples in samples/bass/.
#
# Source: https://github.com/sfzinstruments/karoryfer.black-and-blue-basses
#         "darkblack" electric bass, regular plucks. Licence: CC0-1.0 (public domain).
#
# The library's file names use an octave number one HIGHER than scientific pitch:
# darkblack_e2_*.wav sounds E1 (41.2 Hz), checked by analysing the harmonics, so the
# rule is  midi = octave_digit * 12 + pitch_class  (b1 -> 23, e2 -> 28).
#
# Keeps B0 to B2 (MIDI 23-47), the range Backtrack's bass plays in, at two strengths:
# mp (softer) and f (harder). 24 kHz is plenty for a bass and halves the download.
#
# Needs curl and ffmpeg.  Usage:  tools/fetch_bass.sh [outdir]
set -euo pipefail

OUT="${1:-samples/bass}"
BASE="https://raw.githubusercontent.com/sfzinstruments/karoryfer.black-and-blue-basses/main/Samples/darkblack/reg"
LAYERS="mp f"
TRIM=2.0    # seconds kept per note
FADE=0.03   # fade at the cut, so it does not click
RATE=24000

command -v curl   >/dev/null || { echo "curl not found"   >&2; exit 1; }
command -v ffmpeg >/dev/null || { echo "ffmpeg not found" >&2; exit 1; }

mkdir -p "$OUT"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
FADE_START="$(awk -v t="$TRIM" -v f="$FADE" 'BEGIN{printf "%.3f", t-f}')"
NAMES=(c db d eb e f gb g ab a bb b)

for midi in $(seq 23 47); do
  name="${NAMES[$((midi % 12))]}$((midi / 12))"
  for layer in $LAYERS; do
    src="darkblack_${name}_${layer}_rr1.wav"
    curl -fsSL -o "$TMP/$src" "$BASE/$src"
    ffmpeg -y -loglevel error -i "$TMP/$src" -ac 1 -ar "$RATE" -c:a pcm_s16le \
      -af "atrim=0:${TRIM},afade=t=out:st=${FADE_START}:d=${FADE}" "$OUT/bass_${midi}_${layer}.wav"
  done
done
du -sh "$OUT"
