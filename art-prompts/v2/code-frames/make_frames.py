#!/usr/bin/env python3
"""Animation sheets for the R0-04 round-2 art round, derived in code from the owner's winners.

No model, no GPU, no server: deterministic transforms of the winning images.

  enemy/halo-crystal/frames  -> candidates/a/enemy/halo-crystal/frames/edit-<k>.png
      6 frames, 2 rows x 3, 416x416 cells on the winner's own key green. The six satellites
      orbit clockwise around the fixed core by 10 degrees per frame (one sixth of the 60-degree
      hexagon period), so frame 6 -> frame 1 loops. A faint shine band crosses the core.
  fx/black-hole/spin-frames  -> candidates/a/fx/black-hole/spin-frames/edit-<k>.png
      8 frames, 2 rows x 4, 360x360 cells on pure black. The vortex turns clockwise by 45 degrees
      per frame (360/8: the three arms have different colours, so only a full turn loops); the
      dark core and its lilac rim stay fixed and centred.

Usage: python3 -I make_frames.py [--halo-out PATH] [--hole-out PATH] [--preview DIR] [--variant]
Run with -I (isolated mode). Requires numpy, Pillow and scipy.
"""

import argparse
import hashlib
import json
import math
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

REPO = '/home/sites/shmup-cup'
CAND = os.path.join(REPO, 'art-prompts/v2/candidates')
SCRIPT = os.path.abspath(__file__)

HALO_SRC = os.path.join(CAND, 'a/enemy/halo-crystal.png')
HOLE_SRC = os.path.join(CAND, 'a/fx/black-hole.png')

# ---------------------------------------------------------------- helpers


def sha256(path):
    """Hex SHA-256 of a file."""
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def border_mode(rgb, width=40):
    """The most common colour of the image's border strip (the key)."""
    h, w, _ = rgb.shape
    strip = np.concatenate([
        rgb[:width].reshape(-1, 3), rgb[-width:].reshape(-1, 3),
        rgb[:, :width].reshape(-1, 3), rgb[:, -width:].reshape(-1, 3)])
    packed = (strip[:, 0].astype(np.int64) << 16) | (strip[:, 1].astype(np.int64) << 8) | strip[:, 2]
    vals, counts = np.unique(packed, return_counts=True)
    v = int(vals[np.argmax(counts)])
    return np.array([(v >> 16) & 255, (v >> 8) & 255, v & 255], dtype=np.uint8)


def rotate_about(arr, angle_deg, src_center, dst_center, out_shape, order=1):
    """Resample `arr` (H, W) or (H, W, C) float so that `src_center` lands on `dst_center`, turned
    `angle_deg` CLOCKWISE on screen (image y points down). Centres are (y, x). Outside -> 0."""
    a = math.radians(angle_deg)
    c, s = math.cos(a), math.sin(a)
    # Forward (screen-clockwise) rotation in (y, x): y' = s*x + c*y, x' = c*x - s*y.
    # affine_transform wants the inverse: input = M @ output + offset.
    m = np.array([[c, -s], [s, c]])  # inverse rotation in (y, x)
    dst = np.array(dst_center, dtype=float)
    src = np.array(src_center, dtype=float)
    offset = src - m @ dst
    if arr.ndim == 2:
        return ndi.affine_transform(arr, m, offset=offset, output_shape=out_shape, order=order,
                                    mode='constant', cval=0.0)
    chans = [ndi.affine_transform(arr[..., i], m, offset=offset, output_shape=out_shape,
                                  order=order, mode='constant', cval=0.0)
             for i in range(arr.shape[2])]
    return np.stack(chans, axis=-1)


def box_downscale(arr, size):
    """Area-average a float (H, W, C) array to (size, size) with Pillow's BOX filter."""
    chans = []
    for i in range(arr.shape[2]):
        im = Image.fromarray(arr[..., i].astype(np.float32), mode='F')
        chans.append(np.asarray(im.resize((size, size), Image.BOX), dtype=np.float64))
    return np.stack(chans, axis=-1)


