#!/usr/bin/env python3
"""Run after any .ogg changes (lesson VO: assets/vo, assets/vo/hi --mode voice; Part 2: game/assets/audio vo-lines*.ogg voice, bgm music, the rest sfx).
MP3 twins for Ogg files, timed to match: LAME's 1105-sample priming (encoder + decoder delay, no LAME tag
from lameenc) is cut from the front of the input, so a decoded twin lines up with its Ogg sample for sample
(sprite windows and word timings stay valid).
  --mode voice: mono 24 kHz 64 kbps | sfx: 44.1 kHz, channels kept, 96 kbps | music: 32 kHz stereo 80 kbps
~/.cache/popo-voice311/bin/python part1-swiftee-lesson/tools/mp3-twins.py --mode voice <files/dirs...>"""
import sys, os, argparse, io
import numpy as np, soundfile as sf, lameenc
from math import gcd
from scipy.signal import resample_poly
ap = argparse.ArgumentParser(); ap.add_argument('--mode', default='voice'); ap.add_argument('--force', action='store_true'); ap.add_argument('paths', nargs='+')
a = ap.parse_args()
MODE = {'voice': (24000, 64, 1), 'sfx': (44100, 96, None), 'music': (32000, 80, 2)}[a.mode]
DELAY = 1105
def oggs(p):
    if os.path.isdir(p):
        for f in sorted(os.listdir(p)):
            if f.endswith('.ogg'): yield os.path.join(p, f)
    elif p.endswith('.ogg'): yield p
n = tin = tout = 0; worst = 0
for p in a.paths:
    for src in oggs(p):
        dst = src[:-4] + '.mp3'
        if not a.force and os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src): continue
        x, sr = sf.read(src, dtype='float32', always_2d=True)
        rate, kbps, ch = MODE
        if ch == 1 and x.shape[1] > 1: x = x.mean(axis=1, keepdims=True)
        ch = x.shape[1]
        if sr != rate:
            g = gcd(sr, rate); x = resample_poly(x, rate // g, sr // g, axis=0).astype('float32')
        ref = x
        y = x[DELAY:]
        pcm = (np.clip(y, -1, 1) * 32767).astype('<i2')
        e = lameenc.Encoder(); e.set_bit_rate(kbps); e.set_in_sample_rate(rate); e.set_channels(ch); e.set_quality(2)
        data = e.encode(pcm.tobytes()) + e.flush()
        open(dst, 'wb').write(data)
        # check: decoded twin vs the original, same length within a frame and lined up
        z, zr = sf.read(io.BytesIO(data), dtype='float32', always_2d=True)
        m = min(len(ref), len(z)) - 4000
        if m > 4000:
            r0, z0 = ref[:m, 0], z[:m, 0]
            lag = max(range(-60, 61), key=lambda d: float(np.dot(r0[2000:m-100], z0[2000+d:m-100+d])))
            worst = max(worst, abs(lag))
        n += 1; tin += os.path.getsize(src); tout += len(data)
print(f'{n} twins; ogg {tin/1e6:.2f} MB -> mp3 {tout/1e6:.2f} MB; worst lag {worst} samples')
