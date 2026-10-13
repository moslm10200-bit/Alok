/* مولّد QR بسيط (وضع Byte، تصحيح أخطاء M، إصدارات 1-10) — بدون أي مكتبات خارجية */
(function (global) {
  "use strict";
  var ECC = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26];   // كلمات التصحيح لكل كتلة (M)
  var BLK = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5];              // عدد الكتل (M)

  function rawModules(v) {
    var r = (16 * v + 128) * v + 64;
    if (v >= 2) { var n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; }
    return r;
  }
  function dataCap(v) { return Math.floor(rawModules(v) / 8) - ECC[v - 1] * BLK[v - 1]; }

  function gmul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; }
    return z;
  }
  function rsDivisor(d) {
    var c = [], i, j, root = 1;
    for (i = 0; i < d - 1; i++) c.push(0);
    c.push(1);
    for (i = 0; i < d; i++) {
      for (j = 0; j < d; j++) { c[j] = gmul(c[j], root); if (j + 1 < d) c[j] ^= c[j + 1]; }
      root = gmul(root, 2);
    }
    return c;
  }
  function rsRemainder(data, div) {
    var res = div.map(function () { return 0; });
    data.forEach(function (b) {
      var f = b ^ res.shift(); res.push(0);
      div.forEach(function (c, i) { res[i] ^= gmul(c, f); });
    });
    return res;
  }
  function utf8(str) {
    var s = unescape(encodeURIComponent(str)), a = [];
    for (var i = 0; i < s.length; i++) a.push(s.charCodeAt(i));
    return a;
  }
  function bit(x, i) { return ((x >>> i) & 1) !== 0; }

  function encode(text) {
    var bytes = utf8(text), v, size;
    for (v = 1; v <= 10; v++) {
      var ccBits = 8;
      if (4 + ccBits + bytes.length * 8 <= dataCap(v) * 8) break;
    }
    if (v > 10) throw new Error("النص طويل جداً لرمز QR");
    size = v * 4 + 17;

    // بتات البيانات
    var bits = [];
    function put(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    put(4, 4); put(bytes.length, 8);
    bytes.forEach(function (b) { put(b, 8); });
    var capBits = dataCap(v) * 8;
    put(0, Math.min(4, capBits - bits.length));
    while (bits.length % 8) bits.push(0);
    for (var pad = 0xEC; bits.length < capBits; pad ^= 0xEC ^ 0x11) put(pad, 8);
    var data = [];
    for (var i = 0; i < bits.length; i += 8) {
      var by = 0; for (var k = 0; k < 8; k++) by = (by << 1) | bits[i + k]; data.push(by);
    }

    // كتل + تصحيح أخطاء + تداخل
    var nb = BLK[v - 1], el = ECC[v - 1], raw = Math.floor(rawModules(v) / 8);
    var nShort = nb - raw % nb, shortLen = Math.floor(raw / nb), blocks = [], div = rsDivisor(el);
    for (var b = 0, off = 0; b < nb; b++) {
      var dl = shortLen - el + (b < nShort ? 0 : 1);
      var dat = data.slice(off, off + dl); off += dl;
      var ecc = rsRemainder(dat, div);
      if (b < nShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var all = [];
    for (i = 0; i < blocks[0].length; i++)
      for (var j = 0; j < nb; j++)
        if (i !== shortLen - el || j >= nShort) all.push(blocks[j][i]);

    // مصفوفة الوحدات
    var mod = [], fn = [], y, x;
    for (y = 0; y < size; y++) { mod.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    function setF(x, y, d) { mod[y][x] = d; fn[y][x] = true; }

    for (i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
    function finder(cx, cy) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var d = Math.max(Math.abs(dx), Math.abs(dy)), xx = cx + dx, yy = cy + dy;
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) setF(xx, yy, d !== 2 && d !== 4);
      }
    }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    var pos = [];
    if (v > 1) {
      var na = Math.floor(v / 7) + 2, step = Math.ceil((v * 4 + 4) / (na * 2 - 2)) * 2;
      pos = [6];
      for (var p = size - 7; pos.length < na; p -= step) pos.splice(1, 0, p);
    }
    pos.forEach(function (ax, ai) {
      pos.forEach(function (ay, bi) {
        if ((ai === 0 && bi === 0) || (ai === 0 && bi === pos.length - 1) || (ai === pos.length - 1 && bi === 0)) return;
        for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++)
          setF(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      });
    });
    function drawFormat(mask) {
      var d = (0 << 3) | mask, rem = d;       // M = 0
      for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var f = ((d << 10) | rem) ^ 0x5412;
      for (i = 0; i <= 5; i++) setF(8, i, bit(f, i));
      setF(8, 7, bit(f, 6)); setF(8, 8, bit(f, 7)); setF(7, 8, bit(f, 8));
      for (i = 9; i < 15; i++) setF(14 - i, 8, bit(f, i));
      for (i = 0; i < 8; i++) setF(size - 1 - i, 8, bit(f, i));
      for (i = 8; i < 15; i++) setF(8, size - 15 + i, bit(f, i));
      setF(8, size - 8, true);
    }
    drawFormat(0);
    if (v >= 7) {
      var r = v;
      for (i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25);
      var vb = (v << 12) | r;
      for (i = 0; i < 18; i++) {
        var c = bit(vb, i), a = size - 11 + i % 3, bb = Math.floor(i / 3);
        setF(a, bb, c); setF(bb, a, c);
      }
    }

    // وضع الكلمات
    var idx = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) for (j = 0; j < 2; j++) {
        x = right - j;
        var up = ((right + 1) & 2) === 0;
        y = up ? size - 1 - vert : vert;
        if (!fn[y][x] && idx < all.length * 8) { mod[y][x] = bit(all[idx >>> 3], 7 - (idx & 7)); idx++; }
      }
    }

    function applyMask(m) {
      for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
        var inv;
        switch (m) {
          case 0: inv = (x + y) % 2 === 0; break;
          case 1: inv = y % 2 === 0; break;
          case 2: inv = x % 3 === 0; break;
          case 3: inv = (x + y) % 3 === 0; break;
          case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: inv = x * y % 2 + x * y % 3 === 0; break;
          case 6: inv = (x * y % 2 + x * y % 3) % 2 === 0; break;
          default: inv = ((x + y) % 2 + x * y % 3) % 2 === 0;
        }
        if (!fn[y][x] && inv) mod[y][x] = !mod[y][x];
      }
    }
    function penalty() {
      var s = 0, y, x, run, dark = 0;
      for (y = 0; y < size; y++) {
        run = 1;
        for (x = 1; x < size; x++) { if (mod[y][x] === mod[y][x - 1]) { run++; if (run === 5) s += 3; else if (run > 5) s++; } else run = 1; }
      }
      for (x = 0; x < size; x++) {
        run = 1;
        for (y = 1; y < size; y++) { if (mod[y][x] === mod[y - 1][x]) { run++; if (run === 5) s += 3; else if (run > 5) s++; } else run = 1; }
      }
      for (y = 0; y < size - 1; y++) for (x = 0; x < size - 1; x++)
        if (mod[y][x] === mod[y][x + 1] && mod[y][x] === mod[y + 1][x] && mod[y][x] === mod[y + 1][x + 1]) s += 3;
      for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (mod[y][x]) dark++;
      s += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
      return s;
    }
    var best = 0, bestP = Infinity;
    for (var m = 0; m < 8; m++) {
      applyMask(m); drawFormat(m);
      var pn = penalty();
      if (pn < bestP) { bestP = pn; best = m; }
      applyMask(m);
    }
    applyMask(best); drawFormat(best);
    return mod;
  }

  /* يرسم الرمز على canvas */
  function draw(canvas, text, px, fg, bg) {
    var m = encode(text), n = m.length, quiet = 4, cell = Math.max(2, Math.floor(px / (n + quiet * 2)));
    var total = (n + quiet * 2) * cell;
    canvas.width = canvas.height = total;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = bg || "#fff"; ctx.fillRect(0, 0, total, total);
    ctx.fillStyle = fg || "#000";
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++)
      if (m[y][x]) ctx.fillRect((x + quiet) * cell, (y + quiet) * cell, cell, cell);
  }
  global.SimpleQR = { encode: encode, draw: draw };
  if (typeof module !== "undefined") module.exports = global.SimpleQR;
})(typeof window !== "undefined" ? window : globalThis);

