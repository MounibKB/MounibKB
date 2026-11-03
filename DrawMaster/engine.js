/* DrawMaster engine — image analysis + cumulative stage rendering.
 * One global: window.DMEngine. Plain JS, typed arrays, no libraries, no network, no eval.
 * Every stage is computed from the uploaded pixels and drawn at the exact same pixel positions. */
(function (global) {
  'use strict';

  var VERSION = '2.0.0';
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

  /* ====================================================================== v2: illustration plan */
  var PAPER = [251, 248, 241];
  var INK = '#2b2723';
  var _PT = 0, _PON = false;
  function PROF(n) { if (_PON) { var t = performance.now(); console.log('prof ' + n + ' ' + Math.round(t - _PT)); _PT = t; } }

  function bilateralLab(L, A, B, w, h, rad, sr, iters) {
    var N = w * h, inv = 1 / (2 * sr * sr), lut = new Float32Array(4096), ss = rad * 0.8, sp = [], dx, dy, x, y, i, it;
    for (dy = -rad; dy <= rad; dy++) for (dx = -rad; dx <= rad; dx++) sp.push(Math.exp(-(dx * dx + dy * dy) / (2 * ss * ss)));
    for (i = 0; i < 4096; i++) lut[i] = Math.exp(-(i / 4) * inv);
    for (it = 0; it < iters; it++) {
      var L2 = new Float32Array(N), A2 = new Float32Array(N), B2 = new Float32Array(N);
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
        i = y * w + x; var l0 = L[i], a0 = A[i], b0 = B[i], sw = 0, sl = 0, sa = 0, sb = 0, k = 0;
        for (dy = -rad; dy <= rad; dy++) {
          var yy = y + dy; if (yy < 0 || yy >= h) { k += 2 * rad + 1; continue; }
          for (dx = -rad; dx <= rad; dx++, k++) {
            var xx = x + dx; if (xx < 0 || xx >= w) continue;
            var j = yy * w + xx, d0 = L[j] - l0, d1 = A[j] - a0, d2 = B[j] - b0;
            var q4 = ((d0 * d0 + d1 * d1 + d2 * d2) * 4) | 0, wt = sp[k] * (q4 > 4095 ? 0 : lut[q4]);
            sw += wt; sl += wt * L[j]; sa += wt * A[j]; sb += wt * B[j];
          }
        }
        L2[i] = sl / sw; A2[i] = sa / sw; B2[i] = sb / sw;
      }
      L = L2; A = A2; B = B2;
    }
    return [L, A, B];
  }

  function modeFilterLabels(lab, w, h, r, K, passes) {
    var N = w * h, cnt = new Int32Array(K), p, x, y, dx, dy;
    for (p = 0; p < passes; p++) {
      var out = new Uint8Array(N);
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
        cnt.fill(0);
        var y0 = y - r < 0 ? 0 : y - r, y1 = y + r >= h ? h - 1 : y + r, x0 = x - r < 0 ? 0 : x - r, x1 = x + r >= w ? w - 1 : x + r;
        for (dy = y0; dy <= y1; dy++) for (dx = x0; dx <= x1; dx++) cnt[lab[dy * w + dx]]++;
        var best = lab[y * w + x], bc = cnt[best];
        for (var c = 0; c < K; c++) if (cnt[c] > bc) { bc = cnt[c]; best = c; }
        out[y * w + x] = best;
      }
      lab = out;
    }
    return lab;
  }

  // 4-connected components of an integer map. Returns {comp, n}
  function components(map, w, h) {
    var N = w * h, comp = new Int32Array(N).fill(-1), stack = new Int32Array(N), nc = 0, s, i, j, x, y;
    for (s = 0; s < N; s++) {
      if (comp[s] >= 0) continue;
      var l = map[s], sp = 0; stack[sp++] = s; comp[s] = nc;
      while (sp > 0) {
        i = stack[--sp]; x = i % w; y = (i / w) | 0;
        if (x > 0) { j = i - 1; if (comp[j] < 0 && map[j] === l) { comp[j] = nc; stack[sp++] = j; } }
        if (x < w - 1) { j = i + 1; if (comp[j] < 0 && map[j] === l) { comp[j] = nc; stack[sp++] = j; } }
        if (y > 0) { j = i - w; if (comp[j] < 0 && map[j] === l) { comp[j] = nc; stack[sp++] = j; } }
        if (y < h - 1) { j = i + w; if (comp[j] < 0 && map[j] === l) { comp[j] = nc; stack[sp++] = j; } }
      }
      nc++;
    }
    return { comp: comp, n: nc };
  }

  // relabel tiny components to the label they border most
  function cleanSmallComponents(map, w, h, minPx, K) {
    var N = w * h, cc = components(map, w, h), comp = cc.comp, nc = cc.n, size = new Int32Array(nc), i, c;
    for (i = 0; i < N; i++) size[comp[i]]++;
    var small = [];
    for (c = 0; c < nc; c++) if (size[c] < minPx) small.push(c);
    if (!small.length) return map;
    var isSmall = new Uint8Array(nc); small.forEach(function (c2) { isSmall[c2] = 1; });
    var votes = new Map(); // comp -> Int32Array(K)
    small.forEach(function (c2) { votes.set(c2, new Int32Array(K)); });
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      i = y * w + x; c = comp[i];
      if (isSmall[c]) {
        var vv = votes.get(c);
        if (x > 0 && comp[i - 1] !== c) vv[map[i - 1]]++;
        if (x < w - 1 && comp[i + 1] !== c) vv[map[i + 1]]++;
        if (y > 0 && comp[i - w] !== c) vv[map[i - w]]++;
        if (y < h - 1 && comp[i + w] !== c) vv[map[i + w]]++;
      }
    }
    var newLab = new Int32Array(nc).fill(-1);
    small.forEach(function (c2) {
      var v = votes.get(c2), b = -1, bv = 0;
      for (var k = 0; k < K; k++) if (v[k] > bv) { bv = v[k]; b = k; }
      newLab[c2] = b;
    });
    var out = new Uint8Array(map);
    for (i = 0; i < N; i++) { var nl = newLab[comp[i]]; if (nl >= 0) out[i] = nl; }
    return out;
  }

  /* ---- region graph used for merging (works on any label image) */
  function makeGraph(comp, nc, w, h, L, A, B, Nl) {
    var nodes = [], i, x, y, a, b;
    for (i = 0; i < nc; i++) nodes.push({ id: i, n: 0, l: 0, a: 0, b: 0, adj: new Map(), alive: true, parent: i });
    for (i = 0; i < w * h; i++) { var nd = nodes[comp[i]]; nd.n++; nd.l += L[i]; nd.a += A[i]; nd.b += B[i]; }
    function addAdj(p, q) { var m = nodes[p].adj; m.set(q, (m.get(q) || 0) + 1); }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x; a = comp[i];
      if (x < w - 1) { b = comp[i + 1]; if (a !== b) { addAdj(a, b); addAdj(b, a); } }
      if (y < h - 1) { b = comp[i + w]; if (a !== b) { addAdj(a, b); addAdj(b, a); } }
    }
    return { nodes: nodes, Nl: Nl, alive: nc };
  }
  function gMean(nd) { return [nd.l / nd.n, nd.a / nd.n, nd.b / nd.n]; }
  function gDist(p, q) {
    var d0 = p.l / p.n - q.l / q.n, d1 = p.a / p.n - q.a / q.n, d2 = p.b / p.n - q.b / q.n;
    return Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2);
  }
  function gMerge(G, keepId, goneId) {
    var K = G.nodes[keepId], g = G.nodes[goneId];
    K.n += g.n; K.l += g.l; K.a += g.a; K.b += g.b;
    g.adj.forEach(function (cnt, o) {
      if (o === keepId) return;
      K.adj.set(o, (K.adj.get(o) || 0) + cnt);
      var om = G.nodes[o].adj; om.delete(goneId); om.set(keepId, (om.get(keepId) || 0) + cnt);
    });
    K.adj.delete(goneId);
    g.alive = false; g.parent = keepId; g.adj = new Map(); G.alive--;
  }
  function gFind(G, i) { var n = G.nodes; while (n[i].parent !== i) { n[i].parent = n[n[i].parent].parent; i = n[i].parent; } return i; }
  function gAlive(G) { return G.nodes.filter(function (n) { return n.alive; }); }
  function pairCost(G, p, q) { return gDist(p, q) * (1 + 2.5 * Math.sqrt(Math.min(p.n, q.n) / G.Nl)); }
  function gBestPair(G, nonAdjThr) {
    var best = null, bc = Infinity, al = gAlive(G), i, j;
    for (i = 0; i < al.length; i++) {
      var p = al[i];
      p.adj.forEach(function (cnt, o) {
        if (o < p.id) return;
        var c = pairCost(G, p, G.nodes[o]);
        if (c < bc) { bc = c; best = [p.id, o]; }
      });
    }
    if (nonAdjThr > 0) {
      for (i = 0; i < al.length; i++) for (j = i + 1; j < al.length; j++) {
        var P = al[i], Q = al[j];
        if (P.adj.has(Q.id)) continue;
        var d = gDist(P, Q); if (d > nonAdjThr) continue;
        var c2 = pairCost(G, P, Q) + 10;
        if (c2 < bc) { bc = c2; best = [P.id, Q.id]; }
      }
    }
    return best ? { a: best[0], b: best[1], cost: bc } : null;
  }
  function gMergePair(G, a, b) { // keep the bigger
    var A = G.nodes[a], B = G.nodes[b];
    if (A.n >= B.n) gMerge(G, a, b); else gMerge(G, b, a);
  }
  function gMergeSmallest(G, minN) { // merge nodes smaller than minN into closest neighbour; returns true if any merge happened
    var did = false;
    for (;;) {
      var al = gAlive(G).filter(function (n) { return n.n < minN; });
      if (!al.length || G.alive <= 2) break;
      al.sort(function (p, q) { return p.n - q.n; });
      var s = al[0], bt = -1, bc = Infinity;
      s.adj.forEach(function (cnt, o) {
        var c = gDist(s, G.nodes[o]) - 6 * Math.min(1, cnt / (4 * Math.sqrt(s.n) + 1));
        if (c < bc) { bc = c; bt = o; }
      });
      if (bt < 0) {
        gAlive(G).forEach(function (o) { if (o.id === s.id) return; var c = gDist(s, o); if (c < bc) { bc = c; bt = o.id; } });
        if (bt < 0) break;
      }
      gMerge(G, bt, s.id); did = true;
    }
    return did;
  }

  /* ---- crack tracing: boundaries between segments → polylines on pixel corners */
  function traceChains(seg, w, h) {
    var W1 = w + 1, hE = new Uint8Array(w * (h + 1)), vE = new Uint8Array(W1 * h), hV = new Uint8Array(w * (h + 1)), vV = new Uint8Array(W1 * h), x, y;
    for (y = 1; y < h; y++) for (x = 0; x < w; x++) if (seg[(y - 1) * w + x] !== seg[y * w + x]) hE[y * w + x] = 1;
    for (y = 0; y < h; y++) for (x = 1; x < w; x++) if (seg[y * w + x - 1] !== seg[y * w + x]) vE[y * W1 + x] = 1;
    var DX = [1, -1, 0, 0], DY = [0, 0, 1, -1], OPP = [1, 0, 3, 2];
    function has(x, y, d) {
      if (d === 0) return x < w && hE[y * w + x] === 1;
      if (d === 1) return x > 0 && hE[y * w + x - 1] === 1;
      if (d === 2) return y < h && vE[y * W1 + x] === 1;
      return y > 0 && vE[(y - 1) * W1 + x] === 1;
    }
    function vis(x, y, d) {
      if (d === 0) return hV[y * w + x] === 1;
      if (d === 1) return hV[y * w + x - 1] === 1;
      if (d === 2) return vV[y * W1 + x] === 1;
      return vV[(y - 1) * W1 + x] === 1;
    }
    function mark(x, y, d) {
      if (d === 0) hV[y * w + x] = 1; else if (d === 1) hV[y * w + x - 1] = 1;
      else if (d === 2) vV[y * W1 + x] = 1; else vV[(y - 1) * W1 + x] = 1;
    }
    function deg(x, y) { return (has(x, y, 0) ? 1 : 0) + (has(x, y, 1) ? 1 : 0) + (has(x, y, 2) ? 1 : 0) + (has(x, y, 3) ? 1 : 0); }
    var chains = [];
    function walk(sx, sy, d0) {
      var px = [sx, sy], cx = sx, cy = sy, d = d0, a, b;
      // labels on the two sides of the first edge
      if (d0 === 0) { a = seg[(cy - 1) * w + cx]; b = seg[cy * w + cx]; }
      else if (d0 === 1) { a = seg[(cy - 1) * w + cx - 1]; b = seg[cy * w + cx - 1]; }
      else if (d0 === 2) { a = seg[cy * w + cx - 1]; b = seg[cy * w + cx]; }
      else { a = seg[(cy - 1) * w + cx - 1]; b = seg[(cy - 1) * w + cx]; }
      for (;;) {
        mark(cx, cy, d); cx += DX[d]; cy += DY[d]; px.push(cx, cy);
        if (cx === sx && cy === sy) break;
        var dg = deg(cx, cy); if (dg !== 2) break;
        var nd = -1;
        for (var k = 0; k < 4; k++) if (k !== OPP[d] && has(cx, cy, k)) { nd = k; break; }
        if (nd < 0 || vis(cx, cy, nd)) break;
        d = nd;
      }
      var closed = (cx === sx && cy === sy);
      chains.push({ pts: px, a: Math.min(a, b), b: Math.max(a, b), closed: closed, len: px.length / 2 - 1, v0: sy * W1 + sx, v1: cy * W1 + cx });
    }
    var d;
    for (y = 0; y <= h; y++) for (x = 0; x <= w; x++) {
      var dg = deg(x, y); if (dg === 0 || dg === 2) continue;
      for (d = 0; d < 4; d++) if (has(x, y, d) && !vis(x, y, d)) walk(x, y, d);
    }
    for (y = 0; y <= h; y++) for (x = 0; x <= w; x++) {
      for (d = 0; d < 4; d++) if (has(x, y, d) && !vis(x, y, d)) walk(x, y, d);
    }
    return chains;
  }

  function smoothPts(pts, closed, hw, iters) {
    var n = pts.length / 2, it, i, k;
    if (n < 4) return pts.slice();
    var cur = Float32Array.from(pts), m = closed ? n - 1 : n;
    for (it = 0; it < iters; it++) {
      var out = new Float32Array(cur.length);
      for (i = 0; i < m; i++) {
        var sx = 0, sy = 0, cnt = 0, r;
        if (closed) { r = Math.min(hw, (m >> 1) - 1); if (r < 1) r = 1; for (k = -r; k <= r; k++) { var j = ((i + k) % m + m) % m; sx += cur[2 * j]; sy += cur[2 * j + 1]; cnt++; } }
        else {
          r = Math.min(hw, i, m - 1 - i);
          for (k = -r; k <= r; k++) { sx += cur[2 * (i + k)]; sy += cur[2 * (i + k) + 1]; cnt++; }
        }
        out[2 * i] = sx / cnt; out[2 * i + 1] = sy / cnt;
      }
      if (closed) { out[2 * (n - 1)] = out[0]; out[2 * (n - 1) + 1] = out[1]; }
      cur = out;
    }
    return cur;
  }

  function dpSimplify(p, eps) { // p: flat xy; returns flat xy
    var n = p.length / 2; if (n < 3) return Array.prototype.slice.call(p);
    var keep = new Uint8Array(n); keep[0] = 1; keep[n - 1] = 1;
    var st = [[0, n - 1]];
    while (st.length) {
      var s = st.pop(), a = s[0], b = s[1]; if (b <= a + 1) continue;
      var ax = p[2 * a], ay = p[2 * a + 1], bx = p[2 * b], by = p[2 * b + 1], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9, md = -1, mi = -1;
      for (var i = a + 1; i < b; i++) {
        var d = Math.abs((p[2 * i] - ax) * dy - (p[2 * i + 1] - ay) * dx) / L;
        if (d > md) { md = d; mi = i; }
      }
      if (md > eps) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
    }
    var out = [];
    for (var j = 0; j < n; j++) if (keep[j]) out.push(p[2 * j], p[2 * j + 1]);
    return out;
  }

  function pathFromPts(path, p, closed) {
    var n = p.length / 2, i;
    if (n < 2) return;
    // subsample every 2nd point, then quadratic midpoints
    var q = [];
    for (i = 0; i < n; i += 2) q.push(p[2 * i], p[2 * i + 1]);
    if ((n - 1) % 2 !== 0 || q.length / 2 < 2) q.push(p[2 * (n - 1)], p[2 * (n - 1) + 1]);
    var m = q.length / 2;
    if (m < 3) { path.moveTo(q[0], q[1]); path.lineTo(q[2 * (m - 1)], q[2 * (m - 1) + 1]); return; }
    path.moveTo(q[0], q[1]);
    for (i = 1; i < m - 1; i++) {
      var mx = (q[2 * i] + q[2 * i + 2]) / 2, my = (q[2 * i + 1] + q[2 * i + 3]) / 2;
      path.quadraticCurveTo(q[2 * i], q[2 * i + 1], mx, my);
    }
    path.lineTo(q[2 * (m - 1)], q[2 * (m - 1) + 1]);
    if (closed) path.closePath();
  }

  /* ---- illustrate */
  function labFull(rgba, N) {
    var L = new Float32Array(N), A = new Float32Array(N), B = new Float32Array(N);
    for (var i = 0; i < N; i++) {
      var R = LIN[rgba[4 * i]], G = LIN[rgba[4 * i + 1]], Bv = LIN[rgba[4 * i + 2]];
      var fx = labF((0.4124564 * R + 0.3575761 * G + 0.1804375 * Bv) / 0.95047), fy = labF(0.2126729 * R + 0.7151522 * G + 0.0721750 * Bv), fz = labF((0.0193339 * R + 0.1191920 * G + 0.9503041 * Bv) / 1.08883);
      L[i] = 116 * fy - 16; A[i] = 500 * (fx - fy); B[i] = 200 * (fy - fz);
    }
    return [L, A, B];
  }

  function illustrate(an, o) {
    o = o || {};
    var maxAreas = clamp(Math.round(o.maxAreas || 7), 3, 12);
    var w = an.width, h = an.height, N = w * h, rgba = an.rgba, i, x, y;
    _PON = !!o._prof; _PT = performance.now(); var _P = PROF;
    var s = Math.max(1, Math.ceil(Math.max(w, h) / 300));
    var lw = Math.ceil(w / s), lh = Math.ceil(h / s), NL = lw * lh;
    // --- low-res image (box average) + Lab
    var lr = new Float32Array(NL), lg = new Float32Array(NL), lb = new Float32Array(NL), lc = new Float32Array(NL);
    for (y = 0; y < h; y++) {
      var ly = (y / s) | 0;
      for (x = 0; x < w; x++) {
        var li = ly * lw + ((x / s) | 0), p4 = 4 * (y * w + x);
        lr[li] += rgba[p4]; lg[li] += rgba[p4 + 1]; lb[li] += rgba[p4 + 2]; lc[li]++;
      }
    }
    var lrgba = new Uint8ClampedArray(4 * NL);
    for (i = 0; i < NL; i++) { lr[i] /= lc[i]; lg[i] /= lc[i]; lb[i] /= lc[i]; lrgba[4 * i] = lr[i]; lrgba[4 * i + 1] = lg[i]; lrgba[4 * i + 2] = lb[i]; lrgba[4 * i + 3] = 255; }
    var lab = labFull(lrgba, NL);
    _P('down');
    var sm = bilateralLab(lab[0], lab[1], lab[2], lw, lh, 2, 13, 5);
    var Ls = sm[0], As = sm[1], Bs = sm[2];
    _P('bilat');
    // --- k-means + mode filter
    var cx = o._k || 10, rng = mulberry32(777);
    var cen = kmeansCenters(Ls, As, Bs, NL, cx, rng), lab0 = new Uint8Array(NL), c;
    for (i = 0; i < NL; i++) {
      var best = 0, bd = Infinity;
      for (c = 0; c < cx; c++) {
        var d0 = Ls[i] - cen[3 * c], d1 = As[i] - cen[3 * c + 1], d2 = Bs[i] - cen[3 * c + 2], dd = d0 * d0 + d1 * d1 + d2 * d2;
        if (dd < bd) { bd = dd; best = c; }
      }
      lab0[i] = best;
    }
    lab0 = modeFilterLabels(lab0, lw, lh, 2, cx, 2);
    _P('kmeans');
    // --- merge graph
    var cc = components(lab0, lw, lh);
    var G = makeGraph(cc.comp, cc.n, lw, lh, Ls, As, Bs, NL);
    gMergeSmallest(G, Math.max(8, NL * 0.003));
    var bp;
    for (;;) {
      bp = gBestPair(G, 0);
      if (!bp || G.alive <= 3) break;
      if (G.alive > 16 || bp.cost < 9) gMergePair(G, bp.a, bp.b); else break;
    }
    // snapshot: segments
    var segRootOfComp = new Int32Array(cc.n), rootsSeg = [], segIdxOfRoot = new Map();
    for (i = 0; i < cc.n; i++) {
      var rt = gFind(G, i); segRootOfComp[i] = rt;
      if (!segIdxOfRoot.has(rt)) { segIdxOfRoot.set(rt, rootsSeg.length); rootsSeg.push(rt); }
    }
    var S = rootsSeg.length, segMeans = [], segN = [];
    rootsSeg.forEach(function (rt) { var nd = G.nodes[rt]; segMeans.push(gMean(nd)); segN.push(nd.n); });
    var lowSeg = new Uint8Array(NL);
    for (i = 0; i < NL; i++) lowSeg[i] = segIdxOfRoot.get(segRootOfComp[cc.comp[i]]);
    // continue merging into areas
    var thrA = o._thr || 15;
    for (;;) {
      if (G.alive <= 2) break;
      var minN = NL * 0.012;
      if (G.alive > 3 && gMergeSmallest(G, minN)) continue;
      bp = gBestPair(G, 8);
      if (!bp || G.alive <= 3) break;
      if (G.alive > maxAreas || bp.cost < thrA) gMergePair(G, bp.a, bp.b); else break;
    }
    var segAreaRoot = rootsSeg.map(function (rt) { return gFind(G, rt); });
    var areaRootIds = [];
    segAreaRoot.forEach(function (r) { if (areaRootIds.indexOf(r) < 0) areaRootIds.push(r); });
    var segArea = segAreaRoot.map(function (r) { return areaRootIds.indexOf(r); });

    _P('merge');
    // --- full-res refinement of the segment map
    var fl = labFull(rgba, N);
    var FL = blurF(fl[0], w, h, 1.3), FA = blurF(fl[1], w, h, 1.3), FB = blurF(fl[2], w, h, 1.3);
    var seg = new Uint8Array(N), cand = [0, 0, 0, 0];
    for (y = 0; y < h; y++) {
      var fy = (y + 0.5) / s - 0.5, y0 = Math.floor(fy), wy = fy - y0, y1 = y0 + 1;
      y0 = y0 < 0 ? 0 : y0 >= lh ? lh - 1 : y0; y1 = y1 < 0 ? 0 : y1 >= lh ? lh - 1 : y1;
      for (x = 0; x < w; x++) {
        var fx = (x + 0.5) / s - 0.5, x0 = Math.floor(fx), wx = fx - x0, x1 = x0 + 1;
        x0 = x0 < 0 ? 0 : x0 >= lw ? lw - 1 : x0; x1 = x1 < 0 ? 0 : x1 >= lw ? lw - 1 : x1;
        cand[0] = lowSeg[y0 * lw + x0]; cand[1] = lowSeg[y0 * lw + x1]; cand[2] = lowSeg[y1 * lw + x0]; cand[3] = lowSeg[y1 * lw + x1];
        var nearest = cand[(wy < 0.5 ? 0 : 2) + (wx < 0.5 ? 0 : 1)];
        i = y * w + x; var bestS = nearest, bestC = Infinity;
        for (var q = 0; q < 4; q++) {
          var sg = cand[q], mm = segMeans[sg];
          var e0 = FL[i] - mm[0], e1 = FA[i] - mm[1], e2 = FB[i] - mm[2];
          var cst = Math.sqrt(e0 * e0 + e1 * e1 + e2 * e2) + (sg === nearest ? 0 : 5);
          if (cst < bestC) { bestC = cst; bestS = sg; }
        }
        seg[i] = bestS;
      }
    }
    _P('refine');
    seg = modeFilterLabels(seg, w, h, 2, S, 1);
    seg = modeFilterLabels(seg, w, h, 1, S, 1);
    seg = cleanSmallComponents(seg, w, h, Math.max(40, Math.round(0.0006 * N)), S);

    _P('cleanup');
    var ill = { _seg: seg, _segArea: segArea, _segMeans: segMeans, _S: S, _w: w, _h: h, _s: s, _lw: lw, _lh: lh, _lrgb: [lr, lg, lb], areas: [], steps: [] };
    ill._chains = traceChains(seg, w, h);
    var dg = Math.hypot(w, h), hw = Math.max(2, Math.round(dg / 260));
    ill._chains.forEach(function (ch) {
      ch.sp = smoothPts(ch.pts, ch.closed, hw, 3);
      var a = segMeans[ch.a], b = segMeans[ch.b];
      ch.dE = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    });
    _P('chains');
    buildAreas(an, ill, null);
    _P('areas');
    return ill;
  }

  /* ---- areas from seg map + seg→area assignment */
  var AREA_EDGE_PX = 0;
  function posWords(bb, ct) {
    var bw = bb[2] - bb[0], bh = bb[3] - bb[1], cx = ct[0], cy = ct[1];
    if (bw >= 68 && bh <= 48) return cy < 34 ? 'top band' : cy > 66 ? 'bottom band' : 'middle band';
    if (bh >= 68 && bw <= 48) return cx < 34 ? 'left side' : cx > 66 ? 'right side' : 'centre column';
    var v = cy < 34 ? 'upper' : cy > 66 ? 'lower' : '', hh = cx < 34 ? 'left' : cx > 66 ? 'right' : '';
    if (!v && !hh) return 'centre';
    if (v && hh) return v + ' ' + hh;
    return v ? v + ' centre' : 'centre ' + hh;
  }

  function buildAreas(an, ill, keepOrderOf) {
    var w = ill._w, h = ill._h, N = w * h, seg = ill._seg, segArea = ill._segArea, i, x, y;
    var ids = [];
    segArea.forEach(function (a) { if (ids.indexOf(a) < 0) ids.push(a); });
    var AN = ids.length, idx = new Int32Array(Math.max.apply(null, ids) + 1).fill(-1);
    ids.forEach(function (a, k) { idx[a] = k; });
    var map = new Uint8Array(N), cnt = new Float64Array(AN);
    var segToK = segArea.map(function (a) { return idx[a]; });
    for (i = 0; i < N; i++) { var k = segToK[seg[i]]; map[i] = k; cnt[k]++; }
    // sort by size → stable ids 0..AN-1
    var perm = []; for (i = 0; i < AN; i++) perm.push(i);
    perm.sort(function (p, q) { return cnt[q] - cnt[p]; });
    var inv = new Int32Array(AN); perm.forEach(function (old, nw) { inv[old] = nw; });
    for (i = 0; i < N; i++) map[i] = inv[map[i]];
    var segToArea = segToK.map(function (k2) { return inv[k2]; });
    ill._segToArea = segToArea;
    ill._areaMap = map;
    var st = new Array(AN), bandTop = Math.max(1, Math.round(h * 0.1)), fine = an.edges.fine, rgba = an.rgba;
    for (i = 0; i < AN; i++) st[i] = { n: 0, sx: 0, sy: 0, x0: 1e9, y0: 1e9, x1: -1, y1: -1, r: 0, g: 0, b: 0, top: 0, bot: 0, bord: 0, ed: 0, adj: new Map() };
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x; var a = map[i], t = st[a];
      t.n++; t.sx += x; t.sy += y; if (x < t.x0) t.x0 = x; if (x > t.x1) t.x1 = x; if (y < t.y0) t.y0 = y; if (y > t.y1) t.y1 = y;
      t.r += rgba[4 * i]; t.g += rgba[4 * i + 1]; t.b += rgba[4 * i + 2]; t.ed += fine[i];
      if (y < bandTop) t.top++; if (y >= h - bandTop) t.bot++;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) t.bord++;
      if (x < w - 1) { var b2 = map[i + 1]; if (b2 !== a) { t.adj.set(b2, (t.adj.get(b2) || 0) + 1); st[b2].adj.set(a, (st[b2].adj.get(a) || 0) + 1); } }
      if (y < h - 1) { var b3 = map[i + w]; if (b3 !== a) { t.adj.set(b3, (t.adj.get(b3) || 0) + 1); st[b3].adj.set(a, (st[b3].adj.get(a) || 0) + 1); } }
    }
    // regionIds
    var rIds = []; for (i = 0; i < AN; i++) rIds.push(new Map());
    var rm = an.regionMap;
    for (i = 0; i < N; i++) { var m = rIds[map[i]]; m.set(rm[i], (m.get(rm[i]) || 0) + 1); }
    var perim = 2 * (w + h), areas = [];
    for (i = 0; i < AN; i++) {
      var t2 = st[i], share = t2.n / N, rgb = [Math.round(t2.r / t2.n), Math.round(t2.g / t2.n), Math.round(t2.b / t2.n)];
      var bb = [t2.x0, t2.y0, t2.x1 + 1, t2.y1 + 1];
      var bbp = [Math.round(bb[0] / w * 1000) / 10, Math.round(bb[1] / h * 1000) / 10, Math.round(bb[2] / w * 1000) / 10, Math.round(bb[3] / h * 1000) / 10];
      var ctp = [Math.round(t2.sx / t2.n / w * 1000) / 10, Math.round(t2.sy / t2.n / h * 1000) / 10];
      var rid = []; rIds[i].forEach(function (v, k2) { if (v >= 0.25 * t2.n * 0.0 + 1) rid.push(k2); });
      rid.sort(function (p, q) { return rIds[i].get(q) - rIds[i].get(p); });
      areas.push({
        id: i, regionIds: rid, bbox: [bb[0], bb[1], bb[2] - 1, bb[3] - 1], bbox_pct: bbp, centroid_pct: ctp, area_pct: Math.round(share * 1000) / 10,
        meanRgb: rgb, hex: toHex(rgb), colorName: colorName(rgb), position: posWords(bbp, ctp), order: 0, kind: 'middle',
        _st: { share: share, topCov: t2.top / (bandTop * w), botCov: t2.bot / (bandTop * w), bordFrac: t2.bord / perim, edgeD: Math.min(1, t2.ed / t2.n * 4), cy: t2.sy / t2.n / h, by: (t2.y1 + 1) / h, cx: t2.sx / t2.n / w, adj: t2.adj, perim: Array.from(t2.adj.values()).reduce(function (p, q) { return p + q; }, 0) }
      });
    }
    PROF('areastats');
    // kinds (before ordering)
    var bgScore = areas.map(function (a) {
      var t3 = a._st;
      return 1.6 * t3.topCov + 0.9 * Math.sqrt(t3.share) + 0.4 * Math.min(1, t3.bordFrac * 4) + 0.4 * (1 - t3.edgeD) + 0.6 * (1 - t3.cy);
    });
    var firstId = 0; areas.forEach(function (a) { if (bgScore[a.id] > bgScore[firstId]) firstId = a.id; });
    var subj = null, sb = -1;
    areas.forEach(function (a) {
      var t4 = a._st; if (a.id === firstId || t4.topCov > 0.4 || t4.share < 0.02) return;
      var bw = (a.bbox[2] - a.bbox[0]) / w, band = bw > 0.7 ? 0.45 : 1;
      var sc = (0.25 + t4.edgeD) * Math.sqrt(t4.share) * (1 - 0.8 * Math.min(1, Math.hypot(t4.cx - 0.5, t4.cy - 0.55))) * band;
      if (sc > sb) { sb = sc; subj = a; }
    });
    areas.forEach(function (a) {
      var t5 = a._st;
      if (a.id === firstId || t5.topCov > 0.5) a.kind = 'background';
      else if (a === subj) a.kind = 'subject';
      else if (t5.share < 0.03) a.kind = 'detail';
      else a.kind = 'middle';
    });
    // ordering: back to front
    var ordList;
    if (keepOrderOf) ordList = keepOrderOf.slice();
    else {
      var KR = { background: 0, middle: 1, subject: 1, detail: 2 };
      var depth = function (a) { return 0.5 * a._st.cy + 0.5 * a._st.by - 0.4 * a._st.topCov; };
      ordList = areas.map(function (a) { return a.id; }).sort(function (p, q) {
        var kp = KR[areas[p].kind], kq = KR[areas[q].kind];
        return kp !== kq ? kp - kq : (kp === 0 ? bgScore[q] - bgScore[p] : depth(areas[p]) - depth(areas[q]));
      });
      // an area mostly surrounded by another is painted after it
      for (var pass = 0; pass < 12; pass++) {
        var moved = false;
        for (var ai = 0; ai < areas.length; ai++) {
          var A = areas[ai], bestB = -1, bv = 0; if (A.kind === 'background') continue;
          A._st.adj.forEach(function (c2, o) { if (c2 > bv) { bv = c2; bestB = o; } });
          if (bestB < 0 || bv < 0.5 * A._st.perim) continue;
          if (areas[bestB]._st.share < A._st.share) continue;
          var pa = ordList.indexOf(A.id), pb = ordList.indexOf(bestB);
          if (pa < pb) { ordList.splice(pa, 1); ordList.splice(ordList.indexOf(bestB) + 1, 0, A.id); moved = true; }
        }
        if (!moved) break;
      }
    }
    var sorted = ordList.map(function (id) { return areas[id]; });
    sorted.forEach(function (a, k3) { a.order = k3; });
    ill.areas = sorted;
    ill._byId = {}; sorted.forEach(function (a) { ill._byId[a.id] = a; });
    rebuildSteps(ill);
    PROF('order');
    buildLines(an, ill);
    PROF('lines');
    buildFills(an, ill);
    PROF('fills');
  }

  function rebuildSteps(ill) {
    var st = [{ key: 'sketch', kind: 'sketch', title: 'Light pencil construction lines' },
      { key: 'lines', kind: 'lines', title: 'Clean line art' }];
    ill.areas.forEach(function (a) {
      st.push({ key: 'color:' + a.id, kind: 'color', areaId: a.id, title: 'Colour the ' + a.position + ' (' + a.colorName + ')' });
    });
    st.push({ key: 'shading', kind: 'shading', title: 'Shading and soft gradients' });
    st.push({ key: 'final', kind: 'final', title: 'Final details: the finished picture' });
    ill.steps = st;
    var rank = new Int32Array(ill.areas.length + 1);
    ill.areas.forEach(function (a, k) { rank[a.id] = k; });
    ill._rank = rank;
  }

  function buildLines(an, ill) {
    var w = ill._w, h = ill._h, dg = Math.hypot(w, h), segToArea = ill._segToArea;
    var linePath = new Path2D(), sketchPath = new Path2D(), kept = [];
    var T = ill._lineMin || 0.03 * dg, Tin = 0.065 * dg;
    ill._chains.forEach(function (ch) {
      var isArea = segToArea[ch.a] !== segToArea[ch.b];
      var ok = isArea ? (ch.len >= (ch.closed ? 0.05 * dg : 0.018 * dg)) : (ch.len >= Tin && ch.dE >= 9);
      if (!ok) return;
      ch.isArea = isArea; kept.push(ch);
    });
    // second pass: short area chains survive only if they touch a long chain end
    var endLong = new Set();
    kept.forEach(function (ch) { if (ch.len >= T) { endLong.add(ch.v0); endLong.add(ch.v1); } });
    kept = kept.filter(function (ch) { return ch.len >= T || ch.closed || endLong.has(ch.v0) || endLong.has(ch.v1); });
    kept.forEach(function (ch) { pathFromPts(linePath, ch.sp, ch.closed); });
    // sketch: simplified long area boundaries
    var eps = 0.03 * dg, skC = kept.filter(function (c) { return c.isArea && c.len >= 0.12 * dg; }).sort(function (p, q) { return q.len - p.len; }).slice(0, 5);
    skC.forEach(function (ch) {
      var p = ch.sp, simp;
      if (ch.closed) {
        var half = Math.floor(p.length / 4) * 2, a1 = Array.prototype.slice.call(p, 0, half + 2), a2 = Array.prototype.slice.call(p, half);
        simp = dpSimplify(a1, eps).concat(dpSimplify(a2, eps).slice(2));
      } else simp = dpSimplify(p, eps);
      if (simp.length < 4) return;
      sketchPath.moveTo(simp[0], simp[1]);
      for (var i = 2; i < simp.length; i += 2) sketchPath.lineTo(simp[i], simp[i + 1]);
    });
    // construction shapes of the middle/subject areas
    var shapes = [];
    ill.areas.forEach(function (a) {
      if (a.kind === 'background' || a.area_pct < 3 || shapes.length >= 2) return;
      var bw = a.bbox_pct[2] - a.bbox_pct[0], bh = a.bbox_pct[3] - a.bbox_pct[1];
      if ((bw > 80 && bh < 40) || (bw > 92 && bh > 92)) return;
      var sh = fitAreaShape(ill, a); if (sh) shapes.push(sh);
    });
    shapes.forEach(function (s) {
      if (s.type === 'ellipse') { sketchPath.moveTo(s.cx + s.rx * Math.cos(s.angle), s.cy + s.rx * Math.sin(s.angle)); sketchPath.ellipse(s.cx, s.cy, s.rx, s.ry, s.angle, 0, Math.PI * 2); }
      else {
        var co = Math.cos(s.angle), si = Math.sin(s.angle), pts = [[-s.rx, -s.ry], [s.rx, -s.ry], [s.rx, s.ry], [-s.rx, s.ry]];
        pts.forEach(function (p, k) { var X = s.cx + p[0] * co - p[1] * si, Y = s.cy + p[0] * si + p[1] * co; if (k === 0) sketchPath.moveTo(X, Y); else sketchPath.lineTo(X, Y); });
        sketchPath.closePath();
      }
    });
    ill._shapes = shapes; ill._linePath = linePath; ill._sketchPath = sketchPath; ill._keptChains = kept;
  }

  function fitAreaShape(ill, a) {
    var w = ill._w, map = ill._areaMap, id = a.id, bb = a.bbox, x, y, n = 0, mx = 0, my = 0, mxx = 0, myy = 0, mxy = 0;
    for (y = bb[1]; y <= bb[3]; y++) for (x = bb[0]; x <= bb[2]; x++) { if (map[y * w + x] !== id) continue; n++; mx += x; my += y; mxx += x * x; myy += y * y; mxy += x * y; }
    if (n < 100) return null;
    mx /= n; my /= n;
    var cxx = mxx / n - mx * mx, cyy = myy / n - my * my, cxy = mxy / n - mx * my;
    var tr = cxx + cyy, det = cxx * cyy - cxy * cxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    var l1 = tr / 2 + disc, l2 = Math.max(1e-6, tr / 2 - disc), th = 0.5 * Math.atan2(2 * cxy, cxx - cyy), co = Math.cos(th), si = Math.sin(th);
    var u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (y = bb[1]; y <= bb[3]; y++) for (x = bb[0]; x <= bb[2]; x++) {
      if (map[y * w + x] !== id) continue;
      var u = (x - mx) * co + (y - my) * si, v = -(x - mx) * si + (y - my) * co;
      if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
    var W = u1 - u0 + 1, H = v1 - v0 + 1, fill = n / (W * H);
    if (fill > 0.8) { var mu = (u0 + u1) / 2, mv = (v0 + v1) / 2; return { type: 'rect', cx: mx + mu * co - mv * si, cy: my + mu * si + mv * co, rx: W / 2, ry: H / 2, angle: th }; }
    var ratio = n / (4 * Math.PI * Math.sqrt(l1 * l2));
    if (ratio < 0.7 || ratio > 1.3) return null;
    return { type: 'ellipse', cx: mx, cy: my, rx: 2 * Math.sqrt(l1), ry: 2 * Math.sqrt(l2), angle: th };
  }

  /* ---- fills: masked (normalised) blur of the original, per area, sampled bilinearly at full resolution */
  function buildFills(an, ill) {
    var w = ill._w, h = ill._h, N = w * h, lw = ill._lw, lh = ill._lh, NL = lw * lh, s = ill._s, map = ill._areaMap, AN = ill.areas.length, a, i, x, y, ch;
    var rgb = ill._lrgb;
    // low-res area label (majority = centre sample) and purity
    var lowA = new Uint8Array(NL), pure = new Uint8Array(NL);
    for (y = 0; y < lh; y++) for (x = 0; x < lw; x++) {
      var cxp = Math.min(w - 1, x * s + (s >> 1)), cyp = Math.min(h - 1, y * s + (s >> 1)), a0 = map[cyp * w + cxp], pu = 1;
      for (var yy = y * s; yy < Math.min(h, y * s + s) && pu; yy += 1) for (var xx = x * s; xx < Math.min(w, x * s + s); xx += 1) if (map[yy * w + xx] !== a0) { pu = 0; break; }
      lowA[y * lw + x] = a0; pure[y * lw + x] = pu;
    }
    var soft = [], detail = [], means = [];
    var sigS = 1.8, sigD = 0.8;
    for (a = 0; a < AN; a++) {
      var m = new Float32Array(NL), mAll = new Float32Array(NL), cntP = 0;
      for (i = 0; i < NL; i++) { if (lowA[i] === a) { mAll[i] = 1; if (pure[i]) { m[i] = 1; cntP++; } } }
      if (cntP < 6) m = mAll;
      var mean = [0, 0, 0], tot = 0, it;
      for (i = 0; i < NL; i++) if (m[i]) { mean[0] += rgb[0][i]; mean[1] += rgb[1][i]; mean[2] += rgb[2][i]; tot++; }
      if (!tot) { mean = ill.areas[a].meanRgb.slice(); tot = 1; }
      mean = [mean[0] / tot, mean[1] / tot, mean[2] / tot];
      // robust mask: pixels far from the area's typical colour (flowers, windows, text) get little weight
      var mR = new Float32Array(NL);
      for (it = 0; it < 3; it++) {
        var sw = 0, s0 = 0, s1 = 0, s2 = 0;
        for (i = 0; i < NL; i++) {
          if (!m[i]) { mR[i] = 0; continue; }
          var e0 = rgb[0][i] - mean[0], e1 = rgb[1][i] - mean[1], e2 = rgb[2][i] - mean[2];
          var wt = Math.exp(-(e0 * e0 + e1 * e1 + e2 * e2) / (2 * 38 * 38)); mR[i] = wt;
          sw += wt; s0 += wt * rgb[0][i]; s1 += wt * rgb[1][i]; s2 += wt * rgb[2][i];
        }
        if (sw > 0) mean = [s0 / sw, s1 / sw, s2 / sw];
      }
      means.push(mean);
      var fields = [];
      [[sigS, mR], [sigD, m]].forEach(function (cfg) {
        var sg = cfg[0], mk = cfg[1], den = blurF(mk, lw, lh, sg), F = new Float32Array(3 * NL);
        for (var c2 = 0; c2 < 3; c2++) {
          var prem = new Float32Array(NL);
          for (var j = 0; j < NL; j++) prem[j] = rgb[c2][j] * mk[j];
          var num = blurF(prem, lw, lh, sg);
          for (var j2 = 0; j2 < NL; j2++) F[3 * j2 + c2] = den[j2] > 2e-2 ? num[j2] / den[j2] : mean[c2];
        }
        fields.push(F);
      });
      soft.push(fields[0]); detail.push(fields[1]);
    }
    var fill = new Uint8ClampedArray(4 * N), shade = new Uint8ClampedArray(4 * N);
    for (y = 0; y < h; y++) {
      var fy = (y + 0.5) / s - 0.5, y0 = Math.floor(fy), wy = fy - y0, y1 = y0 + 1;
      y0 = y0 < 0 ? 0 : y0 >= lh ? lh - 1 : y0; y1 = y1 < 0 ? 0 : y1 >= lh ? lh - 1 : y1;
      for (x = 0; x < w; x++) {
        var fx = (x + 0.5) / s - 0.5, x0 = Math.floor(fx), wx = fx - x0, x1 = x0 + 1;
        x0 = x0 < 0 ? 0 : x0 >= lw ? lw - 1 : x0; x1 = x1 < 0 ? 0 : x1 >= lw ? lw - 1 : x1;
        i = y * w + x; var ar2 = map[i], FS = soft[ar2], FD = detail[ar2];
        var i00 = 3 * (y0 * lw + x0), i01 = 3 * (y0 * lw + x1), i10 = 3 * (y1 * lw + x0), i11 = 3 * (y1 * lw + x1);
        var w00 = (1 - wy) * (1 - wx), w01 = (1 - wy) * wx, w10 = wy * (1 - wx), w11 = wy * wx;
        var s0 = FS[i00] * w00 + FS[i01] * w01 + FS[i10] * w10 + FS[i11] * w11, s1 = FS[i00 + 1] * w00 + FS[i01 + 1] * w01 + FS[i10 + 1] * w10 + FS[i11 + 1] * w11, s2 = FS[i00 + 2] * w00 + FS[i01 + 2] * w01 + FS[i10 + 2] * w10 + FS[i11 + 2] * w11;
        var d0 = FD[i00] * w00 + FD[i01] * w01 + FD[i10] * w10 + FD[i11] * w11, d1 = FD[i00 + 1] * w00 + FD[i01 + 1] * w01 + FD[i10 + 1] * w10 + FD[i11 + 1] * w11, d2 = FD[i00 + 2] * w00 + FD[i01 + 2] * w01 + FD[i10 + 2] * w10 + FD[i11 + 2] * w11;
        var o4 = 4 * i;
        fill[o4] = s0 * 0.94 + PAPER[0] * 0.06; fill[o4 + 1] = s1 * 0.94 + PAPER[1] * 0.06; fill[o4 + 2] = s2 * 0.94 + PAPER[2] * 0.06; fill[o4 + 3] = 255;
        var dl = (d0 + d1 + d2 - s0 - s1 - s2) / 3, k2 = dl < 0 ? 1.5 : 1.1;
        shade[o4] = s0 + (d0 - s0) * k2 + (dl < 0 ? dl * 0.3 : 0); shade[o4 + 1] = s1 + (d1 - s1) * k2 + (dl < 0 ? dl * 0.3 : 0); shade[o4 + 2] = s2 + (d2 - s2) * k2 + (dl < 0 ? dl * 0.3 : 0); shade[o4 + 3] = 255;
      }
    }
    ill._fill = fill; ill._shade = shade;
  }

  /* ---- rendering */
  function paintAreas(ill, an, upToRank, src, deltaOnly) {
    var N = ill._w * ill._h, map = ill._areaMap, rank = ill._rank, img = new Uint8ClampedArray(4 * N), i, o;
    for (i = 0; i < N; i++) {
      o = 4 * i;
      var inc = deltaOnly >= 0 ? (rank[map[i]] === deltaOnly) : (rank[map[i]] <= upToRank);
      if (inc) { img[o] = src[o]; img[o + 1] = src[o + 1]; img[o + 2] = src[o + 2]; }
      else if (deltaOnly >= 0) { img[o] = 255; img[o + 1] = 255; img[o + 2] = 255; }
      else { img[o] = PAPER[0]; img[o + 1] = PAPER[1]; img[o + 2] = PAPER[2]; }
      img[o + 3] = 255;
    }
    return img;
  }
  function canvasFromRGBA(w, h, data, scale) {
    var c0 = mkCanvas(w, h), x0 = c0.getContext('2d'), id = x0.createImageData(w, h); id.data.set(data); x0.putImageData(id, 0, 0);
    if (scale === 1) return c0;
    var c = mkCanvas(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale))), ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(c0, 0, 0, c.width, c.height);
    return c;
  }
  function drawSketch(ctx, ill, sc) {
    ctx.save(); ctx.scale(sc, sc); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(154,148,138,0.78)'; ctx.lineWidth = 1.2;
    ctx.stroke(ill._sketchPath);
    ctx.restore();
  }
  function drawLines(ctx, ill, sc, alpha) {
    ctx.save(); ctx.scale(sc, sc); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalAlpha = alpha; ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
    ctx.stroke(ill._linePath);
    ctx.restore();
  }
  function renderIllus(an, ill, idx, o) {
    o = o || {}; var sc = o.scale || 1, w = ill._w, h = ill._h, st = ill.steps[idx];
    if (!st) throw new Error('DMEngine.renderIllus: bad step ' + idx);
    var data;
    if (st.kind === 'final') return canvasFromRGBA(w, h, an.rgba, sc);
    var N = w * h, i;
    if (st.kind === 'sketch' || st.kind === 'lines') { data = new Uint8ClampedArray(4 * N); for (i = 0; i < N; i++) { data[4 * i] = PAPER[0]; data[4 * i + 1] = PAPER[1]; data[4 * i + 2] = PAPER[2]; data[4 * i + 3] = 255; } }
    else if (st.kind === 'shading') data = paintAreas(ill, an, 1e9, ill._shade, -1);
    else data = paintAreas(ill, an, ill._rank[st.areaId], ill._fill, -1);
    var c = canvasFromRGBA(w, h, data, sc), ctx = c.getContext('2d');
    if (st.kind === 'sketch') drawSketch(ctx, ill, sc);
    else if (st.kind === 'lines') drawLines(ctx, ill, sc, 1);
    else if (st.kind === 'color') drawLines(ctx, ill, sc, 1);
    else if (st.kind === 'shading') drawLines(ctx, ill, sc, 0.4);
    return c;
  }
  function renderIllusDelta(an, ill, idx) {
    var w = ill._w, h = ill._h, st = ill.steps[idx], N = w * h, i, o;
    if (!st) throw new Error('DMEngine.renderIllusDelta: bad step ' + idx);
    var data;
    if (st.kind === 'sketch' || st.kind === 'lines') { data = new Uint8ClampedArray(4 * N).fill(255); }
    else if (st.kind === 'color') data = paintAreas(ill, an, 0, ill._fill, ill._rank[st.areaId]);
    else {
      var a = st.kind === 'shading' ? ill._shade : an.rgba, b = st.kind === 'shading' ? ill._fill : ill._shade, thr = st.kind === 'shading' ? 8 : 14;
      data = new Uint8ClampedArray(4 * N);
      for (i = 0; i < N; i++) {
        o = 4 * i; var d = Math.abs(a[o] - b[o]) + Math.abs(a[o + 1] - b[o + 1]) + Math.abs(a[o + 2] - b[o + 2]);
        if (d > thr) { data[o] = a[o]; data[o + 1] = a[o + 1]; data[o + 2] = a[o + 2]; } else { data[o] = data[o + 1] = data[o + 2] = 255; }
        data[o + 3] = 255;
      }
    }
    var c = canvasFromRGBA(w, h, data, 1), ctx = c.getContext('2d');
    if (st.kind === 'sketch') drawSketch(ctx, ill, 1);
    else if (st.kind === 'lines') drawLines(ctx, ill, 1, 1);
    return c;
  }

  function areaAt(ill, an, x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= ill._w || y >= ill._h) return null;
    return ill._byId[ill._areaMap[y * ill._w + x]] || null;
  }
  function setAreaOrder(ill, areaId, newOrder) {
    var a = ill._byId[areaId]; if (!a) return;
    var list = ill.areas.filter(function (q) { return q !== a; });
    var pos = clamp(Math.round(newOrder), 0, list.length);
    list.splice(pos, 0, a);
    list.forEach(function (q, k) { q.order = k; });
    ill.areas = list; rebuildSteps(ill);
  }
  function mergeAreas(an, ill, idA, idB) {
    if (idA === idB || !ill._byId[idA] || !ill._byId[idB]) return ill;
    ill._segArea = ill._segToArea.map(function (v) { return v === idB ? idA : v; });
    buildAreas(an, ill, null);   // ids are renumbered by size; order is recomputed
    return ill;
  }

  global.DMEngine = {
    version: VERSION, prepare: prepare, analyze: analyze, planStages: planStages,
    renderStage: renderStage, renderDelta: renderDelta,
    regionAt: regionAt, setRole: setRole, setOrder: setOrder, mergeRegions: mergeRegions, regionMask: regionMask,
    toBlob: toBlob, colorName: colorName, summary: summary,
    illustrate: illustrate, renderIllus: renderIllus, renderIllusDelta: renderIllusDelta, setAreaOrder: setAreaOrder, areaAt: areaAt, mergeAreas: mergeAreas
  };
})(typeof window !== 'undefined' ? window : this);
