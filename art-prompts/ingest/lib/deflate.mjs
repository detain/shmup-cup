/**
 * A small, pure-JavaScript zlib (RFC 1950) / DEFLATE (RFC 1951) **compressor**, so the PNG
 * bytes the ingest tool writes depend on nothing but this file: not on the Node version, its
 * bundled zlib, or the CPU features that zlib may pick a hash function by. The same pixels
 * give the same bytes on every machine, which is what makes a committed ingest output
 * re-checkable in CI.
 *
 * - LZ77 over a 32 KiB window: 3-byte hash chains (at most {@link MAX_CHAIN} links walked)
 *   and one step of lazy matching, as zlib's higher levels do.
 * - One final block, with **dynamic** Huffman codes (length-limited to 15 bits by repeated
 *   frequency flattening) or the **fixed** codes, whichever is shorter.
 * - Ties in every choice are broken by a fixed rule, so the output is a pure function of the
 *   input.
 *
 * Decompression is `node:zlib` (`inflateSync`) or any PNG decoder; only the encoder lives here.
 *
 * @module
 */

/** Longest hash chain walked per position. */
export const MAX_CHAIN = 256;

const WINDOW = 32768;
const MIN_MATCH = 3;
const MAX_MATCH = 258;
const HASH_SIZE = 1 << 15;

/** Base lengths of the length codes 257–285 and their extra bits. */
const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
];
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
/** Base distances of the distance codes 0–29 and their extra bits. */
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];
/** Order the code-length code lengths are sent in. */
const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

/** Length code index (0–28) per match length 3–258. */
const LENGTH_CODE = (() => {
  const table = new Uint8Array(MAX_MATCH + 1);
  for (let code = 0; code < 29; code++) {
    const end = code === 28 ? 259 : LENGTH_BASE[code + 1];
    for (let len = LENGTH_BASE[code]; len < end && len <= MAX_MATCH; len++) table[len] = code;
  }
  table[258] = 28;
  return table;
})();

/**
 * Distance code (0–29) of a distance 1–32768.
 *
 * @param {number} dist - Match distance.
 * @returns {number} The code.
 */