/* ==========================================================
   app.js — منطق الموقع (الواجهة، المنتجات، السلة، QR)
   ========================================================== */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var FB = window.SITE_FALLBACK || {};
  var S = window.SITE;
  var fmt = function (n) { return S.currency + Number(n).toFixed(2); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  /* زجاجة افتراضية (SVG مدمج) عندما لا يوجد رابط صورة أو لا يعمل */
  function bottle(p) {
    var t = p.tint || ["#d9b27a", "#8a5a2b", "#c98a2b"];
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs>' +
      '<linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + t[0] + '"/><stop offset="1" stop-color="' + t[1] + '"/></linearGradient>' +
      '<linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".25" stop-color="#fff" stop-opacity="0"/><stop offset=".8" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".25"/></linearGradient>' +
      '<radialGradient id="s"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="400" height="400" fill="url(#b)"/><circle cx="330" cy="70" r="90" fill="#fff" opacity=".12"/><rect y="300" width="400" height="100" fill="#000" opacity=".16"/>' +
      '<ellipse cx="200" cy="322" rx="105" ry="16" fill="url(#s)"/><rect x="165" y="52" width="70" height="46" rx="5" fill="#1a1410"/><rect x="186" y="98" width="28" height="16" fill="#c9a24a"/>' +
      '<rect x="128" y="114" width="144" height="196" rx="14" fill="#eef4f4" opacity=".55" stroke="#fff" stroke-opacity=".7" stroke-width="3"/>' +
      '<rect x="140" y="170" width="120" height="130" rx="8" fill="' + t[2] + '"/><rect x="156" y="198" width="88" height="62" rx="3" fill="#f7f1e3"/>' +
      '<rect x="164" y="206" width="72" height="1.6" fill="#b08d3e"/><rect x="164" y="250" width="72" height="1.6" fill="#b08d3e"/>' +
      '<text x="200" y="236" text-anchor="middle" font-family="Tajawal,Arial,sans-serif" font-weight="800" font-size="22" fill="#1a1a1a">السكب</text>' +
      '<rect x="128" y="114" width="144" height="196" rx="14" fill="url(#g)"/></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  function imgOf(p) { return p.img ? p.img : bottle(p); }
  /* إذا فشل تحميل صورة من رابط → استبدلها بالزجاجة الافتراضية */
  function guard(root) {
    root.querySelectorAll("img[data-pid]").forEach(function (im) {
      im.onerror = function () { im.onerror = null; im.src = bottle(byId(im.getAttribute("data-pid"))); };
    });
  }
  var byId = function (id) { return S.products.filter(function (p) { return p.id === +id; })[0]; };

  var tt;
  function toast(m) { var t = $("toast"); t.textContent = m; t.classList.add("show"); clearTimeout(tt); tt = setTimeout(function () { t.classList.remove("show"); }, 1800); }

  function start() {
    var wa = "https://wa.me/" + S.whatsappNumber;

    /* ---------- الواجهة: فيديو أو صورة (من روابط) ---------- */
    var media = $("heroMedia");
    var poster = S.hero.image || FB.hero || "";
    function showImage() { media.innerHTML = ""; media.style.backgroundImage = poster ? "url(" + poster + ")" : "none"; }
    if (S.hero.type === "video" && S.hero.video) {
      var v = document.createElement("video");
      v.src = S.hero.video; if (poster) v.poster = poster;
      v.autoplay = true; v.loop = true; v.muted = true; v.playsInline = true;
      v.setAttribute("playsinline", ""); v.setAttribute("muted", "");
      v.onerror = showImage;
      media.appendChild(v);
      var pr = v.play(); if (pr && pr.catch) pr.catch(function () {});
      if (poster) media.style.backgroundImage = "url(" + poster + ")";
    } else { showImage(); }

    /* ---------- الشعار (رابط أو مدمج) ---------- */
    ["logoImg", "heroLogo", "footLogo"].forEach(function (i) {
      var im = $(i); im.src = S.logo || FB.logo || "";
      im.onerror = function () { im.onerror = null; if (FB.logo) im.src = FB.logo; };
    });

    /* ---------- الروابط ---------- */
    $("lnkWhats").href = wa; $("fWhats").href = wa;
    $("lnkInsta").href = S.instagram; $("fInsta").href = S.instagram;
    $("lnkTiktok").href = S.tiktok; $("fTiktok").href = S.tiktok;
    $("supportNum").textContent = S.supportText;
    $("supportNum").href = "tel:" + S.supportText.replace(/\s/g, "");
    $("yr").textContent = new Date().getFullYear();

    /* ---------- المنتجات ---------- */
    var grid = $("grid");
    S.products.forEach(function (p) {
      var el = document.createElement("article");
      el.className = "card";
      el.innerHTML =
        '<div class="card-img"><img loading="lazy" data-pid="' + p.id + '" alt="' + esc(p.name) + '" src="' + esc(imgOf(p)) + '"></div>' +
        '<div class="card-body"><h3>' + esc(p.name) + '</h3><div class="by">' + esc(p.by) + '</div>' +
        '<div class="price">' + fmt(p.price) + '</div>' +
        '<div class="card-btns"><button class="btn-light" data-det="' + p.id + '">التفاصيل</button>' +
        '<button class="btn-dark" data-add="' + p.id + '" aria-label="أضف للسلة">' +
        '<svg viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6L5 8Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 8V6a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="2"/></svg> أضف</button></div></div>';
      grid.appendChild(el);
    });
    guard(grid);

    /* ---------- نوافذ ---------- */
    function open(m) { m.hidden = false; document.body.classList.add("lock"); }
    function closeAll() {
      document.querySelectorAll(".overlay").forEach(function (o) { o.hidden = true; });
      document.body.classList.remove("lock");
    }
    document.querySelectorAll(".overlay").forEach(function (o) {
      o.addEventListener("click", function (e) { if (e.target === o || e.target.hasAttribute("data-close")) closeAll(); });
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeAll(); });

    /* ---------- QR ---------- */
    $("btnQR").addEventListener("click", function () {
      var url = S.siteUrl || location.href.split("#")[0];
      try { SimpleQR.draw($("qrCanvas"), url, 480, "#0b2e3a", "#ffffff"); } catch (e) { toast("تعذر إنشاء الرمز"); return; }
      open($("qrModal"));
    });

    /* ---------- السلة ---------- */
    var cart = [];
    try { cart = JSON.parse(localStorage.getItem("alsakb_cart") || "[]"); } catch (e) {}
    cart = cart.filter(function (c) { return byId(c.id); });
    function save() { try { localStorage.setItem("alsakb_cart", JSON.stringify(cart)); } catch (e) {} }
    function add(id) {
      var it = cart.filter(function (c) { return c.id === +id; })[0];
      if (it) it.q++; else cart.push({ id: +id, q: 1 });
      save(); render(); toast("تمت الإضافة إلى السلة");
    }
    function render() {
      var count = cart.reduce(function (a, c) { return a + c.q; }, 0), total = 0;
      var b = $("cartCount"); b.textContent = count; b.hidden = !count;
      var list = $("cartList");
      if (!cart.length) { list.innerHTML = '<p class="empty">السلة فارغة</p>'; }
      else list.innerHTML = cart.map(function (c) {
        var p = byId(c.id); total += p.price * c.q;
        return '<div class="ci"><img data-pid="' + p.id + '" src="' + esc(imgOf(p)) + '" alt=""><div class="ci-t"><b>' + esc(p.name) + '</b><span>' + fmt(p.price) + '</span></div>' +
          '<div class="qty"><button data-dec="' + c.id + '">−</button><i>' + c.q + '</i><button data-inc="' + c.id + '">+</button></div></div>';
      }).join("");
      guard(list);
      $("cartTotal").textContent = fmt(total);
      $("btnOrder").disabled = !cart.length;
    }
    $("btnCart").addEventListener("click", function () { render(); open($("cartModal")); });
    $("cartList").addEventListener("click", function (e) {
      var t = e.target, id = t.getAttribute("data-inc") || t.getAttribute("data-dec");
      if (!id) return;
      var it = cart.filter(function (c) { return c.id === +id; })[0];
      it.q += t.hasAttribute("data-inc") ? 1 : -1;
      cart = cart.filter(function (c) { return c.q > 0; });
      save(); render();
    });
    $("btnOrder").addEventListener("click", function () {
      var total = 0;
      var lines = cart.map(function (c) { var p = byId(c.id); total += p.price * c.q; return "• " + p.name + " × " + c.q + " = " + fmt(p.price * c.q); });
      var msg = "مرحباً، أرغب بطلب:\n" + lines.join("\n") + "\nالمجموع: " + fmt(total);
      if (window.FirebaseAdapter && FirebaseAdapter.enabled()) {
        FirebaseAdapter.saveOrder({ items: cart.map(function (c) { return { id: c.id, q: c.q }; }), total: total });
      }
      window.open(wa + "?text=" + encodeURIComponent(msg), "_blank");
    });

    /* ---------- التفاصيل ---------- */
    var cur = null;
    grid.addEventListener("click", function (e) {
      var t = e.target.closest("button"); if (!t) return;
      if (t.hasAttribute("data-add")) add(t.getAttribute("data-add"));
      if (t.hasAttribute("data-det")) {
        var p = byId(t.getAttribute("data-det")); cur = p;
        var di = $("dImg"); di.setAttribute("data-pid", p.id); di.src = imgOf(p); di.alt = p.name; guard(di.parentNode);
        $("dName").textContent = p.name; $("dBy").textContent = p.by;
        $("dDesc").textContent = p.desc; $("dPrice").textContent = fmt(p.price);
        $("dNotes").innerHTML = (p.notes || []).map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("");
        open($("detailModal"));
      }
    });
    $("dAdd").addEventListener("click", function () { if (cur) { add(cur.id); closeAll(); } });

    render();
  }

  /* يحمّل بيانات Firebase (إن كان مفعّلاً) ثم يبني الصفحة */
  var go = function (s) { S = s || window.SITE; start(); };
  if (window.FirebaseAdapter) FirebaseAdapter.load().then(go, function () { go(); }); else go();
})();
