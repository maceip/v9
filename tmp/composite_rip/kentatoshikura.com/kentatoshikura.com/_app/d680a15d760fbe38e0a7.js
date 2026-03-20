(window.webpackJsonp = window.webpackJsonp || []).push([
  [4],
  {
    274: function (t, e, r) {
      "use strict";
      r.r(e);
      r(63), r(23), r(12), r(8), r(19);
      var s = r(2),
        a = r(41);
      function n(t, e) {
        var r = Object.keys(t);
        if (Object.getOwnPropertySymbols) {
          var s = Object.getOwnPropertySymbols(t);
          e &&
            (s = s.filter(function (e) {
              return Object.getOwnPropertyDescriptor(t, e).enumerable;
            })),
            r.push.apply(r, s);
        }
        return r;
      }
      r(62)("./env.".concat("production", ".js"));
      var o = {
          components: {},
          computed: (function (t) {
            for (var e = 1; e < arguments.length; e++) {
              var r = null != arguments[e] ? arguments[e] : {};
              e % 2
                ? n(Object(r), !0).forEach(function (e) {
                    Object(s.a)(t, e, r[e]);
                  })
                : Object.getOwnPropertyDescriptors
                ? Object.defineProperties(
                    t,
                    Object.getOwnPropertyDescriptors(r)
                  )
                : n(Object(r)).forEach(function (e) {
                    Object.defineProperty(
                      t,
                      e,
                      Object.getOwnPropertyDescriptor(r, e)
                    );
                  });
            }
            return t;
          })({}, Object(a.b)(["projects", "slide"])),
          head: function () {
            var t =
              "Lead web designer and front-end developer at Garden Eight.";
            return {
              title: "Kenta Toshikura",
              meta: [
                { name: "description", content: t },
                {
                  hid: "og:title",
                  property: "og:title",
                  content: "Kenta Toshikura",
                },
                {
                  hid: "og:description",
                  property: "og:description",
                  content: t,
                },
              ],
            };
          },
          mounted: function () {
            __ROUTE__.onMounted("home", this.$store.$device, {
              current: "home",
              prev: null,
              next: null,
            });
          },
          methods: {
            onRouteToProject: function (t) {
              t.preventDefault();
            },
          },
          transition: {
            mode: "out-in",
            css: !1,
            beforeEnter: function (t) {
              __ROUTE__.beforeEnter(t);
            },
            enter: function (t, e) {
              __ROUTE__.enter(t, e);
            },
            afterEnter: function (t) {
              this.onMouseLeaveUI(), __ROUTE__.afterEnter(t);
            },
            leave: function (t, e) {
              __ROUTE__.leave(t, e);
            },
          },
        },
        i = r(34),
        c = Object(i.a)(
          o,
          function () {
            var t = this,
              e = t.$createElement,
              r = t._self._c || e;
            return r(
              "div",
              { staticClass: "site-content", attrs: { "data-name": "home" } },
              [
                r(
                  "a",
                  {
                    staticClass: "btn-box ui-slide-btn-box left a",
                    attrs: { href: "#", "aria-hidden": "true" },
                    on: { click: t.onSlideToPrev },
                  },
                  [
                    r(
                      "svg",
                      {
                        staticClass: "svg-arrow-curve",
                        attrs: { viewBox: "0 0 50 50" },
                      },
                      [
                        r("path", {
                          staticClass: "path",
                          attrs: {
                            "clip-path": "url(#curve)",
                            d: "M50,5H45S28,3,25,25V50.09",
                          },
                        }),
                      ]
                    ),
                  ]
                ),
                t._v(" "),
                r(
                  "a",
                  {
                    staticClass: "btn-box ui-slide-btn-box right a",
                    attrs: { href: "#", "aria-hidden": "true" },
                    on: { click: t.onSlideToNext },
                  },
                  [
                    r(
                      "svg",
                      {
                        staticClass: "svg-arrow-curve",
                        attrs: { viewBox: "0 0 50 50" },
                      },
                      [
                        r("path", {
                          staticClass: "path",
                          attrs: {
                            "clip-path": "url(#curve)",
                            d: "M50,5H45S28,3,25,25V50.09",
                          },
                        }),
                      ]
                    ),
                  ]
                ),
                t._v(" "),
                r(
                  "div",
                  {
                    staticClass: "projects-wrap",
                    attrs: { "data-index": t.slide.index + 1 },
                  },
                  [
                    r("div", { staticClass: "in" }, [
                      r(
                        "ul",
                        {
                          staticClass: "projects-ul",
                          attrs: { "data-ui": "a" },
                          on: {
                            mouseenter: t.onMouseEnterUI,
                            mouseleave: t.onMouseLeaveUI,
                          },
                        },
                        t._l(t.projects, function (e) {
                          return r("li", { staticClass: "projects-li" }, [
                            r(
                              "a",
                              {
                                staticClass: "projects-a",
                                attrs: {
                                  href: "/project/" + e.slug,
                                  draggable: "false",
                                },
                                on: { click: t.onStaicRouteToProject },
                              },
                              [
                                r("div", { staticClass: "projects-t f-xxl" }, [
                                  t._v(t._s(e.post.title)),
                                ]),
                              ]
                            ),
                          ]);
                        }),
                        0
                      ),
                      t._v(" "),
                      r(
                        "div",
                        {
                          staticClass: "btn-box",
                          attrs: { "aria-hidden": "true" },
                        },
                        [
                          r(
                            "svg",
                            {
                              staticClass: "svg-arrow-curve",
                              attrs: { viewBox: "0 0 50 50" },
                            },
                            [
                              r("path", {
                                staticClass: "path",
                                attrs: {
                                  "clip-path": "url(#curve)",
                                  d: "M50,5H45S28,3,25,25V50.09",
                                },
                              }),
                            ]
                          ),
                        ]
                      ),
                    ]),
                  ]
                ),
              ]
            );
          },
          [],
          !1,
          null,
          null,
          null
        );
      e.default = c.exports;
    },
  },
]);
