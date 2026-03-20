(window.webpackJsonp = window.webpackJsonp || []).push([
  [5],
  {
    270: function (t, s, a) {
      "use strict";
      a.r(s);
      a(63), a(23), a(12), a(8), a(19);
      var e = a(2),
        i = a(41),
        r = a(62)("./env.".concat("production", ".js")),
        l = {
          data: function () {
            return { envSet: r };
          },
          props: ["item"],
        },
        o = a(34),
        n = Object(o.a)(
          l,
          function () {
            var t = this,
              s = t.$createElement,
              a = t._self._c || s;
            return a("div", { staticClass: "section section-full" }, [
              t.item.title
                ? a("div", { staticClass: "body" }, [
                    a(
                      "div",
                      {
                        staticClass:
                          "section-title f-mm js-scroll clip flip upper",
                      },
                      [
                        a("div", { staticClass: "o" }, [
                          a("div", { staticClass: "t" }, [
                            a(
                              "span",
                              {
                                staticClass: "n",
                                attrs: { "aria-hidden": "true" },
                              },
                              [t._v(t._s(t.item.title.index) + ".")]
                            ),
                            t._v(" "),
                            a("span", { staticClass: "h" }, [
                              t._v(t._s(t.item.title.value)),
                            ]),
                          ]),
                        ]),
                        t._v(" "),
                        a("div", {
                          staticClass: "spr",
                          attrs: { "data-n": "1" },
                        }),
                      ]
                    ),
                  ])
                : t._e(),
              t._v(" "),
              a("div", { staticClass: "in" }, [
                a(
                  "div",
                  {
                    staticClass: "full js-gl js-scroll js-ratio-by-w",
                    attrs: {
                      "data-layout-type": "full",
                      "data-media-type": "img",
                      "data-has-border": "true",
                      "data-w": t.item.src.r.x,
                      "data-h": t.item.src.r.y,
                      "data-d2x": t.item.src.d2x,
                      "data-d1x": t.item.src.d1x,
                      "data-mob": t.item.src.d1x,
                    },
                  },
                  [a("div", { staticClass: "el" })]
                ),
              ]),
              t._v(" "),
              a("div", { staticClass: "spr", attrs: { "data-n": "4" } }),
            ]);
          },
          [],
          !1,
          null,
          null,
          null
        ).exports,
        c = a(62)("./env.".concat("production", ".js")),
        d = {
          data: function () {
            return { envSet: c };
          },
          props: ["item"],
        },
        v = Object(o.a)(
          d,
          function () {
            var t = this,
              s = t.$createElement,
              a = t._self._c || s;
            return a("div", { staticClass: "section section-img" }, [
              a("div", { staticClass: "body" }, [
                a("div", { staticClass: "in" }, [
                  t.item.title
                    ? a(
                        "div",
                        {
                          staticClass:
                            "section-title f-mm js-scroll clip flip upper",
                        },
                        [
                          a("div", { staticClass: "o" }, [
                            a("div", { staticClass: "t" }, [
                              a(
                                "span",
                                {
                                  staticClass: "n",
                                  attrs: { "aria-hidden": "true" },
                                },
                                [t._v(t._s(t.item.title.index) + ".")]
                              ),
                              t._v(" "),
                              a("span", { staticClass: "h" }, [
                                t._v(t._s(t.item.title.value)),
                              ]),
                            ]),
                          ]),
                          t._v(" "),
                          a("div", {
                            staticClass: "spr",
                            attrs: { "data-n": "1" },
                          }),
                        ]
                      )
                    : t._e(),
                  t._v(" "),
                  a(
                    "div",
                    {
                      staticClass: "img js-gl js-scroll js-ratio-by-w",
                      attrs: {
                        "data-layout-type": "img",
                        "data-media-type": "img",
                        "data-w": t.item.src.r.x,
                        "data-h": t.item.src.r.y,
                        "data-d2x": t.item.src.d2x,
                        "data-d1x": t.item.src.d1x,
                        "data-mob": t.item.src.d1x,
                      },
                    },
                    [a("div", { staticClass: "el" })]
                  ),
                ]),
              ]),
              t._v(" "),
              a("div", { staticClass: "spr", attrs: { "data-n": "4" } }),
            ]);
          },
          [],
          !1,
          null,
          null,
          null
        ).exports,
        p = { props: ["item", "env"] },
        u = Object(o.a)(
          p,
          function () {
            var t = this,
              s = t.$createElement,
              a = t._self._c || s;
            return a("div", { staticClass: "section section-material" }, [
              a("div", { staticClass: "body" }, [
                a("div", { staticClass: "in" }, [
                  t.item.title
                    ? a(
                        "div",
                        {
                          staticClass:
                            "section-title f-mm js-scroll clip flip upper",
                        },
                        [
                          a("div", { staticClass: "o" }, [
                            a("div", { staticClass: "t" }, [
                              a(
                                "span",
                                {
                                  staticClass: "n",
                                  attrs: { "aria-hidden": "true" },
                                },
                                [t._v(t._s(t.item.title.index) + ".")]
                              ),
                              t._v(" "),
                              a("span", { staticClass: "h" }, [
                                t._v(t._s(t.item.title.value)),
                              ]),
                            ]),
                          ]),
                          t._v(" "),
                          a("div", {
                            staticClass: "spr",
                            attrs: { "data-n": "2" },
                          }),
                        ]
                      )
                    : t._e(),
                  t._v(" "),
                  a(
                    "div",
                    {
                      staticClass: "material-wrap cols",
                      attrs: { "data-col": "3" },
                    },
                    t._l(t.item.array, function (s) {
                      return a(
                        "div",
                        { staticClass: "col" },
                        [
                          "gltf" === s.type
                            ? [
                                a("div", {
                                  staticClass:
                                    "material js-gl js-scroll js-ratio-by-w",
                                  attrs: {
                                    "data-w": "1",
                                    "data-h": ".9",
                                    "data-rotation-x": s.rotation.x,
                                    "data-rotation-y": s.rotation.y,
                                    "data-rotation-z": s.rotation.z,
                                    "data-scale": s.scale,
                                    "data-gltf": s.src,
                                    "data-media-type": "gltf",
                                    "data-layout-type": "material",
                                  },
                                }),
                              ]
                            : "img" === s.type
                            ? [
                                a("div", {
                                  staticClass:
                                    "material js-gl js-scroll js-ratio-by-w",
                                  attrs: {
                                    "data-w": "1",
                                    "data-h": "1",
                                    "data-media-type": "img",
                                    "data-layout-type": "img",
                                    "data-d2x": s.src.d2x,
                                    "data-d1x": s.src.d1x,
                                    "data-mob": s.src.d1x,
                                  },
                                }),
                              ]
                            : t._e(),
                        ],
                        2
                      );
                    }),
                    0
                  ),
                ]),
              ]),
              t._v(" "),
              a("div", { staticClass: "spr", attrs: { "data-n": "4" } }),
            ]);
          },
          [],
          !1,
          null,
          null,
          null
        ).exports,
        m = a(62)("./env.".concat("production", ".js")),
        C = {
          data: function () {
            return { envSet: m };
          },
          props: ["item"],
        },
        _ = Object(o.a)(
          C,
          function () {
            var t = this,
              s = t.$createElement,
              a = t._self._c || s;
            return a("div", { staticClass: "section section-mobile" }, [
              a("div", { staticClass: "section-mobile-body" }, [
                a("div", { staticClass: "mobile-cols-wrap" }, [
                  a("div", { staticClass: "body" }, [
                    a("div", { staticClass: "in" }, [
                      a(
                        "div",
                        {
                          staticClass: "mobile-wrap cols",
                          attrs: { "data-col": "3" },
                        },
                        [
                          t._l(t.item.array, function (s) {
                            return a(
                              "div",
                              { staticClass: "col" },
                              [
                                "img" === s.type
                                  ? [
                                      a(
                                        "div",
                                        {
                                          staticClass:
                                            "mobile js-gl js-scroll js-ratio-by-w",
                                          attrs: {
                                            "data-layout-type": "mobile",
                                            "data-media-type": "img",
                                            "data-w": s.src.r.x,
                                            "data-h": s.src.r.y,
                                            "data-d2x": s.src.d2x,
                                            "data-d1x": s.src.d1x,
                                            "data-mob": s.src.d1x,
                                          },
                                        },
                                        [a("div", { staticClass: "el" })]
                                      ),
                                    ]
                                  : "video" === s.type
                                  ? [
                                      a(
                                        "div",
                                        {
                                          staticClass:
                                            "mobile js-gl js-scroll js-ratio-by-w",
                                          attrs: {
                                            "data-layout-type": "mobile",
                                            "data-media-type": "video",
                                            "data-w": s.r.x,
                                            "data-h": s.r.y,
                                          },
                                        },
                                        [
                                          a("video", {
                                            attrs: {
                                              src: t.envSet.awsBaseUrl + s.src,
                                              crossorigin: "anonymous",
                                              preload: "none",
                                              playsinline: "",
                                              loop: "",
                                              muted: "",
                                            },
                                            domProps: { muted: !0 },
                                          }),
                                        ]
                                      ),
                                    ]
                                  : t._e(),
                              ],
                              2
                            );
                          }),
                          t._v(" "),
                          a("div", { staticClass: "col" }, [
                            t.item.title
                              ? a(
                                  "div",
                                  {
                                    staticClass:
                                      "section-title align-r f-mm js-scroll clip flip upper",
                                  },
                                  [
                                    a("div", { staticClass: "o" }, [
                                      a("div", { staticClass: "t" }, [
                                        a(
                                          "span",
                                          {
                                            staticClass: "n",
                                            attrs: { "aria-hidden": "true" },
                                          },
                                          [t._v(t._s(t.item.title.index) + ".")]
                                        ),
                                        t._v(" "),
                                        a("span", { staticClass: "h" }, [
                                          t._v(t._s(t.item.title.value)),
                                        ]),
                                      ]),
                                    ]),
                                  ]
                                )
                              : t._e(),
                          ]),
                        ],
                        2
                      ),
                    ]),
                  ]),
                ]),
                t._v(" "),
                a("div", { staticClass: "mobile-slide-wrap" }, [
                  a("div", { staticClass: "mobile-slide" }, [
                    a(
                      "div",
                      { staticClass: "mobile-slide-body" },
                      [
                        t._l(t.item.array, function (s) {
                          return [
                            "img" === s.type
                              ? [
                                  a(
                                    "div",
                                    {
                                      staticClass: "mobile js-scroll",
                                      attrs: {
                                        "data-layout-type": "mobile",
                                        "data-media-type": "img",
                                        "data-w": s.src.r.x,
                                        "data-h": s.src.r.y,
                                        "data-d2x": s.src.d2x,
                                        "data-d1x": s.src.d1x,
                                        "data-mob": s.src.d1x,
                                      },
                                    },
                                    [a("div", { staticClass: "el" })]
                                  ),
                                ]
                              : "video" === s.type
                              ? [
                                  a(
                                    "div",
                                    {
                                      staticClass: "mobile js-scroll",
                                      attrs: {
                                        "data-layout-type": "mobile",
                                        "data-media-type": "video",
                                        "data-w": s.r.x,
                                        "data-h": s.r.y,
                                      },
                                    },
                                    [
                                      a("video", {
                                        attrs: {
                                          src: t.envSet.awsBaseUrl + s.src,
                                          crossorigin: "anonymous",
                                          preload: "none",
                                          playsinline: "",
                                          loop: "",
                                          muted: "",
                                        },
                                        domProps: { muted: !0 },
                                      }),
                                    ]
                                  ),
                                ]
                              : t._e(),
                          ];
                        }),
                      ],
                      2
                    ),
                  ]),
                ]),
              ]),
              t._v(" "),
              a("div", { staticClass: "spr", attrs: { "data-n": "4" } }),
            ]);
          },
          [],
          !1,
          null,
          null,
          null
        ).exports,
        g = a(62)("./env.".concat("production", ".js")),
        h = {
          data: function () {
            return { envSet: g };
          },
          props: ["item"],
        },
        y = Object(o.a)(
          h,
          function () {
            var t = this,
              s = t.$createElement,
              a = t._self._c || s;
            return a("div", { staticClass: "section section-video" }, [
              a("div", { staticClass: "body" }, [
                t.item.title
                  ? a(
                      "div",
                      {
                        staticClass:
                          "section-title f-mm js-scroll clip flip upper",
                      },
                      [
                        a("div", { staticClass: "o" }, [
                          a("div", { staticClass: "t" }, [
                            a(
                              "span",
                              {
                                staticClass: "n",
                                attrs: { "aria-hidden": "true" },
                              },
                              [t._v(t._s(t.item.title.index) + ".")]
                            ),
                            t._v(" "),
                            a("span", { staticClass: "h" }, [
                              t._v(t._s(t.item.title.value)),
                            ]),
                          ]),
                        ]),
                        t._v(" "),
                        a("div", {
                          staticClass: "spr",
                          attrs: { "data-n": "1" },
                        }),
                      ]
                    )
                  : t._e(),
                t._v(" "),
                a("div", { staticClass: "in" }, [
                  a(
                    "div",
                    {
                      staticClass: "img js-gl js-scroll js-ratio-by-w",
                      attrs: {
                        "data-w": t.item.r.x,
                        "data-h": t.item.r.y,
                        "data-layout-type": "img",
                        "data-media-type": "video",
                      },
                    },
                    [
                      a("video", {
                        attrs: {
                          src: t.envSet.awsBaseUrl + t.item.src,
                          crossorigin: "anonymous",
                          preload: "none",
                          playsinline: "",
                          loop: "",
                          muted: "",
                        },
                        domProps: { muted: !0 },
                      }),
                    ]
                  ),
                ]),
              ]),
              t._v(" "),
              a("div", { staticClass: "spr", attrs: { "data-n": "4" } }),
            ]);
          },
          [],
          !1,
          null,
          null,
          null
        ).exports,
        f = a(62)("./env.".concat("production", ".js")),
        x = {
          data: function () {
            return { envSet: f };
          },
          props: ["item"],
        },
        j = { props: ["post"] };
      function b(t, s) {
        var a = Object.keys(t);
        if (Object.getOwnPropertySymbols) {
          var e = Object.getOwnPropertySymbols(t);
          s &&
            (e = e.filter(function (s) {
              return Object.getOwnPropertyDescriptor(t, s).enumerable;
            })),
            a.push.apply(a, e);
        }
        return a;
      }
      var w = {
          data: function () {
            for (
              var t = null, s = 0, a = 0, e = 0, i = 0;
              i < this.$store.getters.projects.length;
              i++
            )
              this.$store.getters.projects[i].slug ===
                this.$route.params.slug &&
                ((t = this.$store.getters.projects[i]), (s = i));
            if (s < this.$store.getters.projects.length - 1) {
              var r = this.$store.getters.projects[s + 1];
              a = s + 1;
            } else {
              r = this.$store.getters.projects[0];
              a = 0;
            }
            if (0 === s) {
              var l =
                this.$store.getters.projects[
                  this.$store.getters.projects.length - 1
                ];
              e = this.$store.getters.projects.length - 1;
            } else {
              l = this.$store.getters.projects[s - 1];
              e = s - 1;
            }
            return {
              num: 0,
              current: { data: t, index: s },
              next: { data: r, index: a },
              prev: { data: l, index: e },
            };
          },
          components: {
            contentFull: n,
            contentImg: v,
            contentMaterial: u,
            contentMobile: _,
            contentVideo: y,
            contentCol: Object(o.a)(
              x,
              function () {
                var t = this,
                  s = t.$createElement,
                  a = t._self._c || s;
                return a("div", { staticClass: "section section-col" }, [
                  a("div", { staticClass: "body" }, [
                    t.item.title
                      ? a(
                          "div",
                          {
                            staticClass:
                              "section-title f-mm js-scroll clip flip upper",
                          },
                          [
                            a("div", { staticClass: "o" }, [
                              a("div", { staticClass: "t" }, [
                                a(
                                  "span",
                                  {
                                    staticClass: "n",
                                    attrs: { "aria-hidden": "true" },
                                  },
                                  [t._v(t._s(t.item.title.index) + ".")]
                                ),
                                t._v(" "),
                                a("span", { staticClass: "h" }, [
                                  t._v(t._s(t.item.title.value)),
                                ]),
                              ]),
                            ]),
                            t._v(" "),
                            a("div", {
                              staticClass: "spr",
                              attrs: { "data-n": "1" },
                            }),
                          ]
                        )
                      : t._e(),
                    t._v(" "),
                    a("div", { staticClass: "in" }, [
                      a(
                        "div",
                        { staticClass: "cols", attrs: { "data-col": "2" } },
                        t._l(t.item.array, function (s) {
                          return a(
                            "div",
                            { staticClass: "col" },
                            [
                              "img" === s.type
                                ? [
                                    a(
                                      "div",
                                      {
                                        staticClass:
                                          "js-gl js-scroll js-ratio-by-w",
                                        attrs: {
                                          "data-layout-type": "cols",
                                          "data-media-type": "img",
                                          "data-w": s.src.r.x,
                                          "data-h": s.src.r.y,
                                          "data-d2x": s.src.d2x,
                                          "data-d1x": s.src.d1x,
                                          "data-mob": s.src.d1x,
                                        },
                                      },
                                      [a("div", { staticClass: "el" })]
                                    ),
                                  ]
                                : "video" === s.type
                                ? [
                                    a(
                                      "div",
                                      {
                                        staticClass:
                                          "js-gl js-scroll js-ratio-by-w",
                                        attrs: {
                                          "data-layout-type": "cols",
                                          "data-media-type": "video",
                                          "data-w": s.r.x,
                                          "data-h": s.r.y,
                                        },
                                      },
                                      [
                                        a("video", {
                                          attrs: {
                                            src: t.envSet.awsBaseUrl + s.src,
                                            crossorigin: "anonymous",
                                            preload: "none",
                                            playsinline: "",
                                            loop: "",
                                            muted: "",
                                          },
                                          domProps: { muted: !0 },
                                        }),
                                      ]
                                    ),
                                  ]
                                : t._e(),
                            ],
                            2
                          );
                        }),
                        0
                      ),
                    ]),
                  ]),
                  t._v(" "),
                  a("div", { staticClass: "spr", attrs: { "data-n": "4" } }),
                ]);
              },
              [],
              !1,
              null,
              null,
              null
            ).exports,
            contentDescription: Object(o.a)(
              j,
              function () {
                var t = this,
                  s = t.$createElement,
                  a = t._self._c || s;
                return a("div", { staticClass: "section section-text" }, [
                  a("div", { staticClass: "body js-scroll dom" }, [
                    a("div", { staticClass: "cols cols-text" }, [
                      a("div", { staticClass: "col" }, [
                        a(
                          "h2",
                          { staticClass: "section-title project-title f-mm" },
                          [
                            a("div", { staticClass: "in" }, [
                              a("span", { staticClass: "p" }, [
                                t._v(t._s(t._f("toUppercase")(t.post.title))),
                              ]),
                            ]),
                          ]
                        ),
                      ]),
                      t._v(" "),
                      a("div", { staticClass: "col mce" }, [
                        a("div", { staticClass: "page-description f-mmm" }, [
                          a("p", [t._v(t._s(t.post.description))]),
                        ]),
                        t._v(" "),
                        a("div", {
                          staticClass: "spr",
                          attrs: { "data-n": "1" },
                        }),
                        t._v(" "),
                        a("div", { staticClass: "cols inf" }, [
                          a("div", { staticClass: "col" }, [
                            t._m(0),
                            t._v(" "),
                            a("p", [t._v(t._s(t.post.year) + " ")]),
                          ]),
                          t._v(" "),
                          a("div", { staticClass: "col" }, [
                            t._m(1),
                            t._v(" "),
                            a("p", [t._v(t._s(t.post.role) + " ")]),
                          ]),
                        ]),
                      ]),
                    ]),
                  ]),
                  t._v(" "),
                  a("div", { staticClass: "spr", attrs: { "data-n": "4" } }),
                ]);
              },
              [
                function () {
                  var t = this.$createElement,
                    s = this._self._c || t;
                  return s("div", { staticClass: "title" }, [
                    s("span", { staticClass: "pivot" }, [this._v("YEAR ")]),
                  ]);
                },
                function () {
                  var t = this.$createElement,
                    s = this._self._c || t;
                  return s("div", { staticClass: "title" }, [
                    s("span", { staticClass: "pivot" }, [this._v("ROLE ")]),
                  ]);
                },
              ],
              !1,
              null,
              null,
              null
            ).exports,
          },
          computed: (function (t) {
            for (var s = 1; s < arguments.length; s++) {
              var a = null != arguments[s] ? arguments[s] : {};
              s % 2
                ? b(Object(a), !0).forEach(function (s) {
                    Object(e.a)(t, s, a[s]);
                  })
                : Object.getOwnPropertyDescriptors
                ? Object.defineProperties(
                    t,
                    Object.getOwnPropertyDescriptors(a)
                  )
                : b(Object(a)).forEach(function (s) {
                    Object.defineProperty(
                      t,
                      s,
                      Object.getOwnPropertyDescriptor(a, s)
                    );
                  });
            }
            return t;
          })({}, Object(i.b)(["projects"])),
          head: function () {
            var t = "Kenta Toshikura | " + this.current.data.post.title,
              s = this.current.data.post.description;
            return {
              title: t,
              meta: [
                { name: "description", content: s },
                { hid: "og:title", property: "og:title", content: t },
                {
                  hid: "og:description",
                  property: "og:description",
                  content: s,
                },
              ],
            };
          },
          mounted: function () {
            __ROUTE__.onMounted("single", this.$store.$device, {
              current: this.current.data.slug,
              prev: this.prev.data.slug,
              next: this.next.data.slug,
            });
          },
          transition: {
            mode: "out-in",
            css: !1,
            leave: function (t, s) {
              __ROUTE__.leave(t, s);
            },
            beforeEnter: function (t) {
              __ROUTE__.beforeEnter(t);
            },
            enter: function (t, s) {
              __ROUTE__.enter(t, s);
            },
            afterEnter: function (t) {
              this.onMouseLeaveUI(), __ROUTE__.afterEnter(t);
            },
          },
        },
        E = Object(o.a)(
          w,
          function () {
            var t = this,
              s = t.$createElement,
              a = t._self._c || s;
            return a(
              "div",
              { staticClass: "site-content", attrs: { "data-name": "single" } },
              [
                a(
                  "div",
                  {
                    staticClass: "page-origin",
                    attrs: { "data-slug": t.current.data.slug },
                  },
                  [
                    a("div", { staticClass: "page-header js-wh" }, [
                      a(
                        "div",
                        {
                          staticClass: "ui-scroll-down js-scroll dom",
                          attrs: {
                            "data-x": "0",
                            "data-y": "1",
                            "data-ui": "curve",
                          },
                          on: {
                            click: t.onScrollDown,
                            mouseenter: t.onMouseEnterUI,
                            mouseleave: t.onMouseLeaveUI,
                          },
                        },
                        [
                          a(
                            "svg",
                            {
                              staticClass: "svg-arrow-curve",
                              attrs: { viewBox: "0 0 50 50" },
                            },
                            [
                              a("path", {
                                staticClass: "path",
                                attrs: {
                                  "data-index": "0",
                                  "clip-path": "url(#curve)",
                                  d: "M50,5H45S28,3,25,25V50.09",
                                },
                              }),
                            ]
                          ),
                        ]
                      ),
                      t._v(" "),
                      a("div", { staticClass: "section" }, [
                        a("div", { staticClass: "body" }, [
                          a("div", { staticClass: "in" }, [
                            a("div", { staticClass: "lead" }, [
                              a("div", { staticClass: "btn-box-hr" }, [
                                a(
                                  "a",
                                  {
                                    staticClass:
                                      "website-a js-scroll dom clip flip",
                                    attrs: {
                                      href: t.current.data.post.url,
                                      "data-layout-type": "border",
                                      target: "_blank",
                                      rel: "noopener",
                                      "data-ui": "curve",
                                    },
                                    on: {
                                      mouseenter: t.onMouseEnterUI,
                                      mouseleave: t.onMouseLeaveUI,
                                    },
                                  },
                                  [
                                    a("span", { staticClass: "icon" }, [
                                      a(
                                        "svg",
                                        {
                                          staticClass: "svg-arrow-curve",
                                          attrs: { viewBox: "0 0 50 50" },
                                        },
                                        [
                                          a("path", {
                                            staticClass: "path",
                                            attrs: {
                                              "data-index": "1",
                                              "clip-path": "url(#curve)",
                                              d: "M50,5H45S28,3,25,25V50.09",
                                            },
                                          }),
                                        ]
                                      ),
                                    ]),
                                    t._v(" "),
                                    t._m(0),
                                  ]
                                ),
                              ]),
                              t._v(" "),
                              a("div", [
                                a(
                                  "div",
                                  { staticClass: "ui-pagging js-scroll dom" },
                                  [
                                    a(
                                      "div",
                                      { staticClass: "ui-pagging-body" },
                                      [
                                        a(
                                          "div",
                                          { staticClass: "ui-pagging-flex" },
                                          [
                                            a(
                                              "a",
                                              {
                                                staticClass:
                                                  "ui-pagging-a ui-pagging-next",
                                                attrs: {
                                                  href:
                                                    "/project/" +
                                                    t.next.data.slug,
                                                  "data-index": t.next.index,
                                                  "data-ui": "pagging",
                                                },
                                                on: {
                                                  click: t.onPaggingRouteToNext,
                                                  mouseenter: t.onMouseEnterUI,
                                                  mouseleave: t.onMouseLeaveUI,
                                                },
                                              },
                                              [
                                                a(
                                                  "div",
                                                  {
                                                    staticClass:
                                                      "arrow arrow-thin",
                                                  },
                                                  [
                                                    a(
                                                      "svg",
                                                      {
                                                        staticClass:
                                                          "svg-arrow-thin",
                                                        attrs: {
                                                          viewBox: "0 0 50 50",
                                                        },
                                                      },
                                                      [
                                                        a("title", [
                                                          t._v("Next Project"),
                                                        ]),
                                                        a("path", {
                                                          staticClass: "path",
                                                          attrs: {
                                                            "data-index": "2",
                                                            "clip-path":
                                                              "url(#arrow-thin)",
                                                            d: "M25.32,0V50",
                                                          },
                                                        }),
                                                      ]
                                                    ),
                                                  ]
                                                ),
                                              ]
                                            ),
                                            t._v(" "),
                                            a(
                                              "a",
                                              {
                                                staticClass:
                                                  "ui-pagging-a ui-pagging-prev",
                                                attrs: {
                                                  href:
                                                    "/project/" +
                                                    t.prev.data.slug,
                                                  "data-index": t.prev.index,
                                                  "data-ui": "pagging",
                                                },
                                                on: {
                                                  click: t.onPaggingRouteToPrev,
                                                  mouseenter: t.onMouseEnterUI,
                                                  mouseleave: t.onMouseLeaveUI,
                                                },
                                              },
                                              [
                                                a(
                                                  "div",
                                                  {
                                                    staticClass:
                                                      "arrow arrow-thin",
                                                  },
                                                  [
                                                    a(
                                                      "svg",
                                                      {
                                                        staticClass:
                                                          "svg-arrow-thin",
                                                        attrs: {
                                                          viewBox: "0 0 50 50",
                                                        },
                                                      },
                                                      [
                                                        a("title", [
                                                          t._v("Prev Project"),
                                                        ]),
                                                        a("path", {
                                                          staticClass: "path",
                                                          attrs: {
                                                            "data-index": "3",
                                                            "clip-path":
                                                              "url(#arrow-thin)",
                                                            d: "M25.32,0V50",
                                                          },
                                                        }),
                                                      ]
                                                    ),
                                                  ]
                                                ),
                                              ]
                                            ),
                                          ]
                                        ),
                                      ]
                                    ),
                                  ]
                                ),
                              ]),
                            ]),
                          ]),
                        ]),
                      ]),
                    ]),
                    t._v(" "),
                    a("div", { staticClass: "page-body" }, [
                      a("div", {
                        staticClass: "spr",
                        attrs: { "data-n": "1" },
                      }),
                      t._v(" "),
                      a(
                        "div",
                        { staticClass: "page-media" },
                        [
                          t._l(t.current.data.content, function (s) {
                            return [
                              "mobile" === s.type
                                ? [a("content-mobile", { attrs: { item: s } })]
                                : "description" === s.type
                                ? [
                                    a("content-description", {
                                      attrs: { post: t.current.data.post },
                                    }),
                                  ]
                                : "video" === s.type
                                ? [a("content-video", { attrs: { item: s } })]
                                : "full" === s.type
                                ? [a("content-full", { attrs: { item: s } })]
                                : "material" === s.type
                                ? [
                                    a("content-material", {
                                      attrs: { item: s },
                                    }),
                                  ]
                                : "img" === s.type
                                ? [a("content-img", { attrs: { item: s } })]
                                : "col" === s.type
                                ? [a("content-col", { attrs: { item: s } })]
                                : t._e(),
                            ];
                          }),
                        ],
                        2
                      ),
                    ]),
                    t._v(" "),
                    a("div", { staticClass: "spr", attrs: { "data-n": "1" } }),
                    t._v(" "),
                    a("div", { staticClass: "page-footer js-wh" }, [
                      a("div", { staticClass: "section" }, [
                        a("div", { staticClass: "projects-wrap" }, [
                          a("div", { staticClass: "in" }, [
                            a(
                              "a",
                              {
                                staticClass: "next-a a js-scroll",
                                attrs: {
                                  href: "/project/" + t.next.data.slug,
                                  "data-ui": "a",
                                  "data-index": t.next.index,
                                },
                                on: {
                                  click: t.onFooterRouteToNext,
                                  mouseenter: t.onMouseEnterUI,
                                  mouseleave: t.onMouseLeaveUI,
                                },
                              },
                              t._l(t.next.data.three.title.array, function (s) {
                                return a("div", [t._v(t._s(s))]);
                              }),
                              0
                            ),
                            t._v(" "),
                            a("div", { staticClass: "btn-box-hr" }, [
                              a(
                                "a",
                                {
                                  staticClass:
                                    "js-scroll page-footer-next-a a js-goto-next-timer clip",
                                  attrs: {
                                    href: "/project/" + t.next.data.slug,
                                    "data-index": t.next.index,
                                    "data-layout-type": "border",
                                  },
                                  on: { click: t.onFooterRouteToNext },
                                },
                                [
                                  a("span", { staticClass: "o icon" }, [
                                    a("span", { staticClass: "t" }, [
                                      a(
                                        "svg",
                                        {
                                          staticClass: "svg-arrow-curve",
                                          attrs: { viewBox: "0 0 50 50" },
                                        },
                                        [
                                          a("path", {
                                            staticClass: "path",
                                            attrs: {
                                              "clip-path": "url(#curve)",
                                              d: "M50,5H45S28,3,25,25V50.09",
                                            },
                                          }),
                                        ]
                                      ),
                                    ]),
                                  ]),
                                  t._v(" "),
                                  t._m(1),
                                ]
                              ),
                            ]),
                          ]),
                        ]),
                      ]),
                    ]),
                  ]
                ),
              ]
            );
          },
          [
            function () {
              var t = this.$createElement,
                s = this._self._c || t;
              return s("span", { staticClass: "o" }, [
                s("span", { staticClass: "t" }, [
                  s("span", { staticClass: "marquee" }, [
                    s("span", { staticClass: "marquee-body" }, [
                      s("span", { staticClass: "f-m" }, [
                        this._v("VISIT WEBSITE"),
                      ]),
                      this._v(" "),
                      s(
                        "span",
                        {
                          staticClass: "f-m",
                          attrs: { "aria-hidden": "true" },
                        },
                        [this._v("VISIT WEBSITE")]
                      ),
                      this._v(" "),
                      s(
                        "span",
                        {
                          staticClass: "f-m",
                          attrs: { "aria-hidden": "true" },
                        },
                        [this._v("VISIT WEBSITE")]
                      ),
                    ]),
                  ]),
                ]),
              ]);
            },
            function () {
              var t = this.$createElement,
                s = this._self._c || t;
              return s("span", { staticClass: "o" }, [
                s("span", { staticClass: "t" }, [this._v(" NEXT ")]),
              ]);
            },
          ],
          !1,
          null,
          null,
          null
        );
      s.default = E.exports;
    },
  },
]);
