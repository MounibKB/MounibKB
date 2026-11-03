/* DrawMaster engine — image analysis + cumulative stage rendering.
 * One global: window.DMEngine. Plain JS, typed arrays, no libraries, no network, no eval.
 * Every stage is computed from the uploaded pixels and drawn at the exact same pixel positions. */
(function (global) {
  'use strict';

  var VERSION = '1.0.0';
  var ORDER = ['guides', 'construction', 'silhouettes', 'outlines', 'details', 'bgBase', 'fgBase',
    'secondary', 'shadows', 'gradients', 'textures', 'highlights', 'final'];
  var ROLES = ['background', 'foreground', 'secondary', 'detail'];

  function sat(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smoothstep(a, b, x) { var t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); }
  function mkCanvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function hex2(v) { v = Math.round(clamp(v, 0, 255)); return (v < 16 ? '0' : '') + v.toString(16); }
  function toHex(rgb) { return '#' + hex2(rgb[0]) + hex2(rgb[1]) + hex2(rgb[2]); }
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ------------------------------------------------------------------ prepare */
  function prepare(source, o) {
    o = o || {};
    var maxSide = o.maxSide || 900;
    var sw = source.naturalWidth || source.videoWidth || source.width;
    var sh = source.naturalHeight || source.videoHeight || source.height;
    if (!sw || !sh) throw new Error('DMEngine.prepare: source has no size');
    var s = Math.min(1, maxSide / Math.max(sw, sh));
    var w = Math.max(1, Math.round(sw * s)), h = Math.max(1, Math.round(sh * s));
    var c = mkCanvas(w, h);
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, w, h);
    var d = ctx.getImageData(0, 0, w, h);
    for (var i = 3; i < d.data.length; i += 4) d.data[i] = 255;
    return { width: w, height: h, rgba: d.data, scale: w / sw };
  }

  /* ------------------------------------------------------------------ filters */
  function gaussKernel(sigma) {
    var r = Math.max(1, Math.ceil(sigma * 3)), k = new Float32Array(2 * r + 1), s = 0, i;
    for (i = -r; i <= r; i++) { k[i + r] = Math.exp(-i * i / (2 * sigma * sigma)); s += k[i + r]; }
    for (i = 0; i < k.length; i++) k[i] /= s;
    return { k: k, r: r };
  }
  function blurF(src, w, h, sigma) {
    var g = gaussKernel(sigma), k = g.k, r = g.r;
    var tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    var x, y, j, acc, xx, yy, row;
    for (y = 0; y < h; y++) {
      row = y * w;
      for (x = 0; x < w; x++) {
        acc = 0;
        if (x >= r && x < w - r) { for (j = -r; j <= r; j++) acc += src[row + x + j] * k[j + r]; }
        else { for (j = -r; j <= r; j++) { xx = x + j; xx = xx < 0 ? 0 : xx >= w ? w - 1 : xx; acc += src[row + xx] * k[j + r]; } }
        tmp[row + x] = acc;
      }
    }
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        acc = 0;
        if (y >= r && y < h - r) { for (j = -r; j <= r; j++) acc += tmp[(y + j) * w + x] * k[j + r]; }
        else { for (j = -r; j <= r; j++) { yy = y + j; yy = yy < 0 ? 0 : yy >= h ? h - 1 : yy; acc += tmp[yy * w + x] * k[j + r]; } }
        out[y * w + x] = acc;
      }
    }
    return out;
  }
  function boxBlurF(src, w, h, r) {
    var tmp = new Float32Array(w * h), out = new Float32Array(w * h), x, y, acc, row, n = 2 * r + 1, xx;
    for (y = 0; y < h; y++) {
      row = y * w; acc = 0;
      for (x = -r; x <= r; x++) { xx = x < 0 ? 0 : x >= w ? w - 1 : x; acc += src[row + xx]; }
      for (x = 0; x < w; x++) {
        tmp[row + x] = acc / n;
        var a = x + r + 1, b = x - r;
        acc += src[row + (a >= w ? w - 1 : a)] - src[row + (b < 0 ? 0 : b)];
      }
    }
    for (x = 0; x < w; x++) {
      acc = 0;
      for (y = -r; y <= r; y++) { xx = y < 0 ? 0 : y >= h ? h - 1 : y; acc += tmp[xx * w + x]; }
      for (y = 0; y < h; y++) {
        out[y * w + x] = acc / n;
        var a2 = y + r + 1, b2 = y - r;
        acc += tmp[(a2 >= h ? h - 1 : a2) * w + x] - tmp[(b2 < 0 ? 0 : b2) * w + x];
      }
    }
    return out;
  }
  function percentile(arr, p, lo, hi) {
    var n = arr.length, i, v, mn = Infinity, mx = -Infinity;
    if (lo === undefined) { for (i = 0; i < n; i++) { v = arr[i]; if (v < mn) mn = v; if (v > mx) mx = v; } }
    else { mn = lo; mx = hi; }
    if (!(mx > mn)) return mn;
    var B = 2048, hist = new Uint32Array(B), sc = (B - 1) / (mx - mn);
    for (i = 0; i < n; i++) hist[((arr[i] - mn) * sc) | 0]++;
    var target = p * n, c = 0;
    for (i = 0; i < B; i++) { c += hist[i]; if (c >= target) return mn + (i + 0.5) / sc; }
    return mx;
  }

  /* ------------------------------------------------------------------ colour */
  var LIN = new Float32Array(256);
  (function () { for (var i = 0; i < 256; i++) { var c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); } })();
  function labF(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
  function rgb2lab(r, g, b) {
    var R = LIN[r], G = LIN[g], B = LIN[b];
    var X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
    var Y = 0.2126729 * R + 0.7151522 * G + 0.0721750 * B;
    var Z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / 1.08883;
    var fx = labF(X), fy = labF(Y), fz = labF(Z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  function labDist(a, b) { var d0 = a[0] - b[0], d1 = a[1] - b[1], d2 = a[2] - b[2]; return Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2); }

  function colorName(rgb) {
    var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    var s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1) + 1e-9);
    var h = 0;
    if (d > 0) {
      if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    if (l < 0.07) return 'near black';
    if (l > 0.95 && s < 0.5) return 'white';
    if (s < 0.1) {
      if (l < 0.2) return 'charcoal';
      if (l < 0.35) return 'dark grey';
      if (l < 0.6) return 'mid grey';
      if (l < 0.82) return 'light grey';
      return 'off-white';
    }
    var name, pre = '';
    if (h < 10 || h >= 350) name = 'red';
    else if (h < 20) name = 'red-orange';
    else if (h < 40) name = 'orange';
    else if (h < 52) name = 'golden yellow';
    else if (h < 68) name = 'yellow';
    else if (h < 95) name = 'lime green';
    else if (h < 150) name = 'green';
    else if (h < 172) name = 'sea green';
    else if (h < 192) name = 'teal';
    else if (h < 212) name = 'sky blue';
    else if (h < 250) name = 'blue';
    else if (h < 272) name = 'violet';
    else if (h < 300) name = 'purple';
    else if (h < 332) name = 'magenta';
    else name = 'crimson';
    var warm = h < 52 && h >= 8;
    if (warm && l < 0.5) {
      name = h < 20 ? 'rust brown' : 'brown';
      if (l < 0.22) name = 'dark brown';
      else if (s < 0.45) name = 'umber';
    } else if (warm && s < 0.55 && l >= 0.5) {
      name = l > 0.75 ? 'cream' : (h < 40 ? 'tan' : 'warm ochre');
    } else if (h >= 40 && h < 68 && l < 0.5) {
      name = 'olive';
    } else if (h >= 212 && h < 250 && l < 0.3) {
      name = l < 0.17 ? 'dark navy' : 'navy';
    } else if ((h < 10 || h >= 332) && l > 0.72) {
      name = 'pink'; if (l > 0.86) pre = 'pale ';
    } else if (h >= 290 && h < 332 && l > 0.75) {
      name = 'light pink';
    } else {
      if (s < 0.35) pre = 'muted ';
      if (l < 0.25) pre = 'dark ';
      else if (l > 0.78) pre = 'light ';
      else if (l < 0.38 && pre === '') pre = 'deep ';
    }
    return pre + name;
  }

  /* ------------------------------------------------------------------ canny */
  function nmsEdges(mag, gx, gy, w, h) {
    var nms = new Float32Array(w * h), x, y, i, m, ax, ay, a, b;
    for (y = 1; y < h - 1; y++) {
      for (x = 1; x < w - 1; x++) {
        i = y * w + x; m = mag[i];
        if (m < 0.02) continue;
        ax = Math.abs(gx[i]); ay = Math.abs(gy[i]);
        if (ay <= ax * 0.4142) { a = mag[i - 1]; b = mag[i + 1]; }
        else if (ay >= ax * 2.4142) { a = mag[i - w]; b = mag[i + w]; }
        else if ((gx[i] > 0) === (gy[i] > 0)) { a = mag[i - w - 1]; b = mag[i + w + 1]; }
        else { a = mag[i - w + 1]; b = mag[i + w - 1]; }
        if (m >= a && m >= b) nms[i] = m;
      }
    }
    return nms;
  }
  function hysteresis(nms, hi, lo, w, h) {
    var N = w * h, out = new Uint8Array(N), stack = new Int32Array(N), sp = 0, i, k;
    for (i = 0; i < N; i++) if (nms[i] >= hi) { out[i] = 1; stack[sp++] = i; }
    while (sp > 0) {
      i = stack[--sp];
      var x = i % w, y = (i / w) | 0;
      for (var dy = -1; dy <= 1; dy++) {
        var yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (var dx = -1; dx <= 1; dx++) {
          var xx = x + dx; if (xx < 0 || xx >= w) continue;
          k = yy * w + xx;
          if (!out[k] && nms[k] >= lo) { out[k] = 1; stack[sp++] = k; }
        }
      }
    }
    return out;
  }
  function removeSmall(mask, w, h, minSize) {
    var N = w * h, seen = new Uint8Array(N), stack = new Int32Array(N), comp = new Int32Array(N), i, k;
    for (var s = 0; s < N; s++) {
      if (!mask[s] || seen[s]) continue;
      var sp = 0, n = 0; stack[sp++] = s; seen[s] = 1;
      while (sp > 0) {
        i = stack[--sp]; comp[n++] = i;
        var x = i % w, y = (i / w) | 0;
        for (var dy = -1; dy <= 1; dy++) {
          var yy = y + dy; if (yy < 0 || yy >= h) continue;
          for (var dx = -1; dx <= 1; dx++) {
            var xx = x + dx; if (xx < 0 || xx >= w) continue;
            k = yy * w + xx;
            if (mask[k] && !seen[k]) { seen[k] = 1; stack[sp++] = k; }
          }
        }
      }
      if (n < minSize) for (var q = 0; q < n; q++) mask[comp[q]] = 0;
    }
    return mask;
  }

  /* ------------------------------------------------------------------ k-means (CIE Lab) */
  function kmeansCenters(L, A, B, N, k, rng) {
    var m = Math.min(N, 24000), step = N / m, sl = new Float32Array(m), sa = new Float32Array(m), sb = new Float32Array(m), i, c, j;
    for (i = 0; i < m; i++) { j = Math.min(N - 1, (i * step) | 0); sl[i] = L[j]; sa[i] = A[j]; sb[i] = B[j]; }
    var cen = new Float32Array(3 * k), d2 = new Float32Array(m).fill(Infinity);
    j = (rng() * m) | 0; cen[0] = sl[j]; cen[1] = sa[j]; cen[2] = sb[j];
    for (c = 1; c < k; c++) {
      var tot = 0, p = c - 1;
      for (i = 0; i < m; i++) {
        var a = sl[i] - cen[3 * p], b = sa[i] - cen[3 * p + 1], e = sb[i] - cen[3 * p + 2], dd = a * a + b * b + e * e;
        if (dd < d2[i]) d2[i] = dd; tot += d2[i];
      }
      var r = rng() * tot, acc = 0; j = m - 1;
      for (i = 0; i < m; i++) { acc += d2[i]; if (acc >= r) { j = i; break; } }
      cen[3 * c] = sl[j]; cen[3 * c + 1] = sa[j]; cen[3 * c + 2] = sb[j];
    }
    var assign = new Int32Array(m), sums = new Float64Array(3 * k), cnt = new Float64Array(k);
    for (var it = 0; it < 14; it++) {
      sums.fill(0); cnt.fill(0);
      for (i = 0; i < m; i++) {
        var best = 0, bd = Infinity;
        for (c = 0; c < k; c++) {
          var a1 = sl[i] - cen[3 * c], b1 = sa[i] - cen[3 * c + 1], e1 = sb[i] - cen[3 * c + 2], d1 = a1 * a1 + b1 * b1 + e1 * e1;
          if (d1 < bd) { bd = d1; best = c; }
        }
        assign[i] = best; cnt[best]++; sums[3 * best] += sl[i]; sums[3 * best + 1] += sa[i]; sums[3 * best + 2] += sb[i];
      }
      for (c = 0; c < k; c++) if (cnt[c] > 0) { cen[3 * c] = sums[3 * c] / cnt[c]; cen[3 * c + 1] = sums[3 * c + 1] / cnt[c]; cen[3 * c + 2] = sums[3 * c + 2] / cnt[c]; }
    }
    return cen;
  }

  /* ------------------------------------------------------------------ analyze */
  function analyze(prep, opts) {
    opts = opts || {};
    var w = prep.width, h = prep.height, N = w * h, rgba = prep.rgba, i, x, y;
    var rng = mulberry32(12345);

    // luminance + Lab
    var gray = new Float32Array(N), Lc = new Float32Array(N), Ac = new Float32Array(N), Bc = new Float32Array(N);
    var lab;
    for (i = 0; i < N; i++) {
      var R = rgba[4 * i], G = rgba[4 * i + 1], Bv = rgba[4 * i + 2];
      gray[i] = (0.2126 * LIN[R] + 0.7152 * LIN[G] + 0.0722 * LIN[Bv]);
      lab = rgb2lab(R, G, Bv); Lc[i] = lab[0]; Ac[i] = lab[1]; Bc[i] = lab[2];
    }
    // perceptual-ish gray for edges (gamma encoded luminance)
    for (i = 0; i < N; i++) gray[i] = (0.299 * rgba[4 * i] + 0.587 * rgba[4 * i + 1] + 0.114 * rgba[4 * i + 2]) / 255;

    // gaussian + sobel
    var gb = blurF(gray, w, h, 1.4);
    var gx = new Float32Array(N), gy = new Float32Array(N), mag = new Float32Array(N);
    for (y = 1; y < h - 1; y++) {
      for (x = 1; x < w - 1; x++) {
        i = y * w + x;
        var sx = (gb[i - w + 1] + 2 * gb[i + 1] + gb[i + w + 1]) - (gb[i - w - 1] + 2 * gb[i - 1] + gb[i + w - 1]);
        var sy = (gb[i + w - 1] + 2 * gb[i + w] + gb[i + w + 1]) - (gb[i - w - 1] + 2 * gb[i - w] + gb[i - w + 1]);
        gx[i] = sx; gy[i] = sy; mag[i] = Math.sqrt(sx * sx + sy * sy);
      }
    }
    var norm = percentile(mag, 0.995, 0, Math.max.apply(null, [1e-6, maxOf(mag)]));
    if (!(norm > 1e-6)) norm = 1e-6;
    for (i = 0; i < N; i++) { var mv = mag[i] / norm; mag[i] = mv > 1 ? 1 : mv; }
    var nms = nmsEdges(mag, gx, gy, w, h);
    var hi = opts.edgeHigh != null ? opts.edgeHigh : Math.max(0.12, percentile(mag, 0.92, 0, 1));
    var lo = opts.edgeLow != null ? opts.edgeLow : hi * 0.45;
    var strong = hysteresis(nms, hi, lo, w, h);
    var minLen = Math.max(10, Math.round(0.012 * Math.max(w, h)));
    removeSmall(strong, w, h, minLen);
    var fhi = Math.max(0.06, percentile(mag, 0.82, 0, 1)), flo = fhi * 0.6;
    var fine = hysteresis(nms, fhi, flo, w, h);
    removeSmall(fine, w, h, 6);
    var strongCount = 0;
    for (i = 0; i < N; i++) { if (strong[i]) { fine[i] = 1; strongCount++; } }

    // texture
    var gbl = blurF(gray, w, h, 1.6), hf2 = new Float32Array(N);
    for (i = 0; i < N; i++) { var dd = gray[i] - gbl[i]; hf2[i] = dd * dd; }
    var te = boxBlurF(hf2, w, h, 3), texture = new Float32Array(N);
    for (i = 0; i < N; i++) texture[i] = Math.sqrt(te[i]);
    var tn = percentile(texture, 0.95, 0, maxOf(texture) || 1) || 1e-6, texSum = 0;
    for (i = 0; i < N; i++) { var tv = texture[i] / tn; texture[i] = tv > 1 ? 1 : tv; texSum += texture[i]; }
    var texMean = texSum / N;

    // complexity (pre-clustering part)
    var bins = new Uint32Array(512), occ = 0;
    for (i = 0; i < N; i++) bins[((rgba[4 * i] >> 5) << 6) | ((rgba[4 * i + 1] >> 5) << 3) | (rgba[4 * i + 2] >> 5)]++;
    for (i = 0; i < 512; i++) if (bins[i] > N * 0.003) occ++;
    var edScore = sat((strongCount / N) / 0.06), csScore = sat((occ - 4) / 24), txScore = sat(texMean / 0.4);
    var score0 = 0.45 * edScore + 0.35 * csScore + 0.2 * txScore;
    var k = opts.k ? clamp(Math.round(opts.k), 2, 32) : clamp(Math.round(6 + 10 * score0), 6, 16);

    // k-means on lightly blurred Lab
    var Lb = blurF(Lc, w, h, 1.0), Ab = blurF(Ac, w, h, 1.0), Bb = blurF(Bc, w, h, 1.0);
    var cen = kmeansCenters(Lb, Ab, Bb, N, k, rng);
    var lab0 = new Int32Array(N), c, cnt = new Float64Array(k);
    for (i = 0; i < N; i++) {
      var l1 = Lb[i], a1 = Ab[i], b1 = Bb[i], best = 0, bd = Infinity;
      for (c = 0; c < k; c++) {
        var q0 = l1 - cen[3 * c], q1 = a1 - cen[3 * c + 1], q2 = b1 - cen[3 * c + 2], dq = q0 * q0 + q1 * q1 + q2 * q2;
        if (dq < bd) { bd = dq; best = c; }
      }
      lab0[i] = best; cnt[best]++;
    }
    var order = [];
    for (c = 0; c < k; c++) if (cnt[c] > 0) order.push(c);
    order.sort(function (a, b) { return cnt[b] - cnt[a]; });
    var remap = new Int32Array(k).fill(-1);
    order.forEach(function (oc, ni) { remap[oc] = ni; });
    var K = order.length, labels = new Int32Array(N);
    var pSum = new Float64Array(K * 6);
    for (i = 0; i < N; i++) {
      var ci = remap[lab0[i]]; labels[i] = ci;
      pSum[6 * ci] += rgba[4 * i]; pSum[6 * ci + 1] += rgba[4 * i + 1]; pSum[6 * ci + 2] += rgba[4 * i + 2];
      pSum[6 * ci + 3] += Lc[i]; pSum[6 * ci + 4] += Ac[i]; pSum[6 * ci + 5] += Bc[i];
    }
    var palette = [];
    for (c = 0; c < K; c++) {
      var n = Math.max(1, cnt[order[c]]);
      var rgbm = [Math.round(pSum[6 * c] / n), Math.round(pSum[6 * c + 1] / n), Math.round(pSum[6 * c + 2] / n)];
      palette.push({ rgb: rgbm, lab: [pSum[6 * c + 3] / n, pSum[6 * c + 4] / n, pSum[6 * c + 5] / n], count: cnt[order[c]], hex: toHex(rgbm) });
    }

    // connected components of label map (4-connected)
    var comp = new Int32Array(N).fill(-1), stack = new Int32Array(N);
    var cLabel = [], cArea = [], cL = [], cA = [], cB = [], nc = 0;
    for (var s = 0; s < N; s++) {
      if (comp[s] >= 0) continue;
      var lbl = labels[s], sp = 0, area = 0, sL = 0, sA = 0, sB = 0;
      stack[sp++] = s; comp[s] = nc;
      while (sp > 0) {
        i = stack[--sp]; area++; sL += Lc[i]; sA += Ac[i]; sB += Bc[i];
        x = i % w; y = (i / w) | 0;
        var j;
        if (x > 0) { j = i - 1; if (comp[j] < 0 && labels[j] === lbl) { comp[j] = nc; stack[sp++] = j; } }
        if (x < w - 1) { j = i + 1; if (comp[j] < 0 && labels[j] === lbl) { comp[j] = nc; stack[sp++] = j; } }
        if (y > 0) { j = i - w; if (comp[j] < 0 && labels[j] === lbl) { comp[j] = nc; stack[sp++] = j; } }
        if (y < h - 1) { j = i + w; if (comp[j] < 0 && labels[j] === lbl) { comp[j] = nc; stack[sp++] = j; } }
      }
      cLabel.push(lbl); cArea.push(area); cL.push(sL); cA.push(sA); cB.push(sB); nc++;
    }
    // adjacency
    var adj = new Array(nc), a, b;
    function addAdj(p, q) {
      var m = adj[p]; if (!m) m = adj[p] = new Map();
      m.set(q, (m.get(q) || 0) + 1);
    }
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x; a = comp[i];
        if (x < w - 1) { b = comp[i + 1]; if (a !== b) { addAdj(a, b); addAdj(b, a); } }
        if (y < h - 1) { b = comp[i + w]; if (a !== b) { addAdj(a, b); addAdj(b, a); } }
      }
    }
    var minArea = opts.minRegionArea || Math.max(24, Math.round(0.0015 * N));
    var parent = new Int32Array(nc);
    for (i = 0; i < nc; i++) parent[i] = i;
    function find(v) { while (parent[v] !== v) { parent[v] = parent[parent[v]]; v = parent[v]; } return v; }
    var small = [];
    for (i = 0; i < nc; i++) if (cArea[i] < minArea) small.push(i);
    small.sort(function (p, q) { return cArea[p] - cArea[q]; });
    for (var si = 0; si < small.length; si++) {
      var sId = small[si];
      if (parent[sId] !== sId || cArea[sId] >= minArea) continue;
      var nb = adj[sId]; if (!nb || nb.size === 0) continue;
      var sl = cL[sId] / cArea[sId], sa = cA[sId] / cArea[sId], sb2 = cB[sId] / cArea[sId];
      var bestT = -1, bestCost = Infinity, peri = 4 * Math.sqrt(cArea[sId]);
      nb.forEach(function (shared, t) {
        var dl = sl - cL[t] / cArea[t], da = sa - cA[t] / cArea[t], db = sb2 - cB[t] / cArea[t];
        var cost = Math.sqrt(dl * dl + da * da + db * db) - 4 * Math.min(1, shared / peri);
        if (cost < bestCost) { bestCost = cost; bestT = t; }
      });
      if (bestT < 0) continue;
      var t = bestT;
      parent[sId] = t; cArea[t] += cArea[sId]; cL[t] += cL[sId]; cA[t] += cA[sId]; cB[t] += cB[sId];
      var tm = adj[t];
      nb.forEach(function (cc, n2) {
        if (n2 === t) return;
        tm.set(n2, (tm.get(n2) || 0) + cc);
        var m2 = adj[n2]; m2.delete(sId); m2.set(t, (m2.get(t) || 0) + cc);
      });
      tm.delete(sId); adj[sId] = null;
    }
    var roots = [];
    for (i = 0; i < nc; i++) if (parent[i] === i) roots.push(i);
    roots.sort(function (p, q) { return cArea[q] - cArea[p]; });
    var newId = new Int32Array(nc).fill(-1);
    roots.forEach(function (rt, ni) { newId[rt] = ni; });
    var R = roots.length, regionMap = new Int32Array(N);
    for (i = 0; i < N; i++) regionMap[i] = newId[find(comp[i])];
    for (i = 0; i < N; i++) labels[i] = cLabel[roots[regionMap[i]]];

    // region stats
    var rArea = new Float64Array(R), rx0 = new Int32Array(R).fill(1e9), ry0 = new Int32Array(R).fill(1e9),
      rx1 = new Int32Array(R).fill(-1), ry1 = new Int32Array(R).fill(-1), rcx = new Float64Array(R), rcy = new Float64Array(R),
      rR = new Float64Array(R), rG = new Float64Array(R), rB = new Float64Array(R), rL = new Float64Array(R), rA = new Float64Array(R), rBl = new Float64Array(R),
      rFine = new Float64Array(R), rTex = new Float64Array(R), rBord = new Float64Array(R), rGray = new Float64Array(R);
    var bL = 0, bA = 0, bB = 0, bn = 0;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x; var r = regionMap[i];
        rArea[r]++; if (x < rx0[r]) rx0[r] = x; if (x > rx1[r]) rx1[r] = x; if (y < ry0[r]) ry0[r] = y; if (y > ry1[r]) ry1[r] = y;
        rcx[r] += x; rcy[r] += y;
        rR[r] += rgba[4 * i]; rG[r] += rgba[4 * i + 1]; rB[r] += rgba[4 * i + 2];
        rL[r] += Lc[i]; rA[r] += Ac[i]; rBl[r] += Bc[i];
        rFine[r] += fine[i]; rTex[r] += texture[i]; rGray[r] += gray[i];
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { rBord[r]++; bL += Lc[i]; bA += Ac[i]; bB += Bc[i]; bn++; }
      }
    }
    var borderLab = bn ? [bL / bn, bA / bn, bB / bn] : [50, 0, 0];
    var regions = [];
    for (i = 0; i < R; i++) {
      var ar = rArea[i], ci2 = cLabel[roots[i]];
      regions.push({
        id: i, colorIndex: ci2, area: ar, bbox: [rx0[i], ry0[i], rx1[i], ry1[i]],
        centroid: [rcx[i] / ar, rcy[i] / ar],
        meanRgb: [Math.round(rR[i] / ar), Math.round(rG[i] / ar), Math.round(rB[i] / ar)],
        meanL: rL[i] / ar,
        edgeDensity: Math.min(1, rFine[i] / ar * 5), textureLevel: rTex[i] / ar,
        touchesBorder: rBord[i] >= 3, role: 'secondary', roleSource: 'auto', order: 0, label: '',
        _borderCount: rBord[i], _meanGray: rGray[i] / ar,
        _lab: [rL[i] / ar, rA[i] / ar, rBl[i] / ar], _fill: palette[ci2].rgb.slice()
      });
    }

    var an = {
      width: w, height: h, rgba: rgba, gray: gray,
      edges: { mag: mag, strong: strong, fine: fine },
      palette: palette, labels: labels, regionMap: regionMap, regions: regions,
      shading: null, smooth: null, texture: texture, composition: null,
      complexity: { score: score0, stageCount: 9 },
      _borderLab: borderLab, _minArea: minArea
    };

    assignRoles(an);

    // smooth (per-region box filter, normalised by same-region pixels)
    an.smooth = regionSmooth(an, 7);

    // shading
    computeShading(an, gb);

    // horizon + composition
    an._horizon = detectHorizon(strong, gx, gy, w, h);
    computeComposition(an);

    var regScore = sat(R / 70);
    an.complexity.score = sat(0.8 * score0 + 0.2 * regScore);
    an.complexity.stageCount = planStages(an).length;
    return an;
  }

  function maxOf(a) { var m = -Infinity; for (var i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return m; }

  /* ------------------------------------------------------------------ roles */
  function assignRoles(an) {
    var w = an.width, h = an.height, N = w * h, perim = 2 * (w + h), diag = Math.hypot(w, h);
    var cx = w / 2, cy = h / 2, bl = an._borderLab, regs = an.regions;
    var detailArea = Math.max(an._minArea * 1.2, 0.004 * N), bestFg = null, bestFgScore = -1, anyFg = false;
    regs.forEach(function (r) {
      if (r.roleSource !== 'auto') return;
      var af = r.area / N;
      var borderShare = sat(r._borderCount / (0.3 * perim));
      var dEb = labDist(r._lab, bl);
      var simB = 1 - sat(dEb / 35);
      var bg = 0.28 * sat(af / 0.12) + 0.27 * borderShare + 0.2 * (1 - r.edgeDensity) + 0.25 * simB;
      var cen = 1 - sat(Math.hypot(r.centroid[0] - cx, r.centroid[1] - cy) / (0.5 * diag));
      var fg = 0.25 * cen + 0.3 * r.edgeDensity + 0.25 * sat(dEb / 40) + 0.2 * sat(af / 0.03) - 0.25 * borderShare;
      r._bg = bg; r._fg = fg;
      if (r.area < detailArea) r.role = 'detail';
      else if (bg >= 0.55 && bg >= fg) r.role = 'background';
      else if (fg >= 0.48) r.role = 'foreground';
      else r.role = 'secondary';
      if (r.role === 'foreground') anyFg = true;
      if (r.area >= detailArea && fg > bestFgScore) { bestFgScore = fg; bestFg = r; }
    });
    if (!anyFg && bestFg && bestFg.roleSource === 'auto') bestFg.role = 'foreground';
    // busy images: still offer the most background-like large region as background
    if (!regs.some(function (r) { return r.role === 'background'; })) {
      var bb = null;
      regs.forEach(function (r) {
        if (r.roleSource === 'auto' && r.role !== 'detail' && r !== bestFg && r.area > 0.01 * N && (!bb || r._bg > bb._bg)) bb = r;
      });
      if (bb && bb._bg >= 0.36) bb.role = 'background';
    }
    renumberOrders(an);
  }
  function renumberOrders(an) {
    ROLES.forEach(function (role) {
      an.regions.filter(function (r) { return r.role === role; })
        .sort(function (p, q) { return q.area - p.area; })
        .forEach(function (r, k) { r.order = k; });
    });
  }

  /* ------------------------------------------------------------------ smoothing */
  function regionSmooth(an, rad) {
    var w = an.width, h = an.height, N = w * h, rm = an.regionMap, src = an.rgba;
    var cur = new Float32Array(3 * N), tmp = new Float32Array(3 * N), x, y, j, i, c;
    for (i = 0; i < N; i++) { cur[3 * i] = src[4 * i]; cur[3 * i + 1] = src[4 * i + 1]; cur[3 * i + 2] = src[4 * i + 2]; }
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x; var id = rm[i], s0 = 0, s1 = 0, s2 = 0, n = 0;
        var xa = Math.max(0, x - rad), xb = Math.min(w - 1, x + rad);
        for (j = xa; j <= xb; j++) { var k = y * w + j; if (rm[k] === id) { s0 += cur[3 * k]; s1 += cur[3 * k + 1]; s2 += cur[3 * k + 2]; n++; } }
        tmp[3 * i] = s0 / n; tmp[3 * i + 1] = s1 / n; tmp[3 * i + 2] = s2 / n;
      }
    }
    var out = new Uint8ClampedArray(4 * N);
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x; var id2 = rm[i], t0 = 0, t1 = 0, t2 = 0, n2 = 0;
        var ya = Math.max(0, y - rad), yb = Math.min(h - 1, y + rad);
        for (j = ya; j <= yb; j++) { var k2 = j * w + x; if (rm[k2] === id2) { t0 += tmp[3 * k2]; t1 += tmp[3 * k2 + 1]; t2 += tmp[3 * k2 + 2]; n2++; } }
        out[4 * i] = t0 / n2; out[4 * i + 1] = t1 / n2; out[4 * i + 2] = t2 / n2; out[4 * i + 3] = 255;
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------ shading */
  function computeShading(an, grayBlur) {
    var w = an.width, h = an.height, N = w * h, rm = an.regionMap, i;
    var gm = new Float32Array(an.regions.length ? an.regions[an.regions.length - 1].id + 1 : 1);
    an.regions.forEach(function (r) { gm[r.id] = r._meanGray; });
    var delta = new Float32Array(N);
    for (i = 0; i < N; i++) delta[i] = grayBlur[i] - gm[rm[i]];
    var p7 = percentile(delta, 0.07), p25 = percentile(delta, 0.25), p78 = percentile(delta, 0.78), p95 = percentile(delta, 0.95);
    var bands = new Uint8Array(N), sh = new Uint8Array(N), hl = new Uint8Array(N);
    var sAmt = new Float32Array(N), hAmt = new Float32Array(N), M = 0.03;
    for (i = 0; i < N; i++) {
      var d = delta[i], b = 2;
      if (d < p7 && d < -M) b = 0; else if (d < p25 && d < -M * 0.6) b = 1;
      else if (d > p95 && d > M) b = 4; else if (d > p78 && d > M * 0.6) b = 3;
      bands[i] = b;
      if (b <= 1) sh[i] = 1; if (b === 4) hl[i] = 1;
      sAmt[i] = b === 0 ? 1 : b === 1 ? 0.55 : 0;
      hAmt[i] = b === 4 ? 1 : b === 3 ? 0.25 : 0;
    }
    an.shading = { bands: bands, shadowMask: sh, highlightMask: hl };
    an._shadowAmt = blurF(sAmt, w, h, 1.2);
    an._hlAmt = blurF(hAmt, w, h, 1.2);
  }

  /* ------------------------------------------------------------------ horizon */
  function detectHorizon(strong, gx, gy, w, h) {
    var hE = new Uint8Array(w * h), i, x, y;
    for (i = 0; i < w * h; i++) if (strong[i] && Math.abs(gy[i]) > 1.7 * Math.abs(gx[i])) hE[i] = 1;
    var best = 0, bestRow = -1, runs = new Float32Array(h);
    for (y = 2; y < h - 2; y++) {
      var run = 0, gap = 0, longest = 0;
      for (x = 0; x < w; x++) {
        var on = hE[(y - 1) * w + x] | hE[y * w + x] | hE[(y + 1) * w + x];
        if (on) { run += 1 + gap; gap = 0; if (run > longest) longest = run; }
        else { gap++; if (gap > 4) { run = 0; gap = 0; } }
      }
      runs[y] = longest;
      if (longest > best) { best = longest; bestRow = y; }
    }
    if (bestRow < 0 || best < 0.4 * w || bestRow < 0.02 * h || bestRow > 0.98 * h) return null;
    var y0 = bestRow, y1 = bestRow;
    while (y0 > 2 && runs[y0 - 1] >= 0.85 * best) y0--;
    while (y1 < h - 3 && runs[y1 + 1] >= 0.85 * best) y1++;
    return (y0 + y1) / 2;
  }

  /* ------------------------------------------------------------------ composition */
  function idMap(an) {
    if (!an._byId || an._byIdN !== an.regions.length) {
      an._byId = new Map(); an.regions.forEach(function (r) { an._byId.set(r.id, r); }); an._byIdN = an.regions.length;
    }
    return an._byId;
  }
  function computeComposition(an) {
    var w = an.width, h = an.height, N = w * h, fgs = an.regions.filter(function (r) { return r.role === 'foreground'; });
    var thirds = { x: [w / 3, 2 * w / 3], y: [h / 3, 2 * h / 3] };
    var com = [w / 2, h / 2], box = [0, 0, w - 1, h - 1];
    if (fgs.length) {
      var tot = 0, sx = 0, sy = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      fgs.forEach(function (r) {
        tot += r.area; sx += r.centroid[0] * r.area; sy += r.centroid[1] * r.area;
        x0 = Math.min(x0, r.bbox[0]); y0 = Math.min(y0, r.bbox[1]); x1 = Math.max(x1, r.bbox[2]); y1 = Math.max(y1, r.bbox[3]);
      });
      com = [sx / tot, sy / tot]; box = [x0, y0, x1, y1];
    }
    var cand = fgs.slice().sort(function (p, q) { return q.area - p.area; });
    var shapes = [];
    function tryFit(r) {
      if (shapes.length >= 4 || r.area < 0.01 * N) return;
      var bw = r.bbox[2] - r.bbox[0] + 1, bh = r.bbox[3] - r.bbox[1] + 1;
      if (bw > 0.88 * w && bh > 0.88 * h) return;
      var s = fitShape(an, r); if (s) shapes.push(s);
    }
    cand.forEach(tryFit);
    if (shapes.length < 2) {
      an.regions.filter(function (r) { return r.role === 'secondary'; }).sort(function (p, q) { return q.area - p.area; }).slice(0, 3).forEach(tryFit);
    }
    an.composition = { thirds: thirds, centerOfMass: com, subjectBox: box, horizon: an._horizon == null ? null : an._horizon, shapes: shapes };
  }
  function fitShape(an, r) {
    var w = an.width, rm = an.regionMap, id = r.id, x, y;
    var n = 0, mx = 0, my = 0, mxx = 0, myy = 0, mxy = 0;
    for (y = r.bbox[1]; y <= r.bbox[3]; y++) for (x = r.bbox[0]; x <= r.bbox[2]; x++) {
      if (rm[y * w + x] !== id) continue;
      n++; mx += x; my += y; mxx += x * x; myy += y * y; mxy += x * y;
    }
    if (n < 30) return null;
    mx /= n; my /= n;
    var cxx = mxx / n - mx * mx, cyy = myy / n - my * my, cxy = mxy / n - mx * my;
    var tr = cxx + cyy, det = cxx * cyy - cxy * cxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    var l1 = tr / 2 + disc, l2 = Math.max(1e-6, tr / 2 - disc);
    var th = 0.5 * Math.atan2(2 * cxy, cxx - cyy), co = Math.cos(th), si = Math.sin(th);
    var uMin = 1e9, uMax = -1e9, vMin = 1e9, vMax = -1e9;
    for (y = r.bbox[1]; y <= r.bbox[3]; y++) for (x = r.bbox[0]; x <= r.bbox[2]; x++) {
      if (rm[y * w + x] !== id) continue;
      var u = (x - mx) * co + (y - my) * si, v = -(x - mx) * si + (y - my) * co;
      if (u < uMin) uMin = u; if (u > uMax) uMax = u; if (v < vMin) vMin = v; if (v > vMax) vMax = v;
    }
    var W = uMax - uMin + 1, H = vMax - vMin + 1, fill = n / (W * H);
    if (fill > 0.86) {
      var mu = (uMin + uMax) / 2, mv = (vMin + vMax) / 2;
      return { type: 'rect', cx: mx + mu * co - mv * si, cy: my + mu * si + mv * co, rx: W / 2, ry: H / 2, angle: th, regionIds: [id] };
    }
    return { type: 'ellipse', cx: mx, cy: my, rx: 2 * Math.sqrt(l1), ry: 2 * Math.sqrt(l2), angle: th, regionIds: [id] };
  }
  function refreshDerived(an) {
    computeComposition(an);
    an.complexity.stageCount = planStages(an).length;
  }

  /* ------------------------------------------------------------------ stage plan */
  var TITLES = {
    guides: 'Composition guides — thirds, centre of mass, subject box measured from your image',
    construction: 'Basic construction — shapes fitted by geometry',
    silhouettes: 'Main silhouettes — outer boundary of the detected subject',
    outlines: 'Refined outlines — edges extracted from your image',
    details: 'Internal details — finer edges found inside the subject',
    bgBase: 'Background base colours — flat palette fill',
    fgBase: 'Subject base colours — flat palette fill',
    secondary: 'Secondary colour areas — mid-size and small regions',
    shadows: 'Shadows — darker value bands multiplied in',
    gradients: 'Gradients — flat fills blended toward smooth tones',
    textures: 'Textures — fine detail added where the image is busy',
    highlights: 'Highlights — the lightest areas lifted',
    final: 'Final details — your original image'
  };
  var KINDS = {
    guides: 'construction', construction: 'construction', silhouettes: 'line', outlines: 'line', details: 'line',
    bgBase: 'color', fgBase: 'color', secondary: 'color', shadows: 'value', gradients: 'value', textures: 'value',
    highlights: 'value', final: 'finish'
  };
  function derivedStats(an) {
    var N = an.width * an.height, cnt = { background: 0, foreground: 0, secondary: 0, detail: 0 }, i;
    an.regions.forEach(function (r) { cnt[r.role]++; });
    var sh = 0, hl = 0, fd = 0, rm = an.regionMap, byId = idMap(an);
    var fgFlag = new Uint8Array(an.regions.length ? Math.max.apply(null, an.regions.map(function (r) { return r.id; })) + 1 : 1);
    an.regions.forEach(function (r) { if (r.role === 'foreground') fgFlag[r.id] = 1; });
    var sm = an.shading.shadowMask, hm = an.shading.highlightMask, fine = an.edges.fine, st = an.edges.strong;
    for (i = 0; i < N; i++) { sh += sm[i]; hl += hm[i]; if (fine[i] && !st[i] && fgFlag[rm[i]]) fd++; }
    return { cnt: cnt, shadow: sh / N, highlight: hl / N, fineFg: fd / N, byId: byId };
  }
  function planStages(an) {
    var st = derivedStats(an), score = an.complexity.score, plan = [];
    function add(key, includes) { plan.push({ key: key, title: TITLES[key], kind: KINDS[key], includes: includes || [key] }); }
    add('guides');
    if (an.composition && an.composition.shapes.length) add('construction');
    if (st.cnt.foreground > 0) add('silhouettes');
    add('outlines');
    if (st.cnt.foreground > 0 && st.fineFg > 0.0015 && score >= 0.2) add('details');
    if (st.cnt.background > 0) add('bgBase');
    if (st.cnt.foreground > 0) add('fgBase');
    if (st.cnt.secondary + st.cnt.detail > 0) add('secondary');
    if (st.shadow > 0.01) add('shadows');
    if (score < 0.3) {
      plan.push({ key: 'gradients', title: 'Gradients & textures — smooth tones plus fine detail', kind: 'value', includes: ['gradients', 'textures'] });
    } else { add('gradients'); add('textures'); }
    if (st.highlight > 0.004) add('highlights');
    add('final');
    return plan;
  }

  /* ------------------------------------------------------------------ rendering */
  function activeSet(an, key, previous) {
    var plan = planStages(an), idx = -1, A = {}, s;
    for (s = 0; s < plan.length; s++) if (plan[s].key === key || plan[s].includes.indexOf(key) >= 0) { idx = s; break; }
    if (previous) {
      if (idx < 0) { var vi = ORDER.indexOf(key) - 1; for (var q = 0; q <= vi; q++) A[ORDER[q]] = true; return A; }
      idx -= 1;
    } else if (idx < 0) {
      var v2 = ORDER.indexOf(key); if (v2 < 0) v2 = ORDER.length - 1;
      for (var q2 = 0; q2 <= v2; q2++) A[ORDER[q2]] = true; return A;
    }
    for (s = 0; s <= idx; s++) { A[plan[s].key] = true; plan[s].includes.forEach(function (k) { A[k] = true; }); }
    return A;
  }
  function fgFilledMask(an) {
    var w = an.width, h = an.height, N = w * h, rm = an.regionMap, i;
    var maxId = 0; an.regions.forEach(function (r) { if (r.id > maxId) maxId = r.id; });
    var flag = new Uint8Array(maxId + 1);
    an.regions.forEach(function (r) { if (r.role === 'foreground') flag[r.id] = 1; });
    var fg = new Uint8Array(N), any = false;
    for (i = 0; i < N; i++) { if (flag[rm[i]]) { fg[i] = 1; any = true; } }
    if (!any) return null;
    // fill holes: flood the outside, whatever is not reached becomes subject
    var out = new Uint8Array(N), stack = new Int32Array(N), sp = 0, x, y, k;
    function push(p) { if (!fg[p] && !out[p]) { out[p] = 1; stack[sp++] = p; } }
    for (x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (sp > 0) {
      i = stack[--sp]; x = i % w; y = (i / w) | 0;
      if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (y > 0) push(i - w); if (y < h - 1) push(i + w);
    }
    var res = new Uint8Array(N);
    for (k = 0; k < N; k++) res[k] = out[k] ? 0 : 1;
    return res;
  }

  function paintBuffer(an, A, L, opts) {
    var w = an.width, h = an.height, N = w * h, rgba = an.rgba, rm = an.regionMap, i;
    var out = new Uint8ClampedArray(4 * N);
    var exact = A.final && L.color !== false && L.values !== false;
    if (exact) { out.set(rgba); return out; }
    out.fill(255);

    var maxId = 0; an.regions.forEach(function (r) { if (r.id > maxId) maxId = r.id; });
    var paint = new Uint8Array(maxId + 1), fr = new Uint8Array(maxId + 1), fg = new Uint8Array(maxId + 1), fb = new Uint8Array(maxId + 1);
    an.regions.forEach(function (r) {
      var p = (r.role === 'background' && A.bgBase) || (r.role === 'foreground' && A.fgBase) ||
        ((r.role === 'secondary' || r.role === 'detail') && A.secondary);
      paint[r.id] = (p && L.color !== false) ? 1 : 0;
      fr[r.id] = r._fill[0]; fg[r.id] = r._fill[1]; fb[r.id] = r._fill[2];
    });
    var vals = L.values !== false;
    var useGrad = A.gradients && vals, useTex = A.textures && vals, useSh = A.shadows && vals, useHl = A.highlights && vals;
    var sm = an.smooth, tex = an.texture, shA = an._shadowAmt, hlA = an._hlAmt;
    var colored = false;
    for (i = 0; i < N; i++) {
      var id = rm[i];
      if (!paint[id]) continue;
      colored = true;
      var r, g, b, o = 4 * i;
      if (useGrad) {
        r = fr[id] * 0.1 + sm[o] * 0.9; g = fg[id] * 0.1 + sm[o + 1] * 0.9; b = fb[id] * 0.1 + sm[o + 2] * 0.9;
      } else { r = fr[id]; g = fg[id]; b = fb[id]; }
      if (useTex) {
        var ta = smoothstep(0.2, 0.65, tex[i]);
        r += (rgba[o] - sm[o]) * ta; g += (rgba[o + 1] - sm[o + 1]) * ta; b += (rgba[o + 2] - sm[o + 2]) * ta;
      }
      if (useSh) {
        var f = 1 - (useGrad ? 0.3 : 0.55) * shA[i];
        r *= f; g *= f; b *= f;
      }
      if (useHl) {
        var ha = 0.6 * hlA[i];
        r += (255 - r) * ha; g += (255 - g) * ha; b += (255 - b) * ha;
      }
      out[o] = r; out[o + 1] = g; out[o + 2] = b;
    }

    // line layers
    var fade = 1;
    if (A.shadows) fade = 0.8; if (A.gradients) fade = 0.55; if (A.textures) fade = 0.35; if (A.highlights) fade = 0.2;
    if (A.final) fade = 0;
    function blend(p, cr, cg, cb, a) {
      var o = 4 * p;
      out[o] = out[o] * (1 - a) + cr * a; out[o + 1] = out[o + 1] * (1 - a) + cg * a; out[o + 2] = out[o + 2] * (1 - a) + cb * a;
    }
    if (L.lines !== false && fade > 0) {
      var fill = (A.silhouettes || A.details) ? fgFilledMask(an) : null;
      if (A.silhouettes && fill) {
        var x, y, a = 0.8 * fade;
        for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) {
          i = y * w + x;
          if (fill[i] && (!fill[i - 1] || !fill[i + 1] || !fill[i - w] || !fill[i + w])) {
            blend(i, 140, 140, 140, a); blend(i - 1, 150, 150, 150, a * 0.6); blend(i - w, 150, 150, 150, a * 0.6);
          }
        }
      }
      if (A.details && fill) {
        var ad = 0.75 * fade, fine = an.edges.fine, st = an.edges.strong;
        for (i = 0; i < N; i++) if (fine[i] && !st[i] && fill[i]) blend(i, 70, 70, 74, ad);
      }
      if (A.outlines) {
        var st2 = an.edges.strong;
        for (i = 0; i < N; i++) if (st2[i]) blend(i, 12, 12, 14, fade);
      }
    }
    // red highlight of a region
    if (opts.highlightRegion != null) {
      var hr = idMap(an).get(opts.highlightRegion);
      if (hr) {
        var hid = hr.id, bb = hr.bbox, xx, yy;
        for (yy = Math.max(1, bb[1] - 1); yy <= Math.min(h - 2, bb[3] + 1); yy++) for (xx = Math.max(1, bb[0] - 1); xx <= Math.min(w - 2, bb[2] + 1); xx++) {
          var p = yy * w + xx;
          if (rm[p] === hid && (rm[p - 1] !== hid || rm[p + 1] !== hid || rm[p - w] !== hid || rm[p + w] !== hid)) {
            blend(p, 230, 30, 30, 1); blend(p + 1, 230, 30, 30, 0.8); blend(p + w, 230, 30, 30, 0.8);
          }
        }
      }
    }
    return out;
  }

  function drawOverlays(ctx, an, A, L, sc) {
    var w = an.width, h = an.height, comp = an.composition;
    var colored = A.bgBase || A.fgBase || A.secondary;
    if (A.final && L.color !== false && L.values !== false) return;
    ctx.save(); ctx.scale(sc, sc);
    var fadeAll = A.highlights ? 0.3 : A.textures ? 0.45 : A.gradients ? 0.6 : 1;
    if (A.construction && L.construction !== false && comp.shapes.length) {
      var a = (A.outlines ? 0.4 : 0.7) * fadeAll;
      ctx.strokeStyle = 'rgba(88,88,96,' + a + ')'; ctx.lineWidth = 1.3; ctx.setLineDash([]);
      comp.shapes.forEach(function (s) {
        ctx.save(); ctx.translate(s.cx, s.cy); ctx.rotate(s.angle);
        ctx.beginPath();
        if (s.type === 'ellipse') ctx.ellipse(0, 0, s.rx, s.ry, 0, 0, Math.PI * 2); else ctx.rect(-s.rx, -s.ry, 2 * s.rx, 2 * s.ry);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(88,88,96,' + a * 0.55 + ')'; ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(-s.rx, 0); ctx.lineTo(s.rx, 0); ctx.moveTo(0, -s.ry); ctx.lineTo(0, s.ry); ctx.stroke();
        ctx.restore();
      });
    }
    if (A.guides && L.guides !== false) {
      var ga = (colored ? 0.4 : 0.85) * fadeAll;
      ctx.strokeStyle = 'rgba(40,110,230,' + ga + ')'; ctx.lineWidth = 0.9; ctx.setLineDash([]);
      ctx.beginPath();
      comp.thirds.x.forEach(function (x) { ctx.moveTo(x, 0); ctx.lineTo(x, h); });
      comp.thirds.y.forEach(function (y) { ctx.moveTo(0, y); ctx.lineTo(w, y); });
      ctx.stroke();
      var bx = comp.subjectBox;
      ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.rect(bx[0], bx[1], bx[2] - bx[0] + 1, bx[3] - bx[1] + 1); ctx.stroke(); ctx.setLineDash([]);
      var cm = comp.centerOfMass, cr = Math.max(5, 0.012 * Math.max(w, h));
      ctx.beginPath(); ctx.arc(cm[0], cm[1], cr, 0, Math.PI * 2);
      ctx.moveTo(cm[0] - 2 * cr, cm[1]); ctx.lineTo(cm[0] + 2 * cr, cm[1]); ctx.moveTo(cm[0], cm[1] - 2 * cr); ctx.lineTo(cm[0], cm[1] + 2 * cr); ctx.stroke();
      if (comp.horizon != null) {
        ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, comp.horizon); ctx.lineTo(w, comp.horizon); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function renderWith(an, A, opts) {
    opts = opts || {};
    var L = opts.layers || {}, sc = opts.scale || 1, w = an.width, h = an.height;
    var buf = paintBuffer(an, A, L, opts);
    var base = mkCanvas(w, h), bctx = base.getContext('2d');
    bctx.putImageData(new ImageData(buf, w, h), 0, 0);
    var out = base;
    if (sc !== 1) {
      out = mkCanvas(Math.max(1, Math.round(w * sc)), Math.max(1, Math.round(h * sc)));
      var c2 = out.getContext('2d'); c2.imageSmoothingEnabled = true; c2.imageSmoothingQuality = 'high';
      c2.drawImage(base, 0, 0, out.width, out.height);
    }
    drawOverlays(out.getContext('2d'), an, A, L, out.width / w);
    return out;
  }
  function renderStage(an, key, opts) {
    return renderWith(an, activeSet(an, key, false), opts);
  }
  function renderDelta(an, key) {
    var w = an.width, h = an.height, cur = renderWith(an, activeSet(an, key, false), {});
    var A0 = activeSet(an, key, true), prev;
    prev = Object.keys(A0).length ? renderWith(an, A0, {}) : null;
    var cd = cur.getContext('2d').getImageData(0, 0, w, h).data;
    var pd = prev ? prev.getContext('2d').getImageData(0, 0, w, h).data : null;
    var out = mkCanvas(w, h), oc = out.getContext('2d'), od = oc.createImageData(w, h), o = od.data;
    for (var i = 0; i < w * h; i++) {
      var q = 4 * i, pr = pd ? pd[q] : 255, pg = pd ? pd[q + 1] : 255, pb = pd ? pd[q + 2] : 255;
      var diff = Math.abs(cd[q] - pr) + Math.abs(cd[q + 1] - pg) + Math.abs(cd[q + 2] - pb);
      if (diff > 24) { o[q] = cd[q]; o[q + 1] = cd[q + 1]; o[q + 2] = cd[q + 2]; o[q + 3] = 235; }
    }
    oc.putImageData(od, 0, 0);
    return out;
  }

  /* ------------------------------------------------------------------ region tools */
  function regionAt(an, x, y) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= an.width || y >= an.height) return null;
    return idMap(an).get(an.regionMap[y * an.width + x]) || null;
  }
  function setRole(an, id, role, source) {
    if (ROLES.indexOf(role) < 0) throw new Error('DMEngine.setRole: bad role ' + role);
    var r = idMap(an).get(id); if (!r) return null;
    if (r.role !== role) {
      var mx = -1; an.regions.forEach(function (q) { if (q.role === role && q.id !== id && q.order > mx) mx = q.order; });
      r.order = mx + 1;
    }
    r.role = role; r.roleSource = source || 'user';
    refreshDerived(an);
    return r;
  }
  function setOrder(an, id, order) {
    var r = idMap(an).get(id); if (!r) return null;
    var group = an.regions.filter(function (q) { return q.role === r.role && q.id !== id; }).sort(function (p, q) { return p.order - q.order; });
    var pos = clamp(Math.round(order), 0, group.length);
    group.splice(pos, 0, r);
    group.forEach(function (q, k) { q.order = k; });
    return r;
  }
  function mergeRegions(an, idA, idB) {
    if (idA === idB) return null;
    var m = idMap(an), A = m.get(idA), B = m.get(idB); if (!A || !B) return null;
    var w = an.width, rm = an.regionMap, bb = B.bbox, x, y;
    for (y = bb[1]; y <= bb[3]; y++) for (x = bb[0]; x <= bb[2]; x++) if (rm[y * w + x] === idB) rm[y * w + x] = idA;
    var t = A.area + B.area, wa = A.area / t, wb = B.area / t;
    function mix(p, q) { return p.map(function (v, k) { return v * wa + q[k] * wb; }); }
    A.centroid = mix(A.centroid, B.centroid);
    A.meanRgb = mix(A.meanRgb, B.meanRgb).map(Math.round);
    A._fill = mix(A._fill, B._fill).map(Math.round);
    A._lab = mix(A._lab, B._lab);
    A.meanL = A.meanL * wa + B.meanL * wb;
    A.edgeDensity = A.edgeDensity * wa + B.edgeDensity * wb;
    A.textureLevel = A.textureLevel * wa + B.textureLevel * wb;
    A._meanGray = A._meanGray * wa + B._meanGray * wb;
    A._borderCount += B._borderCount; A.touchesBorder = A.touchesBorder || B.touchesBorder;
    if (B.area > A.area) A.colorIndex = B.colorIndex;
    A.bbox = [Math.min(A.bbox[0], bb[0]), Math.min(A.bbox[1], bb[1]), Math.max(A.bbox[2], bb[2]), Math.max(A.bbox[3], bb[3])];
    A.area = t;
    an.regions.splice(an.regions.indexOf(B), 1);
    m.delete(idB); an._byId = null;
    refreshDerived(an);
    return A;
  }
  function regionMask(an, id) {
    var w = an.width, h = an.height, c = mkCanvas(w, h), ctx = c.getContext('2d');
    var r = idMap(an).get(id); if (!r) return c;
    var img = ctx.createImageData(w, h), d = img.data, rm = an.regionMap, bb = r.bbox, x, y;
    for (y = bb[1]; y <= bb[3]; y++) for (x = bb[0]; x <= bb[2]; x++) {
      if (rm[y * w + x] === id) { var o = 4 * (y * w + x); d[o] = 255; d[o + 1] = 70; d[o + 2] = 70; d[o + 3] = 115; }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  /* ------------------------------------------------------------------ helpers */
  function toBlob(canvas, type) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('toBlob failed')); }, type || 'image/png');
    });
  }
  function summary(an) {
    var w = an.width, h = an.height, N = w * h;
    function pct(v, d) { return Math.round(v / d * 1000) / 10; }
    var regs = an.regions.slice().sort(function (p, q) { return q.area - p.area; }).slice(0, 40).map(function (r) {
      var hx = toHex(r.meanRgb);
      return {
        id: r.id, role: r.role, area_pct: pct(r.area, N),
        bbox_pct: [pct(r.bbox[0], w), pct(r.bbox[1], h), pct(r.bbox[2] + 1, w), pct(r.bbox[3] + 1, h)],
        centroid_pct: [pct(r.centroid[0], w), pct(r.centroid[1], h)],
        color: hx, colorName: colorName(r.meanRgb), meanL: Math.round(r.meanL), touchesBorder: r.touchesBorder
      };
    });
    var c = an.composition;
    return {
      width: w, height: h, complexity: { score: Math.round(an.complexity.score * 100) / 100, stageCount: an.complexity.stageCount },
      palette: an.palette.map(function (p) { return { hex: p.hex, name: colorName(p.rgb), share: Math.round(p.count / N * 1000) / 1000 }; }),
      regions: regs,
      composition: {
        subjectBox_pct: [pct(c.subjectBox[0], w), pct(c.subjectBox[1], h), pct(c.subjectBox[2] + 1, w), pct(c.subjectBox[3] + 1, h)],
        centerOfMass_pct: [pct(c.centerOfMass[0], w), pct(c.centerOfMass[1], h)],
        horizon_pct: c.horizon == null ? null : pct(c.horizon, h)
      }
    };
  }

  global.DMEngine = {
    version: VERSION, prepare: prepare, analyze: analyze, planStages: planStages,
    renderStage: renderStage, renderDelta: renderDelta,
    regionAt: regionAt, setRole: setRole, setOrder: setOrder, mergeRegions: mergeRegions, regionMask: regionMask,
    toBlob: toBlob, colorName: colorName, summary: summary
  };
})(typeof window !== 'undefined' ? window : this);