def lay_out(frames, cols, rows, cell, bg):
    """Frames (uint8 cell x cell x 3) -> one sheet, left to right then top to bottom."""
    sheet = np.empty((rows * cell, cols * cell, 3), dtype=np.uint8)
    sheet[:] = bg
    for k, f in enumerate(frames):
        r, c = divmod(k, cols)
        sheet[r * cell:(r + 1) * cell, c * cell:(c + 1) * cell] = f
    return sheet


# ---------------------------------------------------------------- halo crystal

HALO_CELL = 416           # 3 x 416 = 1248, 2 x 416 = 832: the FLUX sheets' canvas
HALO_CANVAS = 928         # source-resolution canvas per cell -> scale 416/928 = 0.448
HALO_FRAMES = 6
HALO_STEP = 10.0          # degrees per frame; 6 x 10 = 60 = the hexagon's period
FG_DIST = 45.0            # RGB distance from the key above which a pixel is subject


def halo_parts(rgb, key):
    """Split the winner into the core and its six satellites. Returns (premult RGBA float image,
    core mask, list of satellite dicts, ring centre (y, x), dropped stray pixel count)."""
    f = rgb.astype(np.float64)
    dist = np.sqrt(((f - key.astype(np.float64)) ** 2).sum(axis=2))
    fg = dist > FG_DIST
    lab, n = ndi.label(fg, structure=np.ones((3, 3)))
    sizes = ndi.sum(fg, lab, range(1, n + 1))
    order = np.argsort(-sizes)
    big = [int(o) + 1 for o in order[:7]]
    if sizes[order[6]] < 5000 or (n > 7 and sizes[order[7]] > 50):
        raise SystemExit('halo: expected one core and six satellites, got sizes %s' % sizes[order[:9]])
    keep = np.isin(lab, big)
    dropped = int(fg.sum() - keep.sum())

    # De-spill: the key's green leaks into the 1-2 px edge blend; the subject is violet / navy,
    # so clamp G to max(R, B). Interior colours already satisfy G <= max(R, B) and do not change.
    f = f.copy()
    g_cap = np.maximum(f[..., 0], f[..., 2])
    f[..., 1] = np.where(keep, np.minimum(f[..., 1], g_cap), f[..., 1])

    alpha = keep.astype(np.float64)
    premult = np.dstack([f / 255.0 * alpha[..., None], alpha])

    core_lab = big[0]
    core = lab == core_lab
    sats = []
    for l in big[1:]:
        m = lab == l
        cy, cx = ndi.center_of_mass(m)
        sats.append({'mask': m, 'c': (cy, cx)})
    ring = np.mean([s['c'] for s in sats], axis=0)
    for s in sats:
        dy, dx = s['c'][0] - ring[0], s['c'][1] - ring[1]
        s['r'] = math.hypot(dx, dy)
        s['theta'] = math.degrees(math.atan2(dy, dx))  # image coords: increasing = clockwise
        ys, xs = np.nonzero(s['mask'])
        s['extent'] = float(np.sqrt((ys - s['c'][0]) ** 2 + (xs - s['c'][1]) ** 2).max())
    sats.sort(key=lambda s: s['theta'])  # clockwise order on screen
    for i, s in enumerate(sats):
        nxt = sats[(i + 1) % 6]
        gap = (nxt['theta'] - s['theta']) % 360.0
        s['gap'] = gap
        s['r_next'] = nxt['r']
    return premult, core, sats, (float(ring[0]), float(ring[1])), dropped


def core_shine(premult, core, k, frames):
    """A faint shine band across the core's facets (the 'spinning of its own' hint), as a lighten
    toward the core's own brightest colour. Frame 0 has no band (it equals the winner); bands of
    frames 1..5 step across the gem from upper-left to lower-right; frame 6 would be off the gem
    again, so the loop closes. Navy outline pixels are untouched. Returns a new array."""
    if k == 0:
        return premult
    out = premult.copy()
    ys, xs = np.nonzero(core)
    rgb = premult[ys, xs, :3]  # alpha is 1 on the core
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    hi = rgb[lum >= np.percentile(lum, 98)].mean(axis=0)  # the lilac edge-glint colour
    # Band direction: 35 degrees below horizontal, i.e. the band runs from upper-right to
    # lower-left and travels toward the lower right (away from the top-left light).
    a = math.radians(35.0)
    u = xs * math.cos(a) + ys * math.sin(a)
    u0, u1 = u.min(), u.max()
    bw = (u1 - u0) * 0.16
    period = (u1 - u0) + bw
    centre = u0 - bw / 2 + period * (k / frames)
    d = np.abs(u - centre)
    w = np.where(d <= bw * 0.25, 0.45, np.where(d <= bw * 0.5, 0.22, 0.0))  # two hard steps
    w = np.where(lum > 60.0 / 255.0, w, 0.0)  # leave the dark outline alone
    out[ys, xs, :3] = rgb + w[:, None] * (hi[None, :] - rgb)
    return out


