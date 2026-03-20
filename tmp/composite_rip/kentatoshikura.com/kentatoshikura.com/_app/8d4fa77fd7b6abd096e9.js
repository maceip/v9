(window.webpackJsonp = window.webpackJsonp || []).push([
  [3],
  {
    272: function (t, s, e) {
      "use strict";
      e.r(s);
      e(63), e(23), e(12), e(8), e(19);
      var a = e(2),
        i = e(41);
      function l(t, s) {
        var e = Object.keys(t);
        if (Object.getOwnPropertySymbols) {
          var a = Object.getOwnPropertySymbols(t);
          s &&
            (a = a.filter(function (s) {
              return Object.getOwnPropertyDescriptor(t, s).enumerable;
            })),
            e.push.apply(e, a);
        }
        return e;
      }
      var r = {
          data: function () {
            return {
              recent: [
                {
                  title: "Seiste",
                  role: "Design, Code",
                  url: "https://seiste.com/",
                },
                {
                  title: "ARC’TERYX SHINJUKU",
                  role: "Code",
                  url: "https://shinjuku.arcteryx.jp/",
                },
                {
                  title: "RAMEN CLUB",
                  role: "Code",
                  url: "https://ramenclub.jp/",
                },
                {
                  title: "CICATA",
                  role: "Design, Code",
                  url: "https://cicata.jp/",
                },
                {
                  title: "Digital Garage Tech Career",
                  role: "Code",
                  url: "https://tech.garage.co.jp/",
                },
                {
                  title: "aircord",
                  role: "Design, Code",
                  url: "http://aircord.co.jp/",
                },
                {
                  title: "Yuen Ye v.3",
                  role: "Code",
                  url: "https://yuenye.com/",
                },
                {
                  title: "THE ONE",
                  role: "Design, Code",
                  url: "https://the-one.co.jp/",
                },
                {
                  title: "Plantica",
                  role: "Code",
                  url: "https://plantica.net/",
                },
                {
                  title: "Roaster",
                  role: "Code",
                  url: "https://roaster.co.jp/",
                },
                {
                  title: "moiq",
                  role: "Design, Code",
                  url: "https://moiq.capital/?light",
                },
                {
                  title: "eterble",
                  role: "Code",
                  url: "https://eterble.com/en/",
                },
                {
                  title: "601",
                  role: "Design, Code",
                  url: "https://www.rokumaruichi.tokyo/",
                },
                {
                  title: "Covert AI",
                  role: "Design, Code",
                  url: "https://www.covert.jp/",
                },
                {
                  title: "UNITE DIVISION OF ME",
                  role: "Code",
                  url: "https://unite-divisionofme.com/",
                },
                {
                  title: "Aethra",
                  role: "Design, Code",
                  url: "https://aethra.xyz/",
                },
                {
                  title: "The Park",
                  role: "Code",
                  url: "https://theparksm.com/",
                },
                {
                  title: "The Shift",
                  role: "Design, Code",
                  url: "http://theshift.tokyo/",
                },
                {
                  title: "Yagi laboratory",
                  role: "Design, Code",
                  url: "https://www.yagi.iis.u-tokyo.ac.jp/en/",
                },
                {
                  title: "UTOPIA AGRICULTURE",
                  role: "Code",
                  url: "http://utopiaagriculture.com/",
                },
                {
                  title: "Identity",
                  role: "Design, Code",
                  url: "http://identity.city/",
                },
                {
                  title: "TSUBAKI fm",
                  role: "Design, Code",
                  url: "http://tsubakifm.com/",
                },
                {
                  title: "DDD HOTEL",
                  role: "Code",
                  url: "https://dddhotel.jp/",
                },
                {
                  title: "Stone and Style",
                  role: "Design, Code",
                  url: "https://stonestyle.co.th/",
                },
                {
                  title: "MAXILLA",
                  role: "Design, Code",
                  url: "https://maxilla.jp/",
                },
              ],
              awards: [
                {
                  title: "AWWWARDS",
                  content: "SOTMx1, SOTDx18, DOTDx12, MWx5",
                },
                { title: "FWA", content: "FOTDx13" },
                { title: "CSSDA", content: "WOTMx2, WOTDx15" },
                {
                  title: "Communication Arts",
                  content: "2025 INTERACTIVE ANNUAL, WEBPICKSx5",
                },
              ],
            };
          },
          components: {},
          computed: (function (t) {
            for (var s = 1; s < arguments.length; s++) {
              var e = null != arguments[s] ? arguments[s] : {};
              s % 2
                ? l(Object(e), !0).forEach(function (s) {
                    Object(a.a)(t, s, e[s]);
                  })
                : Object.getOwnPropertyDescriptors
                ? Object.defineProperties(
                    t,
                    Object.getOwnPropertyDescriptors(e)
                  )
                : l(Object(e)).forEach(function (s) {
                    Object.defineProperty(
                      t,
                      s,
                      Object.getOwnPropertyDescriptor(e, s)
                    );
                  });
            }
            return t;
          })({}, Object(i.b)(["projects"])),
          head: function () {
            var t = "Kenta Toshikura | About",
              s = "Lead web designer and front-end developer at Garden Eight.";
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
            __ROUTE__.onMounted("about", this.$store.$device, {
              current: "about",
              prev: null,
              next: null,
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
        n = e(34),
        o = Object(n.a)(
          r,
          function () {
            var t = this,
              s = t.$createElement,
              e = t._self._c || s;
            return e(
              "div",
              { staticClass: "site-content", attrs: { "data-name": "about" } },
              [
                e(
                  "div",
                  {
                    staticClass: "page-origin",
                    attrs: { "data-slug": "about" },
                  },
                  [
                    e("div", { staticClass: "page-header js-wh" }, [
                      e(
                        "div",
                        {
                          staticClass: "ui-scroll-down js-scroll",
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
                          e(
                            "svg",
                            {
                              staticClass: "svg-arrow-curve",
                              attrs: { viewBox: "0 0 50 50" },
                            },
                            [
                              e("path", {
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
                      t._m(0),
                    ]),
                    t._v(" "),
                    e("div", { staticClass: "page-body" }, [
                      t._m(1),
                      t._v(" "),
                      e("div", {
                        staticClass: "spr",
                        attrs: { "data-n": "4" },
                      }),
                      t._v(" "),
                      e("section", { staticClass: "section section-text" }, [
                        e("div", { staticClass: "body" }, [
                          e("div", { staticClass: "cols cols-text" }, [
                            t._m(2),
                            t._v(" "),
                            e("div", { staticClass: "col mce" }, [
                              e(
                                "ul",
                                { staticClass: "award-ul f-mm js-scroll" },
                                t._l(t.awards, function (s) {
                                  return e("li", [
                                    e("span", { staticClass: "name upper" }, [
                                      t._v(t._s(s.title)),
                                    ]),
                                    t._v(" "),
                                    e("span", { staticClass: "prize" }, [
                                      t._v(t._s(s.content)),
                                    ]),
                                  ]);
                                }),
                                0
                              ),
                            ]),
                          ]),
                        ]),
                      ]),
                      t._v(" "),
                      e("div", {
                        staticClass: "spr",
                        attrs: { "data-n": "4" },
                      }),
                      t._v(" "),
                      e("section", { staticClass: "section section-text" }, [
                        e("div", { staticClass: "body" }, [
                          e("div", { staticClass: "cols cols-text" }, [
                            t._m(3),
                            t._v(" "),
                            e("div", { staticClass: "col mce" }, [
                              e("div", { staticClass: "js-scroll" }, [
                                e("ul", { staticClass: "contact-ul f-mm" }, [
                                  e("li", [
                                    e(
                                      "a",
                                      {
                                        attrs: {
                                          "data-ui": "a",
                                          href: "https://twitter.com/silkhat_7",
                                          target: "_blank",
                                          rel: "noopener",
                                        },
                                        on: {
                                          mouseenter: t.onMouseEnterUI,
                                          mouseleave: t.onMouseLeaveUI,
                                        },
                                      },
                                      [
                                        e(
                                          "span",
                                          { staticClass: "name upper" },
                                          [t._v("Twitter - ")]
                                        ),
                                        e(
                                          "span",
                                          { staticClass: "underline" },
                                          [t._v("@silkhat7")]
                                        ),
                                      ]
                                    ),
                                  ]),
                                  t._v(" "),
                                  e("li", [
                                    e(
                                      "a",
                                      {
                                        attrs: {
                                          "data-ui": "a",
                                          href: "https://www.instagram.com/kenta_toshikura/",
                                          target: "_blank",
                                          rel: "noopener",
                                        },
                                        on: {
                                          mouseenter: t.onMouseEnterUI,
                                          mouseleave: t.onMouseLeaveUI,
                                        },
                                      },
                                      [
                                        e(
                                          "span",
                                          { staticClass: "name upper" },
                                          [t._v("instagram - ")]
                                        ),
                                        e(
                                          "span",
                                          { staticClass: "underline" },
                                          [t._v("@kenta_toshikura")]
                                        ),
                                      ]
                                    ),
                                  ]),
                                  t._v(" "),
                                  e("li", [
                                    e(
                                      "a",
                                      {
                                        attrs: {
                                          "data-ui": "a",
                                          href: "https://www.facebook.com/kenta.toshikura",
                                          target: "_blank",
                                          rel: "noopener",
                                        },
                                        on: {
                                          mouseenter: t.onMouseEnterUI,
                                          mouseleave: t.onMouseLeaveUI,
                                        },
                                      },
                                      [
                                        e(
                                          "span",
                                          { staticClass: "name upper" },
                                          [t._v("Facebook - ")]
                                        ),
                                        e(
                                          "span",
                                          { staticClass: "underline" },
                                          [t._v("kenta.toshikura")]
                                        ),
                                      ]
                                    ),
                                  ]),
                                  t._v(" "),
                                  e(
                                    "li",
                                    {
                                      attrs: { "data-ui": "a" },
                                      on: {
                                        mouseenter: t.onMouseEnterUI,
                                        mouseleave: t.onMouseLeaveUI,
                                      },
                                    },
                                    [t._m(4), t._v(" "), t._m(5)]
                                  ),
                                ]),
                              ]),
                            ]),
                          ]),
                        ]),
                      ]),
                      t._v(" "),
                      e("div", {
                        staticClass: "spr",
                        attrs: { "data-n": "4" },
                      }),
                      t._v(" "),
                      e("section", { staticClass: "section section-text" }, [
                        e("div", { staticClass: "body" }, [
                          e("div", { staticClass: "cols cols-text" }, [
                            t._m(6),
                            t._v(" "),
                            e("div", { staticClass: "col mce" }, [
                              e(
                                "div",
                                { staticClass: "table f-mm js-scroll" },
                                [
                                  t._m(7),
                                  t._v(" "),
                                  e(
                                    "div",
                                    { staticClass: "tbody" },
                                    t._l(t.recent, function (s) {
                                      return e(
                                        "a",
                                        {
                                          staticClass: "recent-a tr",
                                          attrs: {
                                            "data-ui": "a",
                                            href: s.url,
                                            target: "_blank",
                                            rel: "noopener",
                                          },
                                          on: {
                                            mouseenter: t.onMouseEnterUI,
                                            mouseleave: t.onMouseLeaveUI,
                                          },
                                        },
                                        [
                                          e("div", { staticClass: "th" }, [
                                            e(
                                              "span",
                                              { staticClass: "underline" },
                                              [t._v(t._s(s.title))]
                                            ),
                                          ]),
                                          t._v(" "),
                                          e("div", { staticClass: "td" }, [
                                            t._v(t._s(s.role)),
                                          ]),
                                        ]
                                      );
                                    }),
                                    0
                                  ),
                                ]
                              ),
                            ]),
                          ]),
                        ]),
                      ]),
                      t._v(" "),
                      e("div", {
                        staticClass: "spr",
                        attrs: { "data-n": "4" },
                      }),
                      t._v(" "),
                      e("section", { staticClass: "section section-text" }, [
                        e("div", { staticClass: "body" }, [
                          e("div", { staticClass: "cols cols-text" }, [
                            t._m(8),
                            t._v(" "),
                            e("div", { staticClass: "col mce" }, [
                              e(
                                "div",
                                { staticClass: "table f-mm js-scroll" },
                                [
                                  e("div", { staticClass: "tbody" }, [
                                    e(
                                      "a",
                                      {
                                        staticClass: "recent-a tr",
                                        attrs: {
                                          "data-ui": "a",
                                          href: "https://v1.kentatoshikura.com/",
                                          target: "_blank",
                                          rel: "noopener",
                                        },
                                        on: {
                                          mouseenter: t.onMouseEnterUI,
                                          mouseleave: t.onMouseLeaveUI,
                                        },
                                      },
                                      [t._m(9)]
                                    ),
                                  ]),
                                ]
                              ),
                            ]),
                          ]),
                        ]),
                      ]),
                      t._v(" "),
                      e("div", {
                        staticClass: "spr",
                        attrs: { "data-n": "6" },
                      }),
                    ]),
                  ]
                ),
                t._v(" "),
                t._m(10),
              ]
            );
          },
          [
            function () {
              var t = this.$createElement,
                s = this._self._c || t;
              return s("div", { staticClass: "section" }, [
                s("div", { staticClass: "body" }, [
                  s("div", { staticClass: "in" }, [
                    s("div", { staticClass: "lead" }, [
                      s(
                        "h2",
                        {
                          staticClass: "section-title f-mm js-scroll clip flip",
                        },
                        [
                          s("div", { staticClass: "o" }, [
                            s("div", { staticClass: "t" }, [
                              s(
                                "span",
                                {
                                  staticClass: "n",
                                  attrs: { "aria-hidden": "true" },
                                },
                                [this._v("1.")]
                              ),
                              this._v(" "),
                              s("span", { staticClass: "h" }, [
                                this._v("PROFILE"),
                              ]),
                            ]),
                          ]),
                        ]
                      ),
                    ]),
                  ]),
                ]),
              ]);
            },
            function () {
              var t = this.$createElement,
                s = this._self._c || t;
              return s("div", { staticClass: "section" }, [
                s("div", { staticClass: "body" }, [
                  s("div", { staticClass: "in" }, [
                    s(
                      "div",
                      { staticClass: "headline f-xxl upper js-scroll" },
                      [
                        s("div", { staticClass: "headline-body" }, [
                          this._v(
                            "Lead web designer and front-end developer at garden eight."
                          ),
                        ]),
                      ]
                    ),
                  ]),
                ]),
              ]);
            },
            function () {
              var t = this.$createElement,
                s = this._self._c || t;
              return s("div", { staticClass: "col" }, [
                s(
                  "h3",
                  { staticClass: "section-title f-mm js-scroll slip flip" },
                  [
                    s("div", { staticClass: "o" }, [
                      s("div", { staticClass: "t" }, [
                        s(
                          "span",
                          {
                            staticClass: "n",
                            attrs: { "aria-hidden": "true" },
                          },
                          [this._v("2.")]
                        ),
                        this._v(" "),
                        s("span", { staticClass: "h" }, [this._v("AWARDS")]),
                      ]),
                    ]),
                  ]
                ),
              ]);
            },
            function () {
              var t = this.$createElement,
                s = this._self._c || t;
              return s("div", { staticClass: "col" }, [
                s(
                  "h3",
                  { staticClass: "section-title f-mm js-scroll clip flip" },
                  [
                    s("div", { staticClass: "o" }, [
                      s("div", { staticClass: "t" }, [
                        s(
                          "span",
                          {
                            staticClass: "n",
                            attrs: { "aria-hidden": "true" },
                          },
                          [this._v("3.")]
                        ),
                        this._v(" "),
                        s("span", { staticClass: "h" }, [this._v("CONTACT")]),
                      ]),
                    ]),
                  ]
                ),
              ]);
            },
            function () {
              var t = this.$createElement,
                s = this._self._c || t;
              return s(
                "a",
                {
                  attrs: {
                    href: "&#109;&#97;&#105;&#108;&#116;&#111;&#58;&#104;&#101;&#108;&#108;&#111;&#64;&#107;&#101;&#110;&#116;&#97;&#116;&#111;&#115;&#104;&#105;&#107;&#117;&#114;&#97;&#46;&#99;&#111;&#109;",
                  },
                },
                [
                  s("span", { staticClass: "name upper" }, [
                    this._v("Mail - "),
                  ]),
                  s("span", { staticClass: "underline" }, [
                    this._v("hello@kentatoshikura.com*"),
                  ]),
                ]
              );
            },
            function () {
              var t = this.$createElement,
                s = this._self._c || t;
              return s("p", { staticClass: "sub f-s" }, [
                s(
                  "a",
                  {
                    attrs: {
                      href: "&#109;&#97;&#105;&#108;&#116;&#111;&#58;&#104;&#101;&#108;&#108;&#111;&#64;&#103;&#97;&#114;&#100;&#101;&#110;&#45;&#101;&#105;&#103;&#104;&#116;&#46;&#99;&#111;&#109;",
                    },
                  },
                  [
                    this._v(
                      "*Currently not available for freelance projects. Contact my company "
                    ),
                    s("span", { staticClass: "underline" }, [
                      this._v("hello@garden-eight.com"),
                    ]),
                  ]
                ),
              ]);
            },
            function () {
              var t = this.$createElement,
                s = this._self._c || t;
              return s("div", { staticClass: "col" }, [
                s(
                  "h3",
                  { staticClass: "section-title f-mm js-scroll clip flip" },
                  [
                    s("div", { staticClass: "o" }, [
                      s("div", { staticClass: "t" }, [
                        s(
                          "span",
                          {
                            staticClass: "n",
                            attrs: { "aria-hidden": "true" },
                          },
                          [this._v("4.")]
                        ),
                        this._v(" "),
                        s("span", { staticClass: "h" }, [
                          this._v("RECENT WORKS"),
                        ]),
                      ]),
                    ]),
                  ]
                ),
              ]);
            },
            function () {
              var t = this.$createElement,
                s = this._self._c || t;
              return s("div", { staticClass: "thead" }, [
                s("div", { staticClass: "tr" }, [
                  s("div", { staticClass: "th" }, [this._v("Name")]),
                  this._v(" "),
                  s("div", { staticClass: "td" }, [this._v("Role")]),
                ]),
              ]);
            },
            function () {
              var t = this.$createElement,
                s = this._self._c || t;
              return s("div", { staticClass: "col" }, [
                s(
                  "h3",
                  { staticClass: "section-title f-mm js-scroll clip flip" },
                  [
                    s("div", { staticClass: "o" }, [
                      s("div", { staticClass: "t" }, [
                        s(
                          "span",
                          {
                            staticClass: "n",
                            attrs: { "aria-hidden": "true" },
                          },
                          [this._v("5.")]
                        ),
                        this._v(" "),
                        s("span", { staticClass: "h" }, [this._v("ARCHIVE")]),
                      ]),
                    ]),
                  ]
                ),
              ]);
            },
            function () {
              var t = this.$createElement,
                s = this._self._c || t;
              return s("div", { staticClass: "th" }, [
                s("span", { staticClass: "underline" }, [
                  this._v("Folio - 2018"),
                ]),
              ]);
            },
            function () {
              var t = this,
                s = t.$createElement,
                e = t._self._c || s;
              return e("div", { staticClass: "auto-jump f-xs" }, [
                e("div", { staticClass: "auto-jump-body" }, [
                  e(
                    "div",
                    {
                      staticClass: "auto-jump-n",
                      attrs: { "aria-hidden": "true" },
                    },
                    [
                      e("div", [t._v("5")]),
                      t._v(" "),
                      e("div", [t._v("4")]),
                      t._v(" "),
                      e("div", [t._v("3")]),
                      t._v(" "),
                      e("div", [t._v("2")]),
                      t._v(" "),
                      e("div", [t._v("1")]),
                    ]
                  ),
                ]),
              ]);
            },
          ],
          !1,
          null,
          null,
          null
        );
      s.default = o.exports;
    },
  },
]);
