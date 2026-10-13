/* ==========================================================
   firebase-adapter.js — يربط الموقع بـ Firestore (اختياري)
   عند التفعيل:
     • المستند   settings/site   → يستبدل حقول SITE (hero, logo, instagram ...)
     • المجموعة  products        → تستبدل قائمة المنتجات (نفس حقول products.js)
     • المجموعة  orders          → يُحفظ فيها كل طلب يُرسل عبر واتساب
   عند التعطيل أو حدوث أي خطأ: يُستخدم products.js كما هو.
   ========================================================== */
(function () {
  "use strict";
  var V = "10.12.2";
  var BASE = "https://www.gstatic.com/firebasejs/" + V + "/";
  var db = null;

  function loadScript(src) {
    return new Promise(function (ok, fail) {
      var s = document.createElement("script");
      s.src = src; s.onload = ok; s.onerror = fail;
      document.head.appendChild(s);
    });
  }
  function ready() {
    var c = window.FIREBASE_CONFIG;
    return !!(c && c.enabled && c.apiKey && c.projectId);
  }

  function init() {
    if (!ready()) return Promise.resolve(false);
    if (db) return Promise.resolve(true);
    return loadScript(BASE + "firebase-app-compat.js")
      .then(function () { return loadScript(BASE + "firebase-firestore-compat.js"); })
      .then(function () {
        var c = Object.assign({}, window.FIREBASE_CONFIG); delete c.enabled;
        if (!firebase.apps.length) firebase.initializeApp(c);
        db = firebase.firestore();
        return true;
      });
  }

  /* يرجع كائن SITE بعد دمج بيانات Firestore فوق products.js */
  function load() {
    var site = window.SITE;
    return init().then(function (on) {
      if (!on) return site;
      return Promise.all([
        db.collection("settings").doc("site").get(),
        db.collection("products").orderBy("id").get()
      ]).then(function (r) {
        if (r[0].exists) Object.assign(site, r[0].data());
        var list = r[1].docs.map(function (d) { return d.data(); });
        if (list.length) site.products = list;
        return site;
      });
    }).catch(function (e) {
      console.warn("Firebase: تم استخدام البيانات المحلية", e);
      return site;
    });
  }

  function saveOrder(order) {
    if (!db) return Promise.resolve();
    order.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    return db.collection("orders").add(order).catch(function () {});
  }

  window.FirebaseAdapter = { load: load, saveOrder: saveOrder, enabled: ready };
})();