def make_halo(variant_upright=False, shine=True):
    """Build the six halo frames. Returns (frames uint8 list, info dict)."""
    rgb = np.asarray(Image.open(HALO_SRC).convert('RGB'))
    key = border_mode(rgb)
    premult, core, sats, ring, dropped = halo_parts(rgb, key)
    h, w = core.shape

    cc = HALO_CANVAS / 2.0
    # Integer shift of the source onto the canvas so the core is copied without resampling.
    sy, sx = int(round(cc - ring[0])), int(round(cc - ring[1]))
    ring_c = (ring[0] + sy, ring[1] + sx)

    def shifted(arr):
        out = np.zeros((HALO_CANVAS, HALO_CANVAS) + arr.shape[2:], dtype=arr.dtype)
        ys0, xs0 = max(0, -sy), max(0, -sx)
        ys1, xs1 = min(h, HALO_CANVAS - sy), min(w, HALO_CANVAS - sx)
        out[ys0 + sy:ys1 + sy, xs0 + sx:xs1 + sx] = arr[ys0:ys1, xs0:xs1]
        return out

    core_layer = shifted(premult * core[..., None])
    # Bound of the whole sprite over the animation, for the margin report.
    reach = max(max(s['r'], s['r_next']) + s['extent'] for s in sats)

    frames, centroids = [], []
    for k in range(HALO_FRAMES + 1):  # k = 6 is the loop check (must match k = 0's positions)
        t = k / HALO_FRAMES
        canvas = core_shine(core_layer, shifted(core), k % HALO_FRAMES, HALO_FRAMES) if shine \
            else core_layer.copy()
        canvas = canvas.copy()
        pos = []
        for s in sats:
            # Polar interpolation from this satellite's corner to the next one clockwise: the angle
            # advances gap/6 (10.0 +- 0.1 degrees on this hexagon) and the radius moves linearly,
            # so frame 7 would sit exactly on frame 1's corners.
            phi = t * s['gap']
            r = s['r'] + t * (s['r_next'] - s['r'])
            th = math.radians(s['theta'] + phi)
            dst = (ring_c[0] + r * math.sin(th), ring_c[1] + r * math.cos(th))
            spin = 0.0 if variant_upright else phi
            patch = premult * s['mask'][..., None]
            layer = rotate_about(patch, spin, s['c'], dst, (HALO_CANVAS, HALO_CANVAS), order=1)
            layer = np.clip(layer, 0.0, 1.0)
            a = layer[..., 3:4]
            canvas = layer + canvas * (1.0 - a)  # premultiplied "over"
            pos.append(dst)
        small = box_downscale(canvas, HALO_CELL)
        alpha = small[..., 3]
        solid = alpha >= 0.5
        col = np.where(solid[..., None], small[..., :3] / np.maximum(alpha[..., None], 1e-6), 0.0)
        out = np.empty((HALO_CELL, HALO_CELL, 3), dtype=np.uint8)
        out[:] = key
        out[solid] = np.clip(np.round(col[solid] * 255.0), 0, 255).astype(np.uint8)
        frames.append(out)
        centroids.append(pos)

    scale = HALO_CELL / HALO_CANVAS
    info = {
        'key': [int(v) for v in key],
        'ringCentre': [round(ring[0], 2), round(ring[1], 2)],
        'satellites': [{'theta': round(s['theta'], 2), 'r': round(s['r'], 1),
                        'stepDeg': round(s['gap'] / HALO_FRAMES, 3)} for s in sats],
        'scale': scale,
        'reachPx': round(reach * scale, 1),
        'droppedStrayPixels': dropped,
        'loopCentroidError': max(
            min(math.hypot(a[0] - b[0], a[1] - b[1]) for b in centroids[0]) for a in centroids[6]),
    }
    return frames, info


