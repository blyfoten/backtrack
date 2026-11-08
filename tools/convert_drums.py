#!/usr/bin/env python3
"""Convert ~/git/drumsamples (24-bit stereo WAV) into small 16-bit WAVs for the browser.

Only the instruments the grooves use are copied. Silent tails are trimmed (with a short fade),
long cymbals are capped, and one shared gain is applied so relative levels between velocity
layers are kept. Usage: python3 tools/convert_drums.py [SRC_DIR] [OUT_DIR]
"""
import array, os, sys, wave

SRC = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else '~/git/drumsamples')
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', 'samples')
NAMES = ['kick', 'snare', 'snare_rim', 'hihat_closed', 'hihat_open', 'ride', 'crash']
VELS = ['040', '085', '127']
MONO = {'kick', 'snare', 'snare_rim'}   # near-identical channels; fold to mono to halve the size
MAX_SEC = {'ride': 1.8, 'crash': 2.5, 'hihat_open': 1.0}
TAIL_DB = -60          # trim once the signal stays below this (relative to that file's peak)
FADE_SEC = 0.03
TARGET_PEAK = 0.9


def read24(path):
    w = wave.open(path)
    assert w.getsampwidth() == 3, path
    ch, rate, raw = w.getnchannels(), w.getframerate(), w.readframes(w.getnframes())
    # sign-extend 24-bit little endian into 32-bit ints
    pad = bytearray(len(raw) // 3 * 4)
    pad[1::4], pad[2::4], pad[3::4] = raw[0::3], raw[1::3], raw[2::3]
    s = array.array('i', bytes(pad))
    if sys.byteorder == 'big': s.byteswap()
    return ch, rate, [v / 2147483648 for v in s]


def main():
    os.makedirs(OUT, exist_ok=True)
    files = {}
    for n in NAMES:
        for v in VELS:
            ch, rate, s = read24(os.path.join(SRC, f'{n}_v{v}.wav'))
            if n in MONO and ch == 2: ch, s = 1, [(a + b) / 2 for a, b in zip(s[0::2], s[1::2])]
            files[f'{n}_v{v}'] = (ch, rate, s)
    gain = TARGET_PEAK / max(max(map(abs, s)) for _, _, s in files.values())
    total = 0
    for name, (ch, rate, s) in files.items():
        peak = max(map(abs, s)) or 1
        thr = peak * 10 ** (TAIL_DB / 20)
        frames = len(s) // ch
        end = frames
        while end > 0 and max(abs(s[(end - 1) * ch + c]) for c in range(ch)) < thr: end -= 1
        cap = MAX_SEC.get(name.rsplit('_v', 1)[0])
        if cap: end = min(end, int(cap * rate))
        fade = int(FADE_SEC * rate)
        out = array.array('h', bytes(end * ch * 2))
        for i in range(end):
            f = gain * min(1.0, (end - i) / fade)
            for c in range(ch):
                out[i * ch + c] = max(-32767, min(32767, round(s[i * ch + c] * f * 32767)))
        if sys.byteorder == 'big': out.byteswap()
        path = os.path.join(OUT, name + '.wav')
        with wave.open(path, 'wb') as w:
            w.setnchannels(ch); w.setsampwidth(2); w.setframerate(rate); w.writeframes(out.tobytes())
        total += os.path.getsize(path)
        print(f'{name:20s} {end / rate:5.2f}s')
    print(f'gain {gain:.2f}, total {total / 1e6:.1f} MB')


if __name__ == '__main__':
    main()
