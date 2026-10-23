"""Seam carving untuk membuat badan ramping (dipakai process_character.py)."""
import numpy as np


def energy(s):
    rgb = s[..., :3].astype(float)
    a = s[..., 3] > 0
    gx = np.abs(np.diff(rgb, axis=1, append=rgb[:, -1:])).sum(-1) + np.abs(np.diff(rgb, axis=1, prepend=rgb[:, :1])).sum(-1)
    gy = np.abs(np.diff(rgb, axis=0, append=rgb[-1:])).sum(-1)
    e = gx + 0.5 * gy
    # lindungi siluet: kolom di mana piksel ini bertetangga dengan transparan
    edge = a & ~(np.roll(a, 1, 1) & np.roll(a, -1, 1))
    e[edge] += 1e6
    e[~a] = 0                       # transparan murah (tetap boleh dilalui)
    return e


def remove_seam(s, x_lo, x_hi):
    """Buang satu seam vertikal yang dibatasi di kolom [x_lo, x_hi)."""
    h, w = s.shape[:2]
    e = energy(s)
    big = 1e9
    cost = np.full((h, w), big)
    cost[0, x_lo:x_hi] = e[0, x_lo:x_hi]
    back = np.zeros((h, w), int)
    for y in range(1, h):
        for x in range(x_lo, x_hi):
            best, bx = big, x
            for dx in (-1, 0, 1):
                px = x + dx
                if x_lo <= px < x_hi and cost[y - 1, px] < best:
                    best, bx = cost[y - 1, px], px
            cost[y, x] = best + e[y, x]
            back[y, x] = bx
    x = int(np.argmin(cost[-1, x_lo:x_hi])) + x_lo
    out = np.zeros((h, w - 1, 4), int)
    for y in range(h - 1, -1, -1):
        out[y] = np.delete(s[y], x, axis=0)
        x = back[y, x]
    return out


def slim(s, n=2):
    for i in range(n):
        h, w = s.shape[:2]
        # kiri dan kanan badan bergantian, hindari garis tengah (ritsleting/kancing)
        lo, hi = (int(w * 0.18), int(w * 0.45)) if i % 2 == 0 else (int(w * 0.55), int(w * 0.82))
        s = remove_seam(s, lo, hi)
    return s