# ---------------------------------------------------------------- black hole

HOLE_CELL = 360           # 4 x 360 = 1440, 2 x 360 = 720
HOLE_FRAMES = 8
HOLE_STEP = 360.0 / HOLE_FRAMES
HOLE_BLACK_FLOOR = 4      # after downscaling, max channel <= this -> exact black
HOLE_MARGIN = 18          # output px of black kept between the vortex's reach and the cell edge


def hole_geometry(rgb):
    """Centre (y, x) of the dark core and the radius just outside the lilac rim."""
    f = rgb.astype(np.float64)
    h, w, _ = f.shape
    dark = f.max(axis=2) < 24
    lab, _ = ndi.label(dark)
    l0 = lab[h // 2, w // 2]
    if l0 == 0:
        raise SystemExit('black hole: the image centre is not inside the dark core')
    core = lab == l0
    cy, cx = ndi.center_of_mass(core)
    r_core = math.sqrt(core.sum() / math.pi)
    # Radial brightness profile around the centre: the rim is the first strong peak.
    yy, xx = np.mgrid[0:h, 0:w]
    rr = np.sqrt((yy - cy) ** 2 + (xx - cx) ** 2)
    lum = f @ np.array([0.299, 0.587, 0.114])
    prof = ndi.mean(lum, labels=np.minimum(rr.astype(int), 600), index=np.arange(0, 600))
    lo = int(r_core)
    peak = lo + int(np.argmax(prof[lo:lo + 60]))
    # Outer edge of the rim: where the profile first falls below 45 % of the peak.
    edge = peak
    while edge < peak + 40 and prof[edge] > 0.45 * prof[peak]:
        edge += 1
    lit = f.max(axis=2) > 8
    reach = float(rr[lit].max())
    return (cy, cx), r_core, peak, edge, reach


def make_hole():
    """Build the eight black-hole frames. Returns (frames uint8 list, info dict)."""
    rgb = np.asarray(Image.open(HOLE_SRC).convert('RGB'))
    (cy, cx), r_core, r_peak, r_cut, reach = hole_geometry(rgb)
    f = rgb.astype(np.float64) / 255.0
    # Source-resolution canvas per cell: the farthest lit pixel stays HOLE_MARGIN px inside the cell.
    canvas_n = int(math.ceil(2 * reach / (1.0 - 2.0 * HOLE_MARGIN / HOLE_CELL)))
    scale = HOLE_CELL / canvas_n
    cc = canvas_n / 2.0
    yy, xx = np.mgrid[0:canvas_n, 0:canvas_n]
    inner = np.sqrt((yy - cc) ** 2 + (xx - cc) ** 2) <= r_cut
    # The core disc (dark core + lilac rim) is the same in every frame: frame 0's resample of it.
    still = rotate_about(f, 0.0, (cy, cx), (cc, cc), (canvas_n, canvas_n), order=1)
    frames = []
    for k in range(HOLE_FRAMES):
        turned = rotate_about(f, k * HOLE_STEP, (cy, cx), (cc, cc), (canvas_n, canvas_n), order=1)
        turned[inner] = still[inner]
        small = box_downscale(np.clip(turned, 0.0, 1.0), HOLE_CELL)
        out = np.clip(np.round(small * 255.0), 0, 255).astype(np.uint8)
        out[out.max(axis=2) <= HOLE_BLACK_FLOOR] = 0
        frames.append(out)
    info = {
        'coreCentre': [round(cy, 2), round(cx, 2)], 'coreRadius': round(r_core, 1),
        'rimPeakRadius': r_peak, 'fixedDiscRadius': r_cut, 'reach': round(reach, 1),
        'canvas': canvas_n, 'scale': scale,
    }
    return frames, info


# ---------------------------------------------------------------- checks


def pairwise_diff(frames):
    """Fraction of differing pixels for every pair of frames."""
    n = len(frames)
    res = {}
    for i in range(n):
        for j in range(i + 1, n):
            res[(i + 1, j + 1)] = float((frames[i] != frames[j]).any(axis=2).mean())
    return res


def halo_checks(frames, key):
    """Per-frame satellite angles (clockwise = increasing), component counts, fringe pixels."""
    rows = []
    kf = key.astype(np.int64)
    for k, fr in enumerate(frames):
        f = fr.astype(np.int64)
        is_key = (f == kf).all(axis=2)
        lab, n = ndi.label(~is_key, structure=np.ones((3, 3)))
        sizes = ndi.sum(~is_key, lab, range(1, n + 1))
        order = np.argsort(-sizes)
        cents = ndi.center_of_mass(~is_key, lab, [int(o) + 1 for o in order[:7]])
        core = cents[0]
        angs = sorted(math.degrees(math.atan2(c[0] - HALO_CELL / 2, c[1] - HALO_CELL / 2)) % 360
                      for c in cents[1:])
        # Green-ish pixels that are not the exact key (a fringe): G > max(R, B) + 40.
        greenish = (~is_key) & (f[..., 1] > np.maximum(f[..., 0], f[..., 2]) + 40)
        rows.append({'frame': k + 1, 'components': n, 'smallest': int(sizes[order[-1]]),
                     'sat_angles': [round(a, 1) for a in angs], 'greenish_nonkey': int(greenish.sum()),
                     'core_centroid': [round(core[0], 1), round(core[1], 1)]})
    return rows


def hole_checks(frames):
    """Angle (clockwise = increasing) of the bright violet arm's light centroid per frame."""
    rows = []
    for k, fr in enumerate(frames):
        f = fr.astype(np.float64)
        r, g, b = f[..., 0], f[..., 1], f[..., 2]
        yy, xx = np.mgrid[0:HOLE_CELL, 0:HOLE_CELL]
        rad = np.sqrt((yy - HOLE_CELL / 2) ** 2 + (xx - HOLE_CELL / 2) ** 2)
        violet = (r > 120) & (b > 120) & (g < 0.6 * r) & (r > 0.7 * b) & (rad > 70)
        wgt = violet * (r + b)
        my = (wgt * (yy - HOLE_CELL / 2)).sum() / wgt.sum()
        mx = (wgt * (xx - HOLE_CELL / 2)).sum() / wgt.sum()
        rows.append({'frame': k + 1, 'violet_angle': round(math.degrees(math.atan2(my, mx)) % 360, 1),
                     'pure_black_bg': int((fr.max(axis=2) == 0).sum()),
                     'near_black_nonzero': int(((fr.max(axis=2) > 0) & (fr.max(axis=2) <= 4)).sum())})
    return rows


# ---------------------------------------------------------------- sidecars

MANIFEST = os.path.join(REPO, 'art-prompts/v2/manifest.json')
CHOICES_COPY = os.path.join(os.path.dirname(SCRIPT), 'choices.copy.json')  # a COPY, never the live file


def followup_entry(fid):
    """The manifest followup with id `fid`."""
    def walk(o):
        if isinstance(o, dict):
            if o.get('id') == fid and 'prompt' in o:
                return o
            for v in o.values():
                r = walk(v)
                if r:
                    return r
        elif isinstance(o, list):
            for v in o:
                r = walk(v)
                if r:
                    return r
        return None
    with open(MANIFEST) as f:
        return walk(json.load(f))


def rel(path):
    """Repo-relative path."""
    return os.path.relpath(os.path.abspath(path), REPO)


def write_sidecar(out_path, fid, src, transform, prompt, comment_keys, command, seconds, size, job):
    """Write <out>.json in the shape of the FLUX.2 edits' sidecars, but saying what really made it."""
    fu = followup_entry(fid)
    with open(CHOICES_COPY) as f:
        items = json.load(f)['items']
    comments = [{'key': k, 'comment': items[k]['comment'], 'updatedAt': items[k]['updatedAt']}
                for k in comment_keys if k in items and items[k].get('comment')]
    import datetime
    side = {
        'id': fid,
        'slot': 'a',
        'prompt': prompt,
        'negative': None,
        'model': 'code',
        'origin': 'derived in code from the owner\'s winner: no AI model, no GPU, no server',
        'seed': None,
        'width': size[0],
        'height': size[1],
        'steps': None,
        'guidance': None,
        'generatedAt': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z',
        'seconds': round(seconds, 1),
        'label': fu['label'] if fu else None,
        'source': fu.get('source') if fu else None,
        'file': rel(out_path),
        'format': 'png',
        'requestedFormat': 'png',
        'servedModel': None,
        'endpoint': None,
        'negativeSent': None,
        'mode': 'code',
        'derivedFrom': os.path.relpath(src, os.path.join(REPO, 'art-prompts/v2')),
        'derivedFromSha256': sha256(src),
        'editFrom': [rel(src)],
        'editFromSha256': [sha256(src)],
        'instruction': None,
        'transform': transform,
        'script': SCRIPT,
        'scriptSha256': sha256(SCRIPT),
        'command': command,
        'outputSize': '%dx%d' % size,
        'meta': {
            'job': job,
            'kind': 'comment-edit',
            'round': '2',
            'choiceUpdatedAt': max(c['updatedAt'] for c in comments) if comments else None,
            'parentId': fid,
            'comments': comments,
        },
    }
    with open(os.path.splitext(out_path)[0] + '.json', 'w') as f:
        json.dump(side, f, indent=2, ensure_ascii=False)
        f.write('\n')


HALO_PROMPT = ('No model and no prompt: made in code from the winner candidates/a/enemy/halo-crystal.png. '
               'Six frames: the six satellites orbit clockwise around the unmoving central gem, 10 degrees '
               'further in each frame (the hexagon repeats every 60 degrees, so frame 6 runs on into '
               'frame 1), each satellite turning with its orbit so it keeps pointing outward; a faint '
               'shine band crosses the gem from upper left to lower right in frames 2-6.')
HOLE_PROMPT = ('No model and no prompt: made in code from the winner candidates/a/fx/black-hole.png. '
               'Eight frames: the three-armed vortex turns clockwise, 45 degrees further in each frame '
               '(one full turn over the sheet, so frame 8 runs on into frame 1); the dark core and its '
               'lilac rim stay fixed in the centre while the arms and the crackle turn.')


# ---------------------------------------------------------------- main


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--halo-out')
    ap.add_argument('--hole-out')
    ap.add_argument('--preview', help='directory for preview crops (optional)')
    ap.add_argument('--variant', action='store_true', help='also write the upright-satellite halo')
    ap.add_argument('--no-shine', action='store_true')
    ap.add_argument('--sidecars', action='store_true', help='write <out>.json next to each sheet')
    args = ap.parse_args()
    report = {}
    import time
    command = 'python3 -I ' + ' '.join([SCRIPT] + sys.argv[1:])

    if args.halo_out:
        t0 = time.time()
        frames7, info = make_halo(shine=not args.no_shine)
        frames = frames7[:HALO_FRAMES]
        key = np.array(info['key'], dtype=np.uint8)
        sheet = lay_out(frames, 3, 2, HALO_CELL, key)
        Image.fromarray(sheet, 'RGB').save(args.halo_out, optimize=True)
        info['pairwise'] = {'%d-%d' % p: round(v, 4) for p, v in pairwise_diff(frames).items()}
        info['checks'] = halo_checks(frames, key)
        info['loopFrame7VsFrame1DiffPixels'] = float(
            (frames7[6] != frames7[0]).any(axis=2).mean())
        report['halo'] = info
        if args.sidecars:
            sc = info['scale']
            write_sidecar(args.halo_out, 'enemy/halo-crystal/frames', HALO_SRC, {
                'frames': HALO_FRAMES, 'layout': '2 rows x 3, read left to right then the bottom row',
                'cell': '%dx%d' % (HALO_CELL, HALO_CELL), 'gutters': 'none drawn; one continuous key',
                'key': 'RGB %d,%d,%d (the winner\'s border mode); every non-subject pixel is exactly this' % tuple(info['key']),
                'separation': 'connected components (8-way) of RGB distance to the key > %g: the core (largest) and six satellites; %d stray single pixels dropped' % (FG_DIST, info['droppedStrayPixels']),
                'despill': 'G clamped to max(R, B) on subject pixels (only the 1-2 px edge blend changes)',
                'orbit': 'clockwise around the ring centre (y %.2f, x %.2f in the winner), frame k at (k-1) x 10 degrees; each satellite moves from its drawn hexagon corner toward the next corner clockwise in polar coordinates (angle + gap/6, i.e. %s degrees; radius linear), so the 7th step lands exactly on frame 1 and the loop closes' % (info['ringCentre'][0], info['ringCentre'][1], '/'.join('%.2f' % x['stepDeg'] for x in info['satellites'])),
                'satelliteSpin': 'each satellite turns with its orbit (rotated by the same angle about its own centroid) and keeps pointing outward',
                'core': 'fixed, pixel-copied; frame 1 is the winner\'s core unchanged; frames 2-6 add a faint two-step shine band (22 %% / 45 %% lighten toward the core\'s own brightest lilac, outline untouched) that steps across the gem from upper left to lower right',
                'resampling': 'satellites turned bilinearly at the winner\'s resolution; each whole frame area-averaged (Pillow BOX) by %d/%d = %.4f with premultiplied alpha; alpha thresholded at 0.5, so edges are binary on the key' % (HALO_CELL, HALO_CANVAS, sc),
            }, HALO_PROMPT, ['enemy/halo-crystal/frames', 'enemy/halo-crystal/frames/edit-1'],
                command, time.time() - t0, (3 * HALO_CELL, 2 * HALO_CELL), 'code-1')
        if args.variant and args.preview:
            up7, _ = make_halo(variant_upright=True, shine=not args.no_shine)
            Image.fromarray(lay_out(up7[:6], 3, 2, HALO_CELL, key), 'RGB').save(
                os.path.join(args.preview, 'halo_upright.png'))
        if args.preview:
            strip = np.concatenate(frames7, axis=1)
            Image.fromarray(strip, 'RGB').save(os.path.join(args.preview, 'halo_strip7.png'))

    if args.hole_out:
        t0 = time.time()
        frames, info = make_hole()
        sheet = lay_out(frames, 4, 2, HOLE_CELL, np.zeros(3, dtype=np.uint8))
        Image.fromarray(sheet, 'RGB').save(args.hole_out, optimize=True)
        info['pairwise'] = {'%d-%d' % p: round(v, 4) for p, v in pairwise_diff(frames).items()}
        info['checks'] = hole_checks(frames)
        report['hole'] = info
        if args.sidecars:
            write_sidecar(args.hole_out, 'fx/black-hole/spin-frames', HOLE_SRC, {
                'frames': HOLE_FRAMES, 'layout': '2 rows x 4, read left to right then the bottom row',
                'cell': '%dx%d' % (HOLE_CELL, HOLE_CELL), 'gutters': 'none drawn; one continuous black canvas',
                'background': 'exact black 0,0,0 like the winner (pixels whose max channel is <= %d after scaling are set to 0)' % HOLE_BLACK_FLOOR,
                'spin': 'clockwise about the dark core\'s centre (y %.2f, x %.2f in the winner), frame k at (k-1) x 45 degrees = 360/8; the three arms are different colours (violet, indigo, steel blue), so only a full turn loops: a 120/8 = 15 degree step would swap the arm colours at frame 8 -> 1' % tuple(info['coreCentre']),
                'core': 'the disc r <= %d px of the winner (dark core r ~%.0f, lilac rim peak r %d) is not rotated: identical in every frame; the crackle and the arms outside it turn' % (info['fixedDiscRadius'], info['coreRadius'], info['rimPeakRadius']),
                'resampling': 'bilinear rotation at the winner\'s resolution onto a %d px canvas, area-averaged (Pillow BOX) to the cell, scale %.4f' % (info['canvas'], info['scale']),
            }, HOLE_PROMPT, ['fx/black-hole/spin-frames', 'fx/black-hole/spin-frames/edit-1'],
                command, time.time() - t0, (4 * HOLE_CELL, 2 * HOLE_CELL), 'code-2')

    json.dump(report, sys.stdout, indent=1, default=str)
    print()


if __name__ == '__main__':
    main()
