!(function () {
  var e = {
      6691: function (e, i, t) {
        "use strict";
        t.r(i);
        var s = /iPhone/i,
          o = /iPod/i,
          n = /iPad/i,
          a = /\biOS-universal(?:.+)Mac\b/i,
          r = /\bAndroid(?:.+)Mobile\b/i,
          d = /Android/i,
          h = /(?:SD4930UR|\bSilk(?:.+)Mobile\b)/i,
          c = /Silk/i,
          w = /Windows Phone/i,
          p = /\bWindows(?:.+)ARM\b/i,
          l = /BlackBerry/i,
          u = /BB10/i,
          v = /Opera Mini/i,
          b = /\b(CriOS|Chrome)(?:.+)Mobile/i,
          g = /Mobile(?:.+)Firefox\b/i,
          m = function (e) {
            return (
              void 0 !== e &&
              "MacIntel" === e.platform &&
              "number" == typeof e.maxTouchPoints &&
              e.maxTouchPoints > 1 &&
              "undefined" == typeof MSStream
            );
          };
        function f(e) {
          var i = { userAgent: "", platform: "", maxTouchPoints: 0 };
          e || "undefined" == typeof navigator
            ? "string" == typeof e
              ? (i.userAgent = e)
              : e &&
                e.userAgent &&
                (i = {
                  userAgent: e.userAgent,
                  platform: e.platform,
                  maxTouchPoints: e.maxTouchPoints || 0,
                })
            : (i = {
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                maxTouchPoints: navigator.maxTouchPoints || 0,
              });
          var t = i.userAgent,
            f = t.split("[FBAN");
          void 0 !== f[1] && (t = f[0]),
            void 0 !== (f = t.split("Twitter"))[1] && (t = f[0]);
          var T = (function (e) {
              return function (i) {
                return i.test(e);
              };
            })(t),
            C = {
              apple: {
                phone: T(s) && !T(w),
                ipod: T(o),
                tablet: !T(s) && (T(n) || m(i)) && !T(w),
                universal: T(a),
                device: (T(s) || T(o) || T(n) || T(a) || m(i)) && !T(w),
              },
              amazon: {
                phone: T(h),
                tablet: !T(h) && T(c),
                device: T(h) || T(c),
              },
              android: {
                phone: (!T(w) && T(h)) || (!T(w) && T(r)),
                tablet: !T(w) && !T(h) && !T(r) && (T(c) || T(d)),
                device:
                  (!T(w) && (T(h) || T(c) || T(r) || T(d))) || T(/\bokhttp\b/i),
              },
              windows: { phone: T(w), tablet: T(p), device: T(w) || T(p) },
              other: {
                blackberry: T(l),
                blackberry10: T(u),
                opera: T(v),
                firefox: T(g),
                chrome: T(b),
                device: T(l) || T(u) || T(v) || T(g) || T(b),
              },
              any: !1,
              phone: !1,
              tablet: !1,
            };
          return (
            (C.any =
              C.apple.device ||
              C.android.device ||
              C.windows.device ||
              C.other.device),
            (C.phone = C.apple.phone || C.android.phone || C.windows.phone),
            (C.tablet = C.apple.tablet || C.android.tablet || C.windows.tablet),
            C
          );
        }
        window.DETECT = new (class {
          constructor(e = {}) {
            (this.wrap = e.wrap ? e.wrap : document.querySelector("html")),
              (this.detect = { svg: !!e.svg && e.svg }),
              (this.spec = { str: null, score: 0 }),
              (this.deviceChangeToggleClass =
                !!e.deviceChangeToggleClass && e.deviceChangeToggleClass),
              "function" == typeof e.onDeviceChanged &&
                (this.onDeviceChanged = () => e.onDeviceChanged(this)),
              (this.reduced = !1),
              (this.webp = !0),
              (this.touch = !1),
              (this.retina = !1),
              (this.webgl = !0),
              (this.browser = null),
              (this.legacy = !1),
              (this.os = {
                win: !1,
                mac: !1,
                android: !1,
                ios: !1,
                unknown: !1,
              }),
              (this.device = {
                mobile: !1,
                tablet: !1,
                ipadpro: !1,
                desktop: !1,
                laptop: !1,
                any: !1,
                history: {
                  mobile: !1,
                  tablet: !1,
                  ipadpro: !1,
                  desktop: !1,
                  laptop: !1,
                  any: !1,
                },
              }),
              (this.mode = null),
              (this.ua = window.navigator.userAgent.toLowerCase()),
              (this.ua_ver = window.navigator.appVersion.toLowerCase()),
              this.onRunRabbit();
          }
          onRunRabbit() {
            null === window.ontouchstart && (this.touch = !0),
              -1 != window.navigator.platform.indexOf("Win") &&
                (this.os.win = !0),
              this.onDetectRetina(),
              this.onDetectOs(),
              this.onDetectDevide(),
              this.onToggleClass(),
              this.onDetectSpec(),
              this.onDetectBrows(),
              this.onDetectWebGL(),
              this.onDetectMotionReduced(),
              this.onDetectColorMode(),
              this.onDetectWebP(),
              this.addEvents(),
              this.detect.svg && this.onDetectSvg(),
              (this.result = {
                "DETECT.ua": this.ua,
                "DETECT.browser": this.browser,
                "DETECT.legacy": this.legacy,
                "DETECT.spec.str": this.spec.str,
                "DETECT.os.win": this.os.win,
                "DETECT.os.mac": this.os.mac,
                "DETECT.spec.score": this.spec.score,
                "DETECT.reduced": this.reduced,
                "DETECT.webgl": this.webgl,
                "DETECT.device.mobile": this.device.mobile,
                "DETECT.device.desktop": this.device.desktop,
                "DETECT.device.tablet": this.device.tablet,
                "DETECT.touch": this.touch,
                "DETECT.retina": this.retina,
                "DETECT.mode": this.mode,
                "DETECT.webp": this.webp,
              });
          }
          onDetectWebP() {
            const e = document.createElement("canvas");
            "object" == typeof document &&
              (e.getContext &&
              e.getContext("2d") &&
              0 === e.toDataURL("image/webp").indexOf("data:image/webp")
                ? (this.webp = !0)
                : (this.webp = !1));
          }
          onDetectColorMode() {
            window.matchMedia &&
            window.matchMedia("(prefers-color-scheme: dark)").matches
              ? (this.mode = "dark")
              : (this.mode = "light");
          }
          onDetectRetina() {
            window.devicePixelRatio > 1 && (this.retina = !0);
          }
          onDetectSvg() {
            if (
              ((this.filter = { feDisplacementMap: !1, feTurbulence: !1 }),
              this.device.desktop)
            )
              switch (this.browser) {
                case "chrome":
                case "firefox":
                case "ie11":
                case "opera":
                  (this.filter.feDisplacementMap = !0),
                    (this.filter.feTurbulence = !0);
              }
          }
          onDetectMotionReduced() {
            const e = window.matchMedia("(prefers-reduced-motion: reduce)");
            !e || e.matches ? (this.reduced = !0) : (this.reduced = !1);
          }
          onDetectWebGL() {
            const e = document.createElement("canvas"),
              i = e.getContext("webgl") || e.getContext("experimental-webgl");
            (this.webgl = i instanceof WebGLRenderingContext),
              this.webgl || (this.legacy = !0);
          }
          onToggleClass() {
            this.wrap.classList.remove(
              "is-any",
              "is-not-any",
              "is-mobile",
              "is-tablet",
              "is-large-tablet"
            );
            const e =
              this.os.mac &&
              navigator.maxTouchPoints &&
              navigator.maxTouchPoints > 1 &&
              ((window.screen.width <= 1024 && window.screen.height <= 1366) ||
                (window.screen.width <= 1366 && window.screen.height <= 1024));
            f(window.navigator.userAgent).phone || window.innerWidth < 640
              ? this.wrap.classList.add("is-any", "is-mobile")
              : e ||
                f(window.navigator.userAgent).tablet ||
                window.innerWidth < 1024 ||
                (!this.getUA("ipad") &&
                  this.getUA("macintosh") &&
                  "ontouchend" in document)
              ? (this.wrap.classList.add("is-any", "is-tablet"),
                window.innerWidth > 1024 &&
                  this.wrap.classList.add("is-large-tablet"))
              : this.wrap.classList.add("is-not-any");
          }
          onDetectDevide() {
            const e =
              this.os.mac &&
              navigator.maxTouchPoints &&
              navigator.maxTouchPoints > 1 &&
              ((window.screen.width <= 1024 && window.screen.height <= 1366) ||
                (window.screen.width <= 1366 && window.screen.height <= 1024));
            f(window.navigator.userAgent).phone || window.innerWidth < 640
              ? ((this.device.any = !0),
                (this.device.mobile = !0),
                (this.device.tablet = !1),
                (this.device.desktop = !1))
              : e ||
                f(window.navigator.userAgent).tablet ||
                window.innerWidth < 1024 ||
                (!this.getUA("ipad") &&
                  this.getUA("macintosh") &&
                  "ontouchend" in document)
              ? ((this.device.any = !0),
                (this.device.mobile = !1),
                (this.device.tablet = !0),
                (this.device.desktop = !1),
                window.innerWidth > 1024 && (this.device.ipadpro = !0))
              : ((this.device.any = !1),
                (this.device.mobile = !1),
                (this.device.tablet = !1),
                (this.device.desktop = !0),
                window.innerWidth <= 1366 && (this.laptop = !0));
          }
          getUA(e) {
            return -1 != window.navigator.userAgent.toLowerCase().indexOf(e);
          }
          onDetectOs() {
            -1 !== this.ua.indexOf("windows nt")
              ? (this.os.win = !0)
              : -1 !== this.ua.indexOf("android")
              ? (this.os.android = !0)
              : -1 !== this.ua.indexOf("iphone") ||
                -1 !== this.ua.indexOf("ipad")
              ? (this.os.ios = !0)
              : -1 !== this.ua.indexOf("mac os x")
              ? (this.os.mac = !0)
              : (this.os.unknown = !0),
              this.os.win
                ? (this.wrap.dataset.os = "win")
                : this.os.mac && (this.wrap.dataset.os = "mac");
          }
          onDetectSpec() {
            this.retina
              ? ((this.spec.str = "Laptop"),
                (this.spec.score = 7),
                window.screen.width <= 1680 &&
                  window.navigator.hardwareConcurrency >= 6 &&
                  ((this.spec.str = "Laptop HiEnd, Corei5 or higher"),
                  (this.spec.score = 8)),
                1680 === window.innerWidth &&
                  1680 === window.screen.width &&
                  window.navigator.hardwareConcurrency >= 6 &&
                  ((this.spec.str =
                    "Laptop MidEnd, 15 Fullscreen, Corei5 or higher"),
                  (this.spec.score = 7)),
                1440 === window.screen.width &&
                  window.navigator.hardwareConcurrency >= 6 &&
                  ((this.spec.str =
                    "Laptop MidEnd, 13 Fullscreen, Corei5 or higher"),
                  (this.spec.score = 8)),
                window.screen.width > 1680 &&
                  window.navigator.hardwareConcurrency >= 6 &&
                  ((this.spec.str = "Desktop MidEnd, Corei5 or higher"),
                  (this.spec.score = 9)),
                window.screen.width > 1680 &&
                  window.navigator.hardwareConcurrency >= 8 &&
                  ((this.spec.str = "Desktop HiEnd, Corei7 or higher"),
                  (this.spec.score = 10)))
              : ((this.spec.str = "Leagcy"), (this.spec.score = 8)),
              this.device.phone
                ? (this.spec.str = "Mobile")
                : this.device.tablet && (this.spec.str = "Tablet");
          }
          onDetectBrows() {
            -1 !== this.ua.indexOf("edge")
              ? (this.browser = "edge")
              : -1 !== this.ua.indexOf("iemobile")
              ? ((this.browser = "iemobile"),
                (this.legacy = !0),
                (this.webp = !1))
              : -1 !== this.ua.indexOf("trident/7")
              ? ((this.browser = "ie11"), (this.legacy = !0), (this.webp = !1))
              : -1 !== this.ua.indexOf("msie") &&
                -1 === this.ua.indexOf("opera")
              ? ((this.legacy = !0),
                (this.webp = !1),
                -1 !== this.ua_ver.indexOf("msie 6.")
                  ? (this.browser = "ie6")
                  : -1 !== this.ua_ver.indexOf("msie 7.")
                  ? (this.browser = "ie7")
                  : -1 !== this.ua_ver.indexOf("msie 8.")
                  ? (this.browser = "ie8")
                  : -1 !== this.ua_ver.indexOf("msie 9.")
                  ? (this.browser = "ie9")
                  : -1 !== this.ua_ver.indexOf("msie 10.") &&
                    (this.browser = "ie10"))
              : -1 !== this.ua.indexOf("chrome") &&
                -1 === this.ua.indexOf("edge")
              ? (this.browser = "chrome")
              : -1 !== this.ua.indexOf("safari") &&
                -1 === this.ua.indexOf("chrome")
              ? ((this.browser = "safari"),
                this.device.any || (this.legacy = !0))
              : -1 !== this.ua.indexOf("opera")
              ? (this.browser = "opera")
              : -1 !== this.ua.indexOf("firefox")
              ? (this.browser = "firefox")
              : (this.browser = "unknown"),
              this.legacy && this.wrap.classList.add("is-legacy"),
              (this.wrap.dataset.browser = this.browser);
          }
          addEvents() {
            (this.onResize = this.onResize.bind(this)),
              window.addEventListener("resize", this.onResize);
          }
          removeEvents() {
            window.removeEventListener("resize", this.onResize);
          }
          onResize() {
            if (
              ((this.prev = {
                mobile: this.device.mobile,
                tablet: this.device.tablet,
                ipadpro: this.device.ipadpro,
                desktop: this.device.desktop,
                laptop: this.device.laptop,
                any: this.device.any,
              }),
              this.onDetectDevide(),
              this.deviceChangeToggleClass && this.onToggleClass(),
              this.onDeviceChanged)
            ) {
              let e = 0;
              Object.keys(this.prev).forEach((i) => {
                this.prev[i] != this.device[i] && e++;
              }),
                0 != e && this.onDeviceChanged();
            }
          }
        })({
          onDeviceChanged: (e) => {
            e.device.desktop && e.prev.any && location.reload(),
              e.device.any && e.prev.desktop && location.reload();
          },
          deviceChangeToggleClass: !0,
        });
      },
      1280: function () {
        (window.$app = document.querySelector("#app")),
          (window.LOCAL_ASSETS_URL = $app.dataset.localAssets);
        const e = document.createElement("script");
        e.setAttribute("defer", !0),
          DETECT.device.any
            ? (e.src =
                LOCAL_ASSETS_URL + "/js/" + ENV + "-mobile.js?v=" + UNIQ_ID)
            : (e.src =
                LOCAL_ASSETS_URL + "/js/" + ENV + "-desktop.js?v=" + UNIQ_ID),
          document.body.appendChild(e);
      },
    },
    i = {};
  function t(s) {
    var o = i[s];
    if (void 0 !== o) return o.exports;
    var n = (i[s] = { exports: {} });
    return e[s](n, n.exports, t), n.exports;
  }
  (t.r = function (e) {
    "undefined" != typeof Symbol &&
      Symbol.toStringTag &&
      Object.defineProperty(e, Symbol.toStringTag, { value: "Module" }),
      Object.defineProperty(e, "__esModule", { value: !0 });
  }),
    t(6691),
    t(1280);
})();