function distCode(dist) {
  let lo = 0;
  let hi = 29;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (DIST_BASE[mid] <= dist) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** An LSB-first bit writer into a growing byte buffer. */
class BitWriter {
  constructor() {
    /** @type {Uint8Array} */
    this.bytes = new Uint8Array(1024);
    this.length = 0;
    this.bitBuf = 0;
    this.bitCount = 0;
  }

  /**
   * Appends `count` bits of `value`, least significant first.
   *
   * @param {number} value - Bits (count ≤ 24).
   * @param {number} count - How many.
   */
  bits(value, count) {
    this.bitBuf |= value << this.bitCount;
    this.bitCount += count;
    while (this.bitCount >= 8) {
      this.byte(this.bitBuf & 255);
      this.bitBuf >>>= 8;
      this.bitCount -= 8;
    }
  }

  /**
   * Appends one byte (the bit buffer must be empty or the caller must not mix).
   *
   * @param {number} b - Byte.
   */
  byte(b) {
    if (this.length === this.bytes.length) {
      const grown = new Uint8Array(this.bytes.length * 2);
      grown.set(this.bytes);
      this.bytes = grown;
    }
    this.bytes[this.length++] = b;
  }

  /** Pads to a byte boundary with zero bits. */
  flush() {
    if (this.bitCount > 0) this.bits(0, 8 - this.bitCount);
  }

  /**
   * The bytes written.
   *
   * @returns {Uint8Array} A copy.
   */
  result() {
    return this.bytes.slice(0, this.length);
  }
}

/**
 * Huffman code lengths for some symbol frequencies, at most `limit` bits long.
 *
 * @remarks
 * Plain Huffman by repeated merging of the two lightest nodes (ties: the node made first;
 * leaves are made in symbol order). When the longest code is over the limit, every non-zero
 * frequency is halved (staying ≥ 1) and the tree is built again. A single used symbol gets a
 * partner so the code is complete.
 *
 * @param {readonly number[]} freqs - Frequency per symbol.
 * @param {number} limit - Longest code allowed.
 * @returns {number[]} Code length per symbol (0 = unused).
 */
export function codeLengths(freqs, limit) {
  let f = freqs.slice();
  const used = f.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
  if (used === 0) {
    f[0] = 1;
    f[1] = 1;
  } else if (used === 1) {
    const only = f.findIndex((v) => v > 0);
    f[only === 0 ? 1 : 0] = 1;
  }
  for (;;) {
    const lengths = huffman(f);
    if (Math.max(...lengths) <= limit) return lengths;
    f = f.map((v) => (v === 0 ? 0 : Math.max(1, v >> 1)));
  }
}

/**
 * Unlimited Huffman code lengths (see {@link codeLengths}).
 *
 * @param {readonly number[]} f - Frequencies (at least two non-zero).
 * @returns {number[]} Lengths.
 */
function huffman(f) {
  /** @type {{ weight: number, id: number, left: number, right: number, symbol: number }[]} */
  const nodes = [];
  /** @type {number[]} */
  let live = [];
  f.forEach((w, symbol) => {
    if (w > 0) {
      nodes.push({ weight: w, id: nodes.length, left: -1, right: -1, symbol });
      live.push(nodes.length - 1);
    }
  });
  while (live.length > 1) {
    live.sort((a, b) => nodes[a].weight - nodes[b].weight || nodes[a].id - nodes[b].id);
    const [a, b] = live;
    nodes.push({
      weight: nodes[a].weight + nodes[b].weight,
      id: nodes.length,
      left: a,
      right: b,
      symbol: -1,
    });
    live = live.slice(2);
    live.push(nodes.length - 1);
  }
  const lengths = new Array(f.length).fill(0);
  /** @type {[number, number][]} */
  const stack = [[live[0], 0]];
  while (stack.length > 0) {
    const [i, depth] = /** @type {[number, number]} */ (stack.pop());
    const node = nodes[i];
    if (node.symbol >= 0) lengths[node.symbol] = depth;
    else {
      stack.push([node.left, depth + 1]);
      stack.push([node.right, depth + 1]);
    }
  }
  return lengths;
}

/**
 * Canonical codes for some code lengths (RFC 1951 §3.2.2), bit-reversed for an LSB-first
 * writer.
 *
 * @param {readonly number[]} lengths - Code length per symbol.
 * @returns {number[]} The reversed code per symbol.
 */
function canonicalCodes(lengths) {
  const maxLen = Math.max(0, ...lengths);
  const count = new Array(maxLen + 1).fill(0);
  for (const l of lengths) if (l > 0) count[l]++;
  const next = new Array(maxLen + 2).fill(0);
  let code = 0;
  for (let bits = 1; bits <= maxLen; bits++) {
    code = (code + count[bits - 1]) << 1;
    next[bits] = code;
  }
  return lengths.map((l) => {
    if (l === 0) return 0;
    const c = next[l]++;
    let r = 0;
    for (let k = 0; k < l; k++) r |= ((c >> k) & 1) << (l - 1 - k);
    return r;
  });
}

/**
 * The LZ77 parse of some bytes: literal/length symbols and distances.
 *
 * @param {Uint8Array} data - Input.
 * @returns {{ lit: Uint16Array, extra: Uint16Array, dist: Uint16Array, count: number }}
 *   Per symbol: the literal/length symbol (0–285), for lengths the match length, and the
 *   distance (0 for literals).
 */
function lz77(data) {
  const n = data.length;
  const head = new Int32Array(HASH_SIZE).fill(-1);
  const prev = new Int32Array(Math.max(1, n));
  const lit = new Uint16Array(n + 1);
  const extra = new Uint16Array(n + 1);
  const dist = new Uint16Array(n + 1);
  let count = 0;
  /**
   * Hash of the three bytes at `i`.
   *
   * @param {number} i - Position (≤ n − 3).
   * @returns {number} Bucket.
   */
  const hash = (i) => ((data[i] << 10) ^ (data[i + 1] << 5) ^ data[i + 2]) & (HASH_SIZE - 1);
  let inserted = 0;
  /**
   * Inserts every position before `upto` into the hash chains.
   *
   * @param {number} upto - First position not to insert.
   */
  const insertUpTo = (upto) => {
    for (; inserted < upto && inserted + MIN_MATCH <= n; inserted++) {
      const h = hash(inserted);
      prev[inserted] = head[h];
      head[h] = inserted;
    }
    if (inserted < upto) inserted = upto;
  };
  /**
   * The longest earlier match at `i` (ties: the nearest).
   *
   * @param {number} i - Position.
   * @returns {[number, number]} `[length, distance]`, length 0 when none ≥ 3.
   */
  const longest = (i) => {
    if (i + MIN_MATCH > n) return [0, 0];
    const limit = Math.min(MAX_MATCH, n - i);
    let bestLen = 0;
    let bestDist = 0;
    let cand = head[hash(i)];
    let chain = 0;
    while (cand >= 0 && i - cand <= WINDOW && chain < MAX_CHAIN) {
      if (data[cand + bestLen] === data[i + bestLen]) {
        let len = 0;
        while (len < limit && data[cand + len] === data[i + len]) len++;
        if (len > bestLen) {
          bestLen = len;
          bestDist = i - cand;
          if (len === limit) break;
        }
      }
      cand = prev[cand];
      chain++;
    }
    return bestLen >= MIN_MATCH ? [bestLen, bestDist] : [0, 0];
  };
  let i = 0;
  while (i < n) {
    insertUpTo(i);
    const [len, d] = longest(i);
    if (len === 0) {
      lit[count] = data[i];
      count++;
      i++;
      continue;
    }
    // Lazy matching: a longer match one byte later wins over this one.
    if (len < MAX_MATCH && i + 1 < n) {
      insertUpTo(i + 1);
      const [len2] = longest(i + 1);
      if (len2 > len) {
        lit[count] = data[i];
        count++;
        i++;
        continue;
      }
    }
    lit[count] = 257 + LENGTH_CODE[len];
    extra[count] = len;
    dist[count] = d;
    count++;
    i += len;
  }
  lit[count] = 256; // end of block
  count++;
  return { lit, extra, dist, count };
}

/** The fixed literal/length code lengths (RFC 1951 §3.2.6). */
const FIXED_LIT = Array.from({ length: 288 }, (_, s) =>
  s < 144 ? 8 : s < 256 ? 9 : s < 280 ? 7 : 8,
);
/** The fixed distance code lengths. */
const FIXED_DIST = new Array(30).fill(5);

/**
 * Run-length codes for the code lengths of a dynamic header (symbols 0–18).
 *
 * @param {readonly number[]} lengths - Literal/length then distance code lengths.
 * @returns {[number, number][]} `[symbol, extra value]` pairs.
 */
function rleLengths(lengths) {
  /** @type {[number, number][]} */
  const out = [];
  let i = 0;
  while (i < lengths.length) {
    const l = lengths[i];
    let run = 1;
    while (i + run < lengths.length && lengths[i + run] === l) run++;
    if (l === 0 && run >= 3) {
      const take = Math.min(run, 138);
      out.push(take >= 11 ? [18, take - 11] : [17, take - 3]);
      i += take;
    } else if (l !== 0 && run >= 4) {
      out.push([l, 0]);
      const take = Math.min(run - 1, 6);
      out.push([16, take - 3]);
      i += 1 + take;
    } else {
      out.push([l, 0]);
      i++;
    }
  }
  return out;
}

/**
 * zlib-compresses some bytes (a 2-byte header, one DEFLATE block, the Adler-32).
 *
 * @param {Uint8Array} data - Input.
 * @returns {Uint8Array} The zlib stream; `inflateSync` gives `data` back.
 *
 * @example
 * inflateSync(zlibDeflate(bytes)); // → bytes
 */
export function zlibDeflate(data) {
  const { lit, extra, dist, count } = lz77(data);
  const litFreq = new Array(286).fill(0);
  const distFreq = new Array(30).fill(0);
  for (let s = 0; s < count; s++) {
    litFreq[lit[s]]++;
    if (lit[s] > 256) distFreq[distCode(dist[s])]++;
  }
  const litLen = codeLengths(litFreq, 15);
  const distLen = codeLengths(distFreq, 15);

  // Header cost of the dynamic codes.
  let hlit = 286;
  while (hlit > 257 && litLen[hlit - 1] === 0) hlit--;
  let hdist = 30;
  while (hdist > 1 && distLen[hdist - 1] === 0) hdist--;
  const rle = rleLengths(litLen.slice(0, hlit).concat(distLen.slice(0, hdist)));
  const clFreq = new Array(19).fill(0);
  for (const [sym] of rle) clFreq[sym]++;
  const clLen = codeLengths(clFreq, 7);
  let hclen = 19;
  while (hclen > 4 && clLen[CL_ORDER[hclen - 1]] === 0) hclen--;

  /**
   * Bits of the symbol stream under some code lengths.
   *
   * @param {readonly number[]} ll - Literal/length lengths.
   * @param {readonly number[]} dl - Distance lengths.
   * @returns {number} Bit count.
   */
  const bodyBits = (ll, dl) => {
    let bits = 0;
    for (let s = 0; s < 286; s++) {
      if (litFreq[s] === 0) continue;
      bits += litFreq[s] * (ll[s] + (s > 256 ? LENGTH_EXTRA[s - 257] : 0));
    }
    for (let c = 0; c < 30; c++) bits += distFreq[c] * (dl[c] + DIST_EXTRA[c]);
    return bits;
  };
  let dynamicBits = 14 + hclen * 3 + bodyBits(litLen, distLen);
  for (const [sym] of rle)
    dynamicBits += clLen[sym] + (sym === 16 ? 2 : sym === 17 ? 3 : sym === 18 ? 7 : 0);
  const fixedBits = bodyBits(FIXED_LIT, FIXED_DIST);
  const useFixed = fixedBits <= dynamicBits;

  const out = new BitWriter();
  out.byte(0x78); // CM 8, CINFO 7 (32 KiB window)
  out.byte(0xda); // FLEVEL 3 (maximum compression), no dictionary, check bits
  out.bits(1, 1); // BFINAL
  const ll = useFixed ? FIXED_LIT : litLen;
  const dl = useFixed ? FIXED_DIST : distLen;
  if (useFixed) out.bits(1, 2);
  else {
    out.bits(2, 2);
    out.bits(hlit - 257, 5);
    out.bits(hdist - 1, 5);
    out.bits(hclen - 4, 4);
    for (let k = 0; k < hclen; k++) out.bits(clLen[CL_ORDER[k]], 3);
    const clCodes = canonicalCodes(clLen);
    for (const [sym, value] of rle) {
      out.bits(clCodes[sym], clLen[sym]);
      if (sym === 16) out.bits(value, 2);
      else if (sym === 17) out.bits(value, 3);
      else if (sym === 18) out.bits(value, 7);
    }
  }
  const litCodes = canonicalCodes(ll);
  const distCodes = canonicalCodes(dl);
  for (let s = 0; s < count; s++) {
    const sym = lit[s];
    out.bits(litCodes[sym], ll[sym]);
    if (sym > 256) {
      const code = sym - 257;
      if (LENGTH_EXTRA[code] > 0) out.bits(extra[s] - LENGTH_BASE[code], LENGTH_EXTRA[code]);
      const dc = distCode(dist[s]);
      out.bits(distCodes[dc], dl[dc]);
      if (DIST_EXTRA[dc] > 0) out.bits(dist[s] - DIST_BASE[dc], DIST_EXTRA[dc]);
    }
  }
  out.flush();
  let a = 1;
  let b = 0;
  for (let k = 0; k < data.length; k++) {
    a = (a + data[k]) % 65521;
    b = (b + a) % 65521;
  }
  const adler = ((b << 16) | a) >>> 0;
  out.byte(adler >>> 24);
  out.byte((adler >>> 16) & 255);
  out.byte((adler >>> 8) & 255);
  out.byte(adler & 255);
  return out.result();
}
