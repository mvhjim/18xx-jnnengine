/*!
 * 18xx-JNNengine — a JNN game window for 18xx.games
 * Copyright (C) 2026 jimiste
 * https://github.com/mvhjim/18xx-jnnengine
 *
 * This program is free software: you can redistribute it and/or modify it under the terms of
 * the GNU General Public License as published by the Free Software Foundation, either version 3
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details: <https://www.gnu.org/licenses/>.
 *
 * Runs on an 18xx.games game page (started from a bookmark) and opens its own window.
 * It contains no game logic of its own: it loads the released 18xx-JNNstats code (JNN-API)
 * and the site's own rules engine. Moves are tried on a copy of the game first and sent to
 * 18xx.games only when sending is switched on, it is your move, and you confirm.
 */
(function () {
  'use strict';
  var VERSION = '0.5.0';
  var API_MAJOR = '1';                 // the JNN-API major version this code is written for
  var API_MIN = '1.1';                 // the oldest minor version it can use
  var FALLBACK_SHA = 'bfabede';        // a JNN-stats release known to work, used if the latest is incompatible
  var STATS_CDN = 'https://cdn.jsdelivr.net/gh/mvhjim/18xx-jnnstats@';
  var REFRESH_MS = 60000;              // backup check only; new moves arrive through the site's own push channel
  // Titles tested with JNN-Engine. Others are shown, but sending moves (in later versions) stays off.
  var SUPPORTED = ['1817', '1846', '1862', 'The Old Prince 1871', '1849: Kingdom of the Two Sicilies'];

  var E = window.__jnnEngine = window.__jnnEngine || {};
  if (E.timer) clearInterval(E.timer);
  var w = window.__jnnEngineTarget || E.win; window.__jnnEngineTarget = null;
  var m = /\/game\/(\d+)/.exec(location.pathname), gid = m && m[1];
  if (!gid || typeof Opal === 'undefined' || !Opal.Engine) { alert('JNN-Engine: open a game on 18xx.games first, then click the bookmark.'); return; }
  if (!w || w.closed) { alert('JNN-Engine: the window was blocked. Allow pop-ups for 18xx.games and click the bookmark again.'); return; }
  E.win = w; E.gid = gid;

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src;
      s.onload = res; s.onerror = function () { rej(new Error('could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function apiOk(v) { if (!v) return false; var p = String(v).split('.'), q = API_MIN.split('.'); return p[0] === API_MAJOR && (+p[1] || 0) >= (+q[1] || 0); }
  function status(msg) { try { w.document.body.innerHTML = '<p style="font:15px system-ui;padding:24px">' + esc(msg) + '</p>'; } catch (e) {} }

  // 1. Which JNN-stats release to use: the latest, if its API fits; otherwise the known-good one
  function pickStats() {
    if (E.statsSha) return Promise.resolve(E.statsSha);
    if (window.__jnnStatsShaOverride && /^[0-9a-f]{7,40}$/.test(window.__jnnStatsShaOverride)) return Promise.resolve(E.statsSha = window.__jnnStatsShaOverride);
    return loadScript(STATS_CDN + 'main/version.js?t=' + Date.now()).then(function () {
      E.statsLatest = window.__xxLatest; E.statsApi = window.__xxApi;
      var fits = apiOk(window.__xxApi) && !!window.__xxSha;
      E.statsSha = fits ? window.__xxSha : FALLBACK_SHA;
      E.pinned = !fits;
      return E.statsSha;
    }, function () { E.pinned = true; return (E.statsSha = FALLBACK_SHA); });
  }
  // 2. Load it as a library (its own state; a JNN-stats window on this page is not touched)
  function loadStats(sha) {
    if (E.J && E.J.__sha === sha) return Promise.resolve(E.J);
    return new Promise(function (res, rej) {
      var done = function (ev) { window.removeEventListener('jnnstats:ready', done); var J = ev.detail; J.__sha = sha; E.J = J; res(J); };
      window.addEventListener('jnnstats:ready', done);
      window.__jnnLibrary = true;
      loadScript(STATS_CDN + sha + '/stats.js').then(function () { window.__jnnLibrary = false; }, function (e) { window.__jnnLibrary = false; window.removeEventListener('jnnstats:ready', done); rej(e); });
    }).then(function (J) {
      if (!apiOk(J.apiVersion)) throw new Error('JNN-stats ' + J.version + ' has API ' + J.apiVersion + '; JNN-Engine ' + VERSION + ' needs ' + API_MAJOR + '.x (at least ' + API_MIN + ')');
      return J;
    });
  }
  // 3. Load and replay the game, then keep it up to date
  function load(J) {
    if (E.fixed) { // test preview of an earlier position: fetched once, never sends
      if (E.game && E.game.fixed === E.fixed) return Promise.resolve();
      var fx = E.fixed;
      return J.fetchGameText(fx.id).then(function (text) {
        var raw = JSON.parse(text); return J.ensureTitle(raw.title).then(function () {
          raw.actions = raw.actions.slice(0, fx.n); raw.status = 'active'; delete raw.result; var t2 = JSON.stringify(raw);
          E.game = { g: J.loadGame(t2), raw: raw, fixed: fx };
        });
      });
    }
    return J.fetchGameText(gid).then(function (text) {
      var raw = JSON.parse(text); if (!raw.actions) throw new Error('game ' + gid + ' not found');
      return J.ensureTitle(raw.title).then(function () {
        if (E.game && E.game.raw.actions.length && raw.actions.length > E.game.raw.actions.length && raw.actions[E.game.raw.actions.length - 1].id === E.game.raw.actions[E.game.raw.actions.length - 1].id) {
          if (J.applyActions(E.game.g, raw.actions.slice(E.game.raw.actions.length))) { E.game.raw = raw; return; }
        }
        if (!E.game || E.game.raw.actions.length !== raw.actions.length) E.game = { g: J.loadGame(text), raw: raw };
        else E.game.raw = raw;
      });
    });
  }

  // ---------- Moves (J3) -----------------------------------------------------------------------
  // Every choice is asked from the site's own rules engine, the same way the 18xx.games page does,
  // then tried on a copy of the game before anything is sent.
  function nil(o) { return o == null || o === Opal.nil; }
  function truthy(o) { return !(o == null || o === false || o === Opal.nil); } // Ruby truth: only nil and false are false
  function os(o) { return nil(o) ? '' : String(o); }
  // Opal defines a stub for every method name on every object, so ask the object itself (respond_to?)
  function has(o, m) { if (nil(o)) return false; try { if (typeof o['$respond_to?'] === 'function') return !!o['$respond_to?'](m); } catch (e) {} return typeof o['$' + m] === 'function'; }
  function call(o, m) { var a = Array.prototype.slice.call(arguments, 2); if (!has(o, m)) return null; try { var r = o['$' + m].apply(o, a); return nil(r) ? null : r; } catch (e) { return null; } }
  function arr(o) { if (nil(o)) return []; if (Array.isArray(o)) return o; if (has(o, 'to_a')) return o.$to_a(); return []; }
  function num(o) { var v = nil(o) ? null : Number(o); return v == null || isNaN(v) ? null : v; }
  function hget(h, k) { if (nil(h)) return null; try { var v = h['$[]'](k); if (nil(v) && Opal.Symbol) v = null; return nil(v) ? null : v; } catch (e) { return null; } }
  var SENDABLE = ['pass', 'bid', 'par', 'buy_shares', 'sell_shares', 'dividend', 'buy_train', 'take_loan', 'payoff_loan', 'short', 'convert', 'merge', 'choose', 'assign', 'remove_token', 'discard_train'];
  // the options for one entity in the current step; each is { group, label, h: action JSON (without id), amount?: {min, max, key} }
  function moveOptions(g, entity, acts) {
    var out = [], round = g.$round(), active = round.$active_step(), step = active, id = os(call(entity, 'id')), etype = truthy(call(entity, 'player?')) ? 'player' : truthy(call(entity, 'corporation?')) ? 'corporation' : truthy(call(entity, 'minor?')) ? 'minor' : call(entity, 'company?') ? 'company' : 'player';
    var base = function (type) { return { type: type, entity: isNaN(+id) ? id : +id, entity_type: etype }; };
    var money = function (v) { try { return os(g.$format_currency(v)); } catch (e) { return String(v); } };
    var add = function (group, label, h, amount) { out.push({ group: group, label: label, h: h, amount: amount || null }); };
    var mk = function (cls, opts) { var A = Opal.Engine.Action[cls]; if (!A) return null; var h = A.$new(entity, Opal.hash(opts || {})).$to_h().$to_n(); delete h.id; delete h.created_at; delete h.user; return h; };
    var nm = function (o) { return os(call(o, 'name')) || os(call(o, 'id')); };
    var can = function (a) { if (acts.indexOf(a) < 0) return false; var st = null; try { st = round.$step_for(entity, a); } catch (e) {} step = nil(st) ? active : st; return true; };
    if (can('pass')) add('Pass', 'Pass', base('pass'));
    if (can('buy_shares')) {
      g.$corporations().forEach(function (c) {
        // like the site: shares are offered only for companies that have been started (a new company is started with "Start a company")
        if (!truthy(call(c, 'ipoed')) && !truthy(call(c, 'floated?'))) return;
        var cn = os(c.$name()), seen = {};
        var tryShare = function (sh, src) {
          if (nil(sh)) return; var b = sh.$to_bundle(), pct = num(b.$percent()), key = src + pct;
          if (seen[key]) return;
          try { if (!truthy(step['$can_buy?'](entity, b))) return; } catch (e) { return; }
          seen[key] = 1;
          var h = base('buy_shares'); h.shares = [os(sh.$id())]; h.percent = pct; h.share_price = num(call(b, 'share_price')) || undefined;
          add('Buy shares', 'Buy ' + pct + '% of ' + cn + ' from the ' + src + ' (' + money(b.$price()) + ')', h);
        };
        try { arr(c.$ipo_shares()).filter(function (s) { return call(s, 'buyable') !== false; }).forEach(function (s) { tryShare(s, os(g.$ipo_name(c)) || 'IPO'); }); } catch (e) {}
        try { arr(g.$share_pool().$shares_by_corporation()['$[]'](c)).forEach(function (s) { tryShare(s, 'market'); }); } catch (e) {}
        try { if (!truthy(call(c, 'ipo_is_treasury?'))) arr(call(c, 'treasury_shares')).filter(function (s) { return call(s, 'buyable') !== false; }).forEach(function (s) { tryShare(s, 'treasury'); }); } catch (e) {}
      });
      // buying for someone else (The Old Prince 1871: for the Union Bank, with your own money)
      if (etype === 'player' && has(step, 'can_buy_for')) {
        try {
          arr(step.$can_buy_for(entity)).forEach(function (tgt) {
            var tn = nm(tgt), seen2 = {};
            g.$corporations().forEach(function (c) {
              if (!truthy(call(c, 'ipoed')) && !truthy(call(c, 'floated?'))) return;
              var srcs = [[arr(c.$ipo_shares()), os(g.$ipo_name(c)) || 'IPO'], [arr(g.$share_pool().$shares_by_corporation()['$[]'](c)), 'market'], [truthy(call(c, 'ipo_is_treasury?')) ? [] : arr(call(c, 'treasury_shares')), 'treasury']];
              srcs.forEach(function (sx) {
                sx[0].forEach(function (sh) {
                  if (call(sh, 'buyable') === false) return; var b = sh.$to_bundle(), pct = num(b.$percent()), k3 = os(c.$name()) + sx[1] + pct; if (seen2[k3]) return;
                  try { if (!truthy(step['$can_buy?'](tgt, b, Opal.hash({ borrow_from: entity })))) return; } catch (e) { return; }
                  seen2[k3] = 1;
                  var hb = mk('BuyShares', { shares: sh, percent: pct, purchase_for: tgt, borrow_from: entity });
                  add('Buy for ' + tn, 'Buy ' + pct + '% of ' + os(c.$name()) + ' for ' + tn + ' from the ' + sx[1] + ' (' + money(b.$price()) + ', your money)', hb);
                });
              });
            });
          });
        } catch (e) {}
      }
      // a private company exchanged for a share
      if (etype === 'company') {
        try {
          var ab = g.$abilities(entity, 'exchange');
          if (!nil(ab)) {
            var from = arr(call(ab, 'from')).map(os), own = call(entity, 'owner'), exs = {};
            var tryEx = function (sh, src) { if (!sh || nil(sh)) return; try { if (!has(step, 'can_gain?') || !truthy(step['$can_gain?'](own, sh, Opal.hash({ exchange: true })))) return; } catch (e) { return; }
              var hh = mk('BuyShares', { shares: sh }); var k2 = os(sh.$corporation().$name()) + src; if (exs[k2]) return; exs[k2] = 1;
              add('Use ' + nm(entity), 'Exchange ' + nm(entity) + ' for a ' + os(sh.$corporation().$name()) + ' ' + src + ' share', hh); };
            arr(g.$exchange_corporations(ab)).forEach(function (c) {
              var ss = arr(c.$shares());
              if (from.indexOf('ipo') >= 0) tryEx(ss.filter(function (x) { return !truthy(call(x, 'president')); })[0], os(g.$ipo_name(c)) || 'IPO');
              if (from.indexOf('market') >= 0) tryEx(arr(g.$share_pool().$shares_by_corporation()['$[]'](c))[0], 'market');
              if (from.indexOf('reserved') >= 0) tryEx(arr(call(c, 'reserved_shares'))[0], 'reserved');
            });
          }
        } catch (e) {}
      }
      // a company buying back (redeeming) its own shares
      if (etype === 'corporation' && has(step, 'redeemable_shares')) {
        try { arr(step.$redeemable_shares(entity)).forEach(function (b) { var h = base('buy_shares'); h.shares = arr(b.$shares()).map(function (x) { return os(x.$id()); }); h.percent = num(b.$percent()); add('Buy back shares', 'Buy back ' + h.percent + '% (' + money(b.$price()) + ')', h); }); } catch (e) {}
      }
    }
    if (can('sell_shares') && etype === 'corporation' && has(step, 'issuable_shares')) {
      // a company issuing its own shares
      try { arr(step.$issuable_shares(entity)).forEach(function (b) { var h = base('sell_shares'); h.shares = arr(b.$shares()).map(function (x) { return os(x.$id()); }); h.percent = num(b.$percent()); var sp = num(call(b, 'share_price')); if (sp != null) h.share_price = sp; add('Issue shares', 'Issue ' + h.percent + '% (' + money(b.$price()) + ')', h); }); } catch (e) {}
    } else if (can('sell_shares')) {
      g.$corporations().forEach(function (c) {
        var bundles = []; try { bundles = arr(has(step, 'sellable_bundles') ? step.$sellable_bundles(entity, c) : g.$sellable_bundles(entity, c)); } catch (e) {}
        bundles.forEach(function (b) {
          var h = base('sell_shares'); h.shares = arr(b.$shares()).map(function (s) { return os(s.$id()); }); h.percent = num(b.$percent()); var sp = num(call(b, 'share_price')); if (sp != null) h.share_price = sp;
          add('Sell shares', 'Sell ' + h.percent + '% of ' + os(c.$name()) + ' (' + money(b.$price()) + ')', h);
        });
      });
    }
    if (can('par')) {
      g.$corporations().forEach(function (c) {
        try { if (!truthy(g['$can_par?'](c, entity))) return; } catch (e) { return; }
        var prices = []; try { prices = arr(step.$get_par_prices(entity, c)); } catch (e) {}
        prices.forEach(function (sp) { var h = base('par'); h.corporation = os(c.$id()); h.share_price = os(sp.$id()); add('Start a company', 'Start ' + os(c.$name()) + ' at ' + money(sp.$price()), h); });
      });
    }
    if (can('dividend')) {
      var opts = null; try { opts = step.$dividend_options(entity); } catch (e) {}
      var types = []; try { types = arr(step.$dividend_types()).map(os); } catch (e) {}
      types.filter(function (t) { return t !== 'variable'; }).forEach(function (t) {
        var o = opts ? hget(opts, t) || hget(opts, Opal.Symbol ? t : t) : null, per = o ? num(hget(o, 'per_share')) : null;
        var h = base('dividend'); h.kind = t;
        add('Pay out or withhold', ({ payout: 'Pay out', withhold: 'Withhold', half: 'Pay half' }[t] || t) + (per != null && t !== 'withhold' ? ' (' + money(per) + ' per share)' : ''), h);
      });
    }
    if (can('buy_train')) {
      var trains = []; try { trains = arr(step.$buyable_trains(entity)); } catch (e) {}
      var depot = g.$depot(), seenT = {};
      trains.forEach(function (t) {
        var owner = call(t, 'owner'), fromDepot = owner === depot || (owner && os(call(owner, 'name')) === 'The Depot');
        if (fromDepot) {
          var allowed = []; try { allowed = arr(step.$buyable_train_variants(t, entity)); } catch (e) {}
          var vs = call(t, 'variants'); (vs ? vs.$keys() : []).forEach(function (vn) {
            var v = vs['$[]'](vn); if (allowed.length && allowed.indexOf(v) < 0) return;
            var price = num(hget(v, 'price')), key = 'd' + os(vn) + price; if (seenT[key]) return; seenT[key] = 1;
            var h = base('buy_train'); h.train = os(t.$id()); h.price = price; h.variant = os(vn);
            var wmax = 0; try { if (has(step, 'warranty_max')) wmax = num(step.$warranty_max()) || 0; } catch (e) {}
            if (wmax > 0) { var wc = 0; try { wc = num(step.$warranty_cost()); } catch (e) {} h.warranties = 0;
              add('Buy a train', 'Buy a ' + os(vn) + ' from the bank (' + money(price) + ') with this many warranties' + (wc ? ' (' + money(wc) + ' each)' : ''), h, { key: 'warranties', min: 0, max: wmax }); }
            else add('Buy a train', 'Buy a ' + os(vn) + ' from the bank (' + money(price) + ')', h);
          });
        } else {
          var on = os(call(owner, 'name')), key2 = 'o' + on + os(t.$name()); if (seenT[key2]) return; seenT[key2] = 1;
          var h2 = base('buy_train'); h2.train = os(t.$id()); h2.price = 1;
          add('Buy a train', 'Buy ' + on + '\'s ' + os(t.$name()) + ' for an agreed price', h2, { key: 'price', min: 1, max: num(call(entity, 'cash')) || 1 });
        }
      });
    }
    if (can('bid')) {
      var cos = []; try { cos = arr(has(step, 'available') ? step.$available() : has(step, 'visible_corporations') ? step.$visible_corporations() : has(step, 'companies') ? step.$companies() : []); } catch (e) {}
      if (!cos.length && has(step, 'auctioning_corporation')) {
        // an auction of a company: the one being auctioned, or (when none is) the companies not yet started
        var au = null; try { au = step.$auctioning_corporation(); } catch (e) {}
        if (!nil(au)) cos = [au]; else g.$corporations().forEach(function (c) { if (!truthy(call(c, 'ipoed')) && !truthy(call(c, 'closed?'))) cos.push(c); });
      }
      cos.forEach(function (co) {
        var tp = truthy(call(co, 'company?')) ? 'company' : truthy(call(co, 'minor?')) ? 'minor' : 'corporation', h = base('bid'); h[tp] = os(co.$id());
        if (has(step, 'min_bid')) {
          var min = null, max = null; try { min = num(step.$min_bid(co)); } catch (e) {} try { max = num(step.$max_bid(entity, co)); } catch (e) {}
          if (min == null) return; h.price = min;
          if (max != null && max < min) return;
          add('Bid', 'Bid on ' + os(co.$name()) + ' (at least ' + money(min) + ')', h, { key: 'price', min: min, max: max != null ? max : min });
        } else {
          // a draft: take the company at its own price
          var pr = num(call(co, 'value')); if (pr == null) pr = 0; h.price = pr;
          add('Take a company', 'Take ' + os(co.$name()) + (pr ? ' (' + money(pr) + ')' : ''), h);
        }
      });
    }
    // ---------- special moves (J5): loans, shorts, conversions, mergers, choices, assignments, tokens, discards
    if (can('take_loan')) { try { var ln = arr(g.$loans())[0]; var hl = mk('TakeLoan', ln ? { loan: ln } : {}); var lv = num(call(g, 'loan_value')); if (hl) add('Loans', has(step, 'take_loan_text') ? os(step.$take_loan_text()) : 'Take a loan' + (lv ? ' (' + money(lv) + ')' : ''), hl); } catch (e) {} }
    if (can('payoff_loan')) { try { var pl = arr(call(entity, 'loans'))[0]; var hp = mk('PayoffLoan', pl ? { loan: pl } : {}); if (hp) add('Loans', has(step, 'payoff_loan_text') ? os(step.$payoff_loan_text()) : 'Pay off a loan', hp); } catch (e) {} }
    if (can('short')) {
      g.$corporations().forEach(function (c) { try { if (truthy(step['$can_short?'](entity, c))) add('Short a share', 'Short ' + nm(c) + ' (sell a share you do not own)', mk('Short', { corporation: c })); } catch (e) {} });
    }
    if (can('convert')) { try { add('Convert', 'Convert ' + nm(entity) + (num(call(entity, 'total_shares')) ? ' (now ' + num(entity.$total_shares()) + ' shares)' : ''), mk('Convert', {})); } catch (e) {} }
    if (can('merge')) {
      var subj = has(step, 'auctioning_corporation') ? step.$auctioning_corporation() : entity, targets = [];
      try { targets = arr(has(step, 'mergeable') ? step.$mergeable(nil(subj) ? entity : subj) : []); } catch (e) {}
      var mname = 'Merge'; try { if (has(step, 'merge_name')) mname = os(step.$merge_name(entity)) || mname; } catch (e) {}
      targets.forEach(function (t) { try { var key = truthy(call(t, 'minor?')) ? 'minor' : 'corporation', o = {}; o[key] = t; add(mname, (/^acquire$/i.test(mname) && !nil(subj) && subj !== entity ? nm(t) + ' acquires ' + nm(subj) : mname + ' with ' + nm(t)), mk('Merge', o)); } catch (e) {} });
    }
    if (can('choose')) {
      try {
        var ch = step.$choices(), cname = has(step, 'choice_name') ? os(step.$choice_name()) : 'Choose';
        if (has(step, 'choice_is_amount?') && truthy(step['$choice_is_amount?']())) { var mm = arr(ch); add(cname, cname, Object.assign(mk('Choose', { choice: mm[0] }), {}), { key: 'choice', min: num(mm[0]), max: num(mm[1]) }); }
        else if (has(ch, 'keys')) arr(ch.$keys()).forEach(function (k) { add(cname || 'Choose', os(ch['$[]'](k)) || os(k), mk('Choose', { choice: k })); });
        else arr(ch).forEach(function (k) { add(cname || 'Choose', os(k), mk('Choose', { choice: k })); });
      } catch (e) {}
    }
    if (can('assign') && etype === 'company') {
      // a private company's power: assigned to a hex (a bridge, a port, ...) or to a company
      try { arr(g.$hexes()).forEach(function (hx) { try { if (has(step, 'available_hex') && truthy(step.$available_hex(entity, hx))) add('Use ' + nm(entity), 'Assign ' + nm(entity) + ' to ' + os(hx.$id()) + (os(call(hx, 'location_name')) ? ' (' + os(hx.$location_name()) + ')' : ''), mk('Assign', { target: hx })); } catch (e2) {} }); } catch (e) {}
      try { if (has(step, 'assignable_corporations')) arr(step.$assignable_corporations(entity)).forEach(function (c) { add('Use ' + nm(entity), 'Assign ' + nm(entity) + ' to ' + nm(c), mk('Assign', { target: c })); }); } catch (e) {}
    } else if (can('assign')) {
      var tg = []; try { tg = has(step, 'available_subsidiaries') ? arr(step.$available_subsidiaries(entity)) : has(step, 'auctioning_corporation') && !nil(step.$auctioning_corporation()) ? [step.$auctioning_corporation()] : []; } catch (e) {}
      tg.forEach(function (t) { try { var v = num(call(t, 'value')); add('Assign', (truthy(call(t, 'company?')) ? 'Put ' + nm(t) + ' into the new company (' + money(v) + ')' : 'Offer ' + nm(t) + ' for sale'), mk('Assign', { target: t })); } catch (e) {} });
    }
    if (can('remove_token')) {
      // after a merger the surviving company may remove its own stations or those of the companies it took over
      var toks = arr(call(entity, 'tokens')); try { if (has(step, 'acquired_corps')) arr(step.$acquired_corps()).forEach(function (c) { toks = toks.concat(arr(call(c, 'tokens'))); }); } catch (e) {}
      toks.forEach(function (t) { try { var c = call(t, 'city'); if (!c || !truthy(call(t, 'used'))) return; var hx = os(call(call(c, 'hex'), 'id'));
        if (has(step, 'available_hex')) { try { if (!truthy(step.$available_hex(entity, c.$hex()))) return; } catch (e3) {} }
        var tc = call(t, 'corporation'); hx += tc && tc !== entity ? ' (' + nm(tc) + '\'s)' : ''; add('Remove a station', 'Remove the station in ' + hx, mk('RemoveToken', { city: c, slot: arr(c.$tokens()).indexOf(t) })); } catch (e) {} });
    }
    if (can('discard_train')) {
      arr(call(entity, 'trains')).forEach(function (t) { try { add('Discard a train', 'Discard the ' + nm(t) + ' train', mk('DiscardTrain', { train: t })); } catch (e) {} });
    }
    out.forEach(function (o) { Object.keys(o.h).forEach(function (k) { if (o.h[k] === undefined) delete o.h[k]; }); });
    return out;
  }
  // Try a move on a fresh copy of the game: the new log lines, the JSON the page would send, or the engine's reason it is not allowed
  function dryRun(J, text, h) {
    var g = J.loadGame(text), before = arr(g.$log()).length, s0 = null, actor = null;
    try { s0 = snap(g); var ent0 = g.$get(h.entity_type, h.entity); actor = truthy(call(ent0, 'player?')) ? os(ent0.$name()) : (call(ent0, 'owner') && truthy(call(ent0.$owner(), 'player?')) ? os(ent0.$owner().$name()) : null); } catch (e) {}
    var action = Opal.Engine.Action.Base.$action_from_h(Opal.JSON.$parse(JSON.stringify(h)), g);
    var g2 = g.$process_action(action, Opal.hash({ add_auto_actions: true }));
    var ex = call(g2, 'exception'); if (ex) throw new Error(os(call(ex, 'message')) || os(ex));
    var log = arr(g2.$log()).slice(before).map(function (l) { return os(call(l, 'message')); }).filter(Boolean);
    var json = action.$to_h().$to_n(), actors = []; try { actors = arr(g.$valid_actors(action)).map(function (p) { return num(p.$id()); }); } catch (e) {}
    var warns = []; try { if (s0) warns = moveWarnings(g2, s0, snap(g2), h, actor); } catch (e) {}
    return { log: log, json: json, actors: actors, warns: warns };
  }
  // ---------- Learning and warnings (J6) --------------------------------------------------------
  // A snapshot of what matters before and after a move, so the confirmation can say what it really changes.
  function snap(g) {
    var s = { phase: '', players: {}, corps: {} };
    try { s.phase = os(g.$phase().$name()); } catch (e) {}
    arr(g.$players()).forEach(function (p) {
      var lim = null; try { lim = num(g.$cert_limit(p)); } catch (e) { try { lim = num(g.$cert_limit()); } catch (e2) {} }
      var certs = null; try { certs = num(g.$num_certs(p)); } catch (e) {}
      s.players[os(p.$name())] = { cash: num(p.$cash()), certs: certs, limit: lim };
    });
    arr(g.$corporations()).forEach(function (c) {
      if (truthy(call(c, 'closed?'))) return;
      var sp = call(c, 'share_price'), own = call(c, 'owner');
      s.corps[os(c.$name())] = { price: sp ? num(call(sp, 'price')) : null, zone: sp ? arr(call(sp, 'types')).map(os) : [], cash: num(call(c, 'cash')),
        trains: arr(call(c, 'trains')).map(function (t) { return os(call(t, 'name')); }), pres: own && truthy(call(own, 'player?')) ? os(own.$name()) : null,
        loans: arr(call(c, 'loans')).length, interest: (function () { try { return num(g.$interest_owed(c)); } catch (e) { return null; } })(), floated: truthy(call(c, 'floated?')) };
    });
    return s;
  }
  // What a move changes that a player could easily miss. level 'warn' = think twice, 'info' = good to know.
  function moveWarnings(g, a, b, h, actor) {
    var out = [], money = function (v) { try { return os(g.$format_currency(v)); } catch (e) { return String(v); } }, W = function (lv, t) { out.push({ lv: lv, t: t }); };
    if (b.phase && a.phase && b.phase !== a.phase) W('info', 'The phase changes from ' + a.phase + ' to ' + b.phase + '.');
    Object.keys(a.corps).forEach(function (n) {
      var x = a.corps[n], y = b.corps[n];
      if (!y) { W('warn', n + ' closes.'); return; }
      var lost = x.trains.slice(); y.trains.forEach(function (t) { var i = lost.indexOf(t); if (i >= 0) lost.splice(i, 1); });
      if (lost.length && h.type === 'buy_train' && String(h.entity) !== n) W(x.pres === actor ? 'warn' : 'info', n + ' loses ' + (lost.length === 1 ? 'its ' + lost[0] + ' train' : lost.length + ' trains (' + lost.join(', ') + ')') + (y.trains.length ? '' : ' and is left with no train') + '.');
      else if (lost.length && h.type === 'buy_train' && String(h.entity) === n && lost.length > 0 && y.trains.length <= x.trains.length) W('warn', n + ' loses ' + lost.join(', ') + ' in the same purchase.');
      if (x.pres && y.pres && x.pres !== y.pres) W(x.pres === actor ? 'warn' : 'info', y.pres + ' becomes the president of ' + n + (x.pres === actor ? ' (you lose it)' : '') + '.');
      if (x.price != null && y.price != null && y.price !== x.price) W(y.price < x.price && x.pres === actor ? 'warn' : 'info', n + '\'s share price ' + (y.price > x.price ? 'rises' : 'falls') + ' from ' + money(x.price) + ' to ' + money(y.price) + '.');
      var bad = ['liquidation', 'acquisition', 'close'].filter(function (z) { return y.zone.indexOf(z) >= 0 && x.zone.indexOf(z) < 0; });
      if (bad.length) W('warn', n + '\'s price enters the ' + bad[0] + ' zone' + (bad[0] === 'acquisition' ? ': it can be bought by another company' : bad[0] === 'liquidation' ? ': it can be liquidated' : '') + '.');
      if (y.loans > x.loans) W('info', n + ' will have ' + y.loans + ' loan' + (y.loans > 1 ? 's' : '') + (y.interest != null ? ', ' + money(y.interest) + ' interest each operating round' : '') + '.');
      if (y.floated && x.trains.length && !y.trains.length && h.type !== 'buy_train') W('warn', n + ' is left with no train.');
    });
    var p0 = a.players[actor], p1 = b.players[actor];
    if (p0 && p1) {
      if (p1.cash < 0) W('warn', actor + ' would be in debt (' + money(p1.cash) + ').');
      else if (h.type === 'buy_train' && p1.cash < p0.cash) W('warn', actor + ' pays ' + money(p0.cash - p1.cash) + ' of their own money toward the train.');
      else if (p1.cash === 0 && p0.cash > 0) W('info', actor + ' has no cash left after this.');
      if (p1.limit != null && p1.certs != null) { if (p1.certs > p1.limit) W('warn', actor + ' goes over the certificate limit (' + p1.certs + ' of ' + p1.limit + ').'); else if (p1.certs === p1.limit && p0.certs < p1.limit) W('info', actor + ' reaches the certificate limit (' + p1.limit + ').'); }
    }
    if (h.type === 'short') W('info', 'While you hold a short you pay that company\'s dividends on the share, and you must buy it back later.');
    if (h.type === 'dividend' && h.kind === 'withhold') W('info', 'Withholding keeps the money in the company, but the share price usually falls.');
    if (h.type === 'pass' && /auction|bid/i.test(os(call(call(g.$round(), 'active_step'), 'class')))) W('info', 'Passing in an auction usually means you are out of this auction.');
    return out;
  }
  // a one-line explanation for each kind of move, shown in Learning mode
  var HELP = {
    pass: 'Pass: do nothing now. In a stock round, if everyone passes in a row the round ends.',
    bid: 'An auction: the highest bid wins. You need the money for your bid.',
    par: 'Start a company: choose its first share price; you buy the president\'s certificate at that price.',
    buy_shares: 'Buying shares: more shares mean more dividends, and the biggest holder runs the company.',
    sell_shares: 'Selling shares: money now, but the price usually falls and you may lose a presidency.',
    dividend: 'Pay out: shareholders get the money and the price rises. Withhold: the company keeps it and the price usually falls.',
    buy_train: 'A company needs a train to earn money. The first train of a new kind can change the phase and make older trains rust.',
    lay_tile: 'Tiles extend and upgrade the track; better track lets trains reach more and richer stops.',
    place_token: 'A station lets the company run trains from that city and can block others.',
    run_routes: 'Each train runs a route between stations and cities; the revenue is paid out or kept.',
    take_loan: 'A loan gives cash now; the company pays interest every operating round.',
    payoff_loan: 'Paying off a loan stops its interest.',
    short: 'A short is a bet that the price will fall: you sell a share you do not own and must buy it back later.',
    convert: 'Converting gives a company more shares (and new shares to sell).',
    merge: 'Merging joins two companies into one.',
    choose: 'The rules need a choice from you here.',
    assign: 'Assigning puts a private company (or its power) to use.',
    remove_token: 'After a merger a company may have too many stations; choose which to give up.',
    discard_train: 'The company has more trains than it may keep; choose one to give up.'
  };
  function pageUser() {
    try {
      var sc = Array.prototype.map.call(document.scripts, function (s) { return s.textContent; }).filter(function (t) { return t.indexOf("Opal.App.$attach('app'") >= 0; })[0] || '';
      var i = sc.lastIndexOf('"user",'); if (i < 0) return null;
      var mm = /^"user",Opal\.hash\("id",(\d+),"name","([^"]*)"/.exec(sc.slice(i)); return mm ? { id: +mm[1], name: mm[2] } : null;
    } catch (e) { return null; }
  }
  function sendOn() { try { return localStorage.getItem('jnnEngine.send') === '1'; } catch (e) { return false; } }
  function setSend(v) { try { localStorage.setItem('jnnEngine.send', v ? '1' : '0'); } catch (e) {} }
  function postAction(json) {
    var body = {}; Object.keys(json).forEach(function (k) { body[k] = json[k]; });
    try { if (window.MessageBus && window.MessageBus.clientId) body._client_id = window.MessageBus.clientId; } catch (e) {}
    return fetch('/api/game/' + gid + '/action', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.text().then(function (t) { var j = null; try { j = JSON.parse(t); } catch (e) {} if (!r.ok || (j && j.error)) throw new Error((j && j.error) || t.slice(0, 200) || ('HTTP ' + r.status)); return j; }); });
  }
  // Self-test: walk through a finished game and check that every move of a supported kind was among the options offered
  function selfTest(J, text) {
    var raw = JSON.parse(text), eff = J.effectiveActions(raw), j0 = JSON.parse(text); j0.actions = []; j0.status = 'active'; delete j0.result;
    var g = J.loadGame(JSON.stringify(j0)), ok = 0, miss = [], n = 0, byType = {}, checks = [], k = -1;
    // two moves are the same if they buy or sell the same size of share of the same company from the same place,
    // even when the engine picks a different certificate number
    var shareKey = function (ids) { return (ids || []).map(function (id) { try { var sh = g.$share_by_id(id), own = sh.$owner(); return os(sh.$corporation().$id()) + ':' + num(sh.$percent()) + ':' + (own === g.$share_pool() ? 'm' : own === sh.$corporation() ? 'i' : 'o'); } catch (e) { return id; } }).sort().join(','); };
    var same = function (h, a, o) {
      if (o && o.amount) { var v = a[o.amount.key]; if (v == null || +v < o.amount.min || +v > o.amount.max) return false; h = JSON.parse(JSON.stringify(h)); h[o.amount.key] = v; }
      if (h.type !== a.type || String(h.entity) !== String(a.entity)) return false;
      var keys = { buy_shares: ['shares', 'purchase_for'], sell_shares: ['shares'], par: ['corporation', 'share_price'], dividend: ['kind'], buy_train: ['train', 'variant'], bid: ['company', 'minor', 'corporation'], pass: [],
        take_loan: [], payoff_loan: [], short: ['corporation'], convert: [], merge: ['corporation', 'minor'], choose: ['choice'], assign: ['target', 'target_type'], remove_token: ['city'], discard_train: ['train'] }[h.type] || [];
      return keys.every(function (k) { var x = h[k], y = a[k]; if (k === 'shares') return shareKey(x) === shareKey(y); if (k === 'variant' && (y == null || x === y)) return true; return x == null && y == null || String(x) === String(y); });
    };
    eff.forEach(function (a) {
      k++;
      if (a.type === 'lay_tile' || a.type === 'place_token') {
        n++;
        try { var why = mapCheck(g, g.$get(a.entity_type, a.entity), a); if (!why) ok++; else { byType[a.type] = (byType[a.type] || 0) + 1; if (miss.length < 12) miss.push(a.id + ' ' + a.type + ' ' + why + ' ' + JSON.stringify(a).slice(0, 120)); } }
        catch (e) { byType[a.type] = (byType[a.type] || 0) + 1; if (miss.length < 12) miss.push(a.id + ' ' + a.type + ' error: ' + e.message); }
      } else if (SENDABLE.indexOf(a.type) >= 0 && a.type !== 'message') {
        n++;
        try {
          var ent = g.$get(a.entity_type, a.entity), acts = arr(g.$round().$actions_for(ent)).map(os);
          var match = moveOptions(g, ent, acts).filter(function (o) { return same(o.h, a, o); })[0], found = !!match;
          if (found && checks.length < 10 && n % 15 === 1) { var hh = JSON.parse(JSON.stringify(match.h)); if (match.amount) hh[match.amount.key] = a[match.amount.key]; checks.push({ k: k, h: hh, a: a }); }
          if (found) ok++; else byType[a.type] = (byType[a.type] || 0) + 1; if (!found && miss.length < 12) miss.push(a.id + ' ' + a.type + ' ' + JSON.stringify(a).slice(0, 160));
        } catch (e) { byType[a.type] = (byType[a.type] || 0) + 1; if (miss.length < 12) miss.push(a.id + ' ' + a.type + ' error: ' + e.message); }
      }
      g = g.$process_action(Opal.JSON.$parse(JSON.stringify(a)));
    });
    // replay a sample both ways: the move JNN-Engine builds must do exactly what the real move did
    var same2 = 0, diff = [];
    checks.forEach(function (c) {
      var jt = JSON.parse(text); jt.actions = eff.slice(0, c.k); jt.status = 'active'; delete jt.result; var t2 = JSON.stringify(jt);
      var real = {}; Object.keys(c.a).forEach(function (x) { if (['id', 'user', 'created_at', 'auto_actions'].indexOf(x) < 0) real[x] = c.a[x]; });
      try { var r1 = dryRun(J, t2, c.h), r2 = dryRun(J, t2, real); if (JSON.stringify(r1.log) === JSON.stringify(r2.log)) same2++; else diff.push(c.a.id + ': ' + r1.log.join(' / ') + ' ≠ ' + r2.log.join(' / ')); }
      catch (e) { diff.push(c.a.id + ': ' + e.message); }
    });
    return { title: raw.title, moves: n, found: ok, missingByType: byType, missing: miss, replayed: same2 + '/' + checks.length, replayDiffs: diff };
  }
  E._moveOptions = moveOptions;
  // for testing: show game id at its first n moves (sending is always off), or null to go back
  E.preview = function (id, n) { E.fixed = id ? { id: id, n: n } : null; E.game = null; E.q = null; return cycle(true); };
  // ---------- Automatic option test (J7) -------------------------------------------------------
  // At sampled positions of a game, try every choice JNN-Engine offers on a copy and check the rules engine accepts it.
  // This finds the opposite mistake to selfTest: offering a move that is not allowed.
  function optionTest(J, text, cfg) {
    cfg = cfg || {}; var positions = cfg.positions || 8, maxOpts = cfg.maxOpts || 14;
    var raw = JSON.parse(text), acts0 = raw.actions || [], cand = [];
    acts0.forEach(function (a, i) { if (i > 0 && ['undo', 'redo', 'message'].indexOf(a.type) < 0) cand.push(i); });
    var picks = []; for (var q = 0; q < positions && cand.length; q++) { var v = cand[Math.floor((q + 0.5) * cand.length / positions)]; if (picks.indexOf(v) < 0) picks.push(v); }
    var res = { title: raw.title, positions: 0, tried: 0, ok: 0, bad: [], byType: {}, ms: 0 }, t0 = Date.now(), jobs = [];
    picks.forEach(function (k) {
      var jt = JSON.parse(text); jt.actions = acts0.slice(0, k); jt.status = 'active'; delete jt.result; var tk = JSON.stringify(jt);
      var g; try { g = J.loadGame(tk); } catch (e) { return; }
      if (truthy(call(g, 'finished'))) return;
      var ent = curEntity(g); if (!ent) return; res.positions++;
      var acts = []; try { acts = arr(g.$round().$actions_for(ent)).map(os); } catch (e) {}
      var opts = []; try { opts = moveOptions(g, ent, acts).concat(extraOptions(g, ent).filter(function (o) { return !o.mapUse; })); } catch (e) { res.bad.push({ k: k, label: 'reading the choices', err: e.message }); }
      try {
        var tg = mapTargets(g, ent, acts), hx = Object.keys(tg);
        [hx[0], hx[Math.floor(hx.length / 2)], hx[hx.length - 1]].filter(function (x, i, A) { return x && A.indexOf(x) === i; }).forEach(function (id) { var ho = hexOptions(g, ent, id, tg[id]); opts = opts.concat(ho.slice(0, 2), ho.slice(-1)); });
      } catch (e) { res.bad.push({ k: k, label: 'reading the map choices', err: e.message }); }
      // a spread of the choices, so big lists (many shares, many bids) are still covered
      if (opts.length > maxOpts) { var o2 = []; for (var z = 0; z < maxOpts; z++) o2.push(opts[Math.floor(z * opts.length / maxOpts)]); opts = o2; }
      opts.forEach(function (o) { jobs.push({ k: k, text: tk, o: o }); });
    });
    // run the dry runs one at a time with short breaks, so the page stays responsive
    return new Promise(function (resolve) {
      var i = 0;
      (function next() {
        if (i >= jobs.length) { res.ms = Date.now() - t0; resolve(res); return; }
        var jb = jobs[i++], h = JSON.parse(JSON.stringify(jb.o.h)); if (jb.o.amount) h[jb.o.amount.key] = jb.o.amount.min;
        res.tried++;
        try { dryRun(J, jb.text, h); res.ok++; }
        catch (e) { res.byType[h.type] = (res.byType[h.type] || 0) + 1; if (res.bad.length < 25) res.bad.push({ k: jb.k, label: jb.o.label, err: (e.message || String(e)).slice(0, 160), h: JSON.stringify(h).slice(0, 200) }); }
        setTimeout(next, 0);
      })();
    });
  }
  E.optionTest = function (id, cfg) { return pickStats().then(loadStats).then(function (J) { return J.fetchGameText(id || gid).then(function (t) { var raw = JSON.parse(t); return J.ensureTitle(raw.title).then(function () { return optionTest(J, t, cfg); }); }); }); };
  // both tests on one finished game, with a single fetch
  E.testGame = function (id, cfg) { return pickStats().then(loadStats).then(function (J) { return J.fetchGameText(id).then(function (t) { var raw = JSON.parse(t); return J.ensureTitle(raw.title).then(function () { var st = selfTest(J, t); return optionTest(J, t, cfg).then(function (ot) { return { title: raw.title, status: raw.status, self: st, options: ot }; }); }); }); }); };
  E.selfTest = function (id) { return pickStats().then(loadStats).then(function (J) { return J.fetchGameText(id || gid).then(function (t) { var raw = JSON.parse(t); return J.ensureTitle(raw.title).then(function () { return selfTest(J, t); }); }); }); };

  // ---------- Map moves (J4): tiles, stations, routes ------------------------------------------
  var MAPACTS = ['lay_tile', 'place_token', 'run_routes'];
  // a throwaway copy of the game for questions that change tiles (rotations) or run the auto-router
  function qgame(J) { var n = E.game.raw.actions.length; if (!E.q || E.q.n !== n) E.q = { n: n, g: J.loadGame(JSON.stringify(E.game.raw)) }; return E.q.g; }
  // the entity whose map moves are shown: the one to act, or a private company whose power is being used
  function mapEntity(g) {
    var c = curEntity(g); if (!E.mapEnt) return c;
    try { var e2 = g.$get(E.mapEnt.type, E.mapEnt.id); if (!nil(e2) && arr(g.$round().$actions_for(e2)).map(os).some(function (a) { return MAPACTS.indexOf(a) >= 0; })) return e2; } catch (e) {}
    E.mapEnt = null; return c;
  }
  // moves the player can make for others right now: the companies they run (1817 loans and buy-backs in a
  // stock round, for example) and the powers of private companies they or their company own
  function extraOptions(g, ent) {
    var out = [], round = g.$round(), seen = {};
    var meta = function (a) { return ['end_game', 'message', 'undo', 'redo', 'log', 'pass', 'bankrupt'].indexOf(a) >= 0 || /^program_/.test(a); };
    var others = [];
    if (truthy(call(ent, 'player?'))) arr(g.$corporations()).forEach(function (c) { if (call(c, 'owner') === ent) others.push(c); });
    var owners = [ent]; var pres = call(ent, 'owner'); if (pres && truthy(call(pres, 'player?'))) owners.push(pres);
    owners.forEach(function (o) { arr(call(o, 'companies')).forEach(function (co) { others.push(co); }); });
    others.forEach(function (x) {
      var key = os(call(x, 'id')); if (seen[key]) return; seen[key] = 1;
      var acts = []; try { acts = arr(round.$actions_for(x)).map(os).filter(function (a) { return !meta(a); }); } catch (e) {}
      if (!acts.length) return;
      var isCo = truthy(call(x, 'company?')), who = os(call(x, 'name'));
      moveOptions(g, x, acts.filter(function (a) { return MAPACTS.indexOf(a) < 0; })).forEach(function (o) { if (o.h.type === 'pass') return; o.group = (isCo ? 'Use ' : 'For ') + who + ': ' + o.group; out.push(o); });
      if (acts.some(function (a) { return MAPACTS.indexOf(a) >= 0; })) out.push({ group: (isCo ? 'Use ' : 'For ') + who, label: (isCo ? 'Use ' + who + ' on the map' : 'Show ' + who + '\'s map moves'), h: {}, mapUse: { type: isCo ? 'company' : 'corporation', id: key, key: key } });
    });
    if (E.mapEnt) out.push({ group: 'Map', label: 'Back to the normal map moves', h: {}, mapUse: {} });
    return out;
  }
  function curEntity(g) { try { return g.$round().$active_step().$current_entity(); } catch (e) { return null; } }
  function stepFor(g, ent, act) { try { var st = g.$round().$step_for(ent, act); return nil(st) ? null : st; } catch (e) { return null; } }
  function entJson(ent) { var id = os(call(ent, 'id')); return { entity: isNaN(+id) ? id : +id, entity_type: truthy(call(ent, 'player?')) ? 'player' : truthy(call(ent, 'corporation?')) ? 'corporation' : truthy(call(ent, 'minor?')) ? 'minor' : 'company' }; }
  function tokOwner(g, ent) { try { var o = g.$token_owner(ent); return nil(o) ? ent : o; } catch (e) { return ent; } }
  function tileCities(hex) { var t = call(hex, 'tile'); return t ? arr(call(t, 'cities')) : []; }
  // which hexes take a tile or a station now
  function mapTargets(g, ent, acts) {
    var out = {}, ts = acts.indexOf('lay_tile') >= 0 ? stepFor(g, ent, 'lay_tile') : null, tk = acts.indexOf('place_token') >= 0 ? stepFor(g, ent, 'place_token') : null;
    arr(g.$hexes()).forEach(function (hex) {
      var id = os(hex.$id()), k = '';
      if (ts) { try { if (truthy(ts.$available_hex(ent, hex)) && arr(ts.$upgradeable_tiles(ent, hex)).length) k += 't'; } catch (e) {} }
      if (tk) { try { if (truthy(tk.$available_hex(ent, hex)) && tileCities(hex).some(function (c) { try { return truthy(c['$tokenable?'](tokOwner(g, ent))); } catch (e2) { return false; } })) k += 's'; } catch (e) {} }
      if (k) out[id] = k;
    });
    return out;
  }
  // the legal tiles (with their legal rotations) and station spots of one hex, as options
  function hexOptions(g, ent, hexId, kinds) {
    var hex = g.$hex_by_id(hexId), out = [], ej = entJson(ent), money = function (v) { try { return os(g.$format_currency(v)); } catch (e) { return String(v); } };
    if (kinds.indexOf('t') >= 0) {
      var ts = stepFor(g, ent, 'lay_tile'), tiles = [];
      try { tiles = arr(ts.$upgradeable_tiles(ent, hex)); } catch (e) {}
      tiles.forEach(function (tile) {
        var rots = arr(call(tile, 'legal_rotations')).map(num);
        rots.forEach(function (r) {
          var h = { type: 'lay_tile', entity: ej.entity, entity_type: ej.entity_type, hex: hexId, tile: os(tile.$id()), rotation: r };
          out.push({ group: 'Tile on ' + hexId, label: 'Tile ' + os(tile.$name()) + ', rotation ' + (rots.indexOf(r) + 1) + ' of ' + rots.length, h: h, svg: tileSvg(tile, r, os(call(hex, 'layout')) || 'flat') });
        });
      });
    }
    if (kinds.indexOf('s') >= 0) {
      var tk = stepFor(g, ent, 'place_token'), toks = []; try { toks = arr(tk.$available_tokens(ent)); } catch (e) {}
      var owner = null; try { owner = g.$token_owner(ent); } catch (e) {}
      tileCities(hex).forEach(function (c, ci) {
        try { if (!truthy(c['$tokenable?'](tokOwner(g, ent)))) return; } catch (e) { return; }
        var slot = null; try { slot = c.$get_slot(owner || ent); slot = nil(slot) ? null : num(slot); } catch (e) {}
        if (slot == null) { try { slot = arr(c.$tokens()).findIndex(function (x) { return nil(x); }); } catch (e) {} if (slot < 0) slot = 0; }
        var h = { type: 'place_token', entity: ej.entity, entity_type: ej.entity_type, city: os(c.$id()), slot: slot };
        if (owner) h.tokener = os(owner.$id());
        var tt = toks[0] ? os(call(toks[0], 'type')) : ''; if (tt && tt !== 'normal') h.token_type = tt;
        var name = os(call(hex, 'location_name')) || hexId;
        out.push({ group: 'Station on ' + hexId, label: 'Place a station in ' + name + (tileCities(hex).length > 1 ? ' (city ' + (ci + 1) + ')' : ''), h: h });
      });
    }
    return out;
  }
  // a small drawing of a tile at a rotation, from the engine's track data (drawn here, not copied from the site)
  function tileSvg(tile, rot, layout) {
    try { tile['$rotate!'](rot); } catch (e) {}
    var col = { yellow: '#f2d25a', green: '#6dbb4b', brown: '#c47a45', gray: '#b9b9b9', grey: '#b9b9b9', white: '#f4f1e8', blue: '#7fb2dd' }[os(call(tile, 'color'))] || '#ddd';
    var E87 = 86.6, ep = function (e) { var a = e * Math.PI / 3; return [(-Math.sin(a) * E87).toFixed(1), (Math.cos(a) * E87).toFixed(1)]; };
    var lines = [], nodes = [], pts = '100,0 50,86.6 -50,86.6 -100,0 -50,-86.6 50,-86.6';
    arr(call(tile, 'paths')).forEach(function (p) {
      var ex = arr(call(p, 'exits')).map(num);
      if (ex.length >= 2) { var a = ep(ex[0]), b = ep(ex[1]); lines.push('M' + a[0] + ' ' + a[1] + ' Q0 0 ' + b[0] + ' ' + b[1]); }
      else if (ex.length === 1) { var a2 = ep(ex[0]); lines.push('M' + a2[0] + ' ' + a2[1] + ' L0 0'); }
    });
    arr(call(tile, 'cities')).forEach(function () { nodes.push('<circle r="24" fill="#fff" stroke="#000" stroke-width="4"/>'); });
    if (!nodes.length) arr(call(tile, 'towns')).forEach(function () { nodes.push('<circle r="11" fill="#000"/>'); });
    return '<svg viewBox="-110 -100 220 200" width="74" height="68"><g transform="' + (layout === 'pointy' ? 'rotate(30)' : '') + '"><polygon points="' + pts + '" fill="' + col + '" stroke="#555" stroke-width="3"/>' +
      lines.map(function (l) { return '<path d="' + l + '" stroke="#000" stroke-width="13" fill="none"/>'; }).join('') + nodes.slice(0, 1).join('') + '</g>' +
      '<text x="-100" y="96" font-size="30" fill="var(--text-secondary)">' + esc(os(call(tile, 'name'))) + '</text></svg>';
  }
  // the board with the hexes you can click outlined
  function mapPicker(J, d, targets) {
    var svg = J.boardSvg(d, null, [], 1400), P = J.hexPositions(d, 26), u = 26, flat = P.flat, ov = [];
    var poly = function (cx, cy, r) { var q = []; for (var a = 0; a < 6; a++) { var rad = ((flat ? 0 : 30) + a * 60) * Math.PI / 180; q.push((cx + r * Math.cos(rad)).toFixed(1) + ',' + (cy + r * Math.sin(rad)).toFixed(1)); } return q.join(' '); };
    Object.keys(targets).forEach(function (id) { var c = P.pos[id]; if (!c) return; ov.push('<polygon class="hx' + (E.selHex === id ? ' sel' : '') + '" data-hex="' + esc(id) + '" data-k="' + targets[id] + '" points="' + poly(c[0], c[1], u - 2) + '"><title>' + esc(id + (targets[id].indexOf('t') >= 0 ? ': tile' : '') + (targets[id].indexOf('s') >= 0 ? ': station' : '')) + '</title></polygon>'); });
    return svg.replace(/<\/svg>\s*$/, ov.join('') + '</svg>');
  }
  // routes: the site's own auto-router, on a copy
  function findRoutes(J, done) {
    var g = J.loadGame(JSON.stringify(E.game.raw)), ent = curEntity(g), finished = false;
    var stop = setTimeout(function () { if (!finished) { finished = true; done(null, 'the route search took too long'); } }, 45000);
    try {
      var router = Opal.Engine.AutoRouter.$new(g);
      router.$compute(ent, Opal.hash({ route_timeout: 10, path_timeout: 30, callback: function (routes) {
        if (finished) return; finished = true; clearTimeout(stop);
        try {
          routes = arr(routes); var extra = null, sub = null; try { extra = g.$extra_revenue(ent, routes); } catch (e) {} try { sub = g.$routes_subsidy(routes); } catch (e) {}
          var args = { routes: routes }; if (!nil(extra) && extra != null) args.extra_revenue = extra; if (!nil(sub) && sub != null) args.subsidy = sub;
          var act = Opal.Engine.Action.RunRoutes.$new(ent, Opal.hash(args)), h = act.$to_h().$to_n();
          delete h.id; delete h.created_at; delete h.user;
          var list = routes.map(function (r) { return { train: os(r.$train().$name()), rev: num(r.$revenue()), stops: arr(r.$hexes()).map(function (x) { return os(x.$id()); }) }; });
          done({ h: h, list: list, total: num(g.$routes_revenue(routes)) });
        } catch (e) { done(null, e.message || String(e)); }
      } }));
    } catch (e) { finished = true; clearTimeout(stop); done(null, e.message || String(e)); }
  }
  function mapMovesHtml(J, d, acts) {
    var g = qgame(J), ent = mapEntity(g); if (!ent) return '';
    if (ent !== curEntity(g)) acts = arr(g.$round().$actions_for(ent)).map(os);
    var ma = MAPACTS.filter(function (a) { return acts.indexOf(a) >= 0; }); if (!ma.length) return '';
    var h = '';
    if (ma.indexOf('lay_tile') >= 0 || ma.indexOf('place_token') >= 0) {
      var targets = {}; try { targets = mapTargets(g, ent, acts); } catch (e) {}
      var n = Object.keys(targets).length;
      var ttl = (ma.indexOf('lay_tile') >= 0 ? 'lay a tile' : '') + (ma.indexOf('lay_tile') >= 0 && ma.indexOf('place_token') >= 0 ? ' or ' : '') + (ma.indexOf('place_token') >= 0 ? 'place a station' : '');
      if (ent !== curEntity(g)) ttl = os(call(ent, 'name')) + ': ' + ttl; else ttl = ttl.charAt(0).toUpperCase() + ttl.slice(1);
      h += '<div class="mg"><div class="mgh">' + esc(ttl) + ': ' + (n ? 'pick one of the ' + n + ' outlined hexes on the board' : 'no hex is available') + '</div><div class="pick">' + mapPicker(J, d, targets) + '</div><div id="hexopts"></div></div>';
      E.targets = targets;
    }
    if (ma.indexOf('run_routes') >= 0) h += '<div class="mg"><div class="mgh">Run trains</div><button class="pill" id="rr-find">Find the best routes</button> <span class="note">uses the site\'s own auto-router; to draw routes by hand, use the 18xx.games page</span><div id="rr-out"></div></div>';
    return h;
  }
  function showHexOptions(J, hexId) {
    var doc = w.document, box = doc.getElementById('hexopts'); if (!box) return;
    E.selHex = hexId; Array.prototype.forEach.call(doc.querySelectorAll('.hx'), function (p) { p.classList.toggle('sel', p.getAttribute('data-hex') === hexId); });
    var g = qgame(J), ent = mapEntity(g), opts = [];
    try { opts = hexOptions(g, ent, hexId, E.targets[hexId] || ''); } catch (e) { box.innerHTML = '<p class="note">Could not read the choices: ' + esc(e.message) + '</p>'; return; }
    if (!opts.length) { box.innerHTML = '<p class="note">Nothing can be placed on ' + esc(hexId) + ' now.</p>'; return; }
    var base = E.opts.length; opts.forEach(function (o) { E.opts.push(o); });
    box.innerHTML = '<div class="mgh">' + esc(hexId) + '</div><div class="tiles">' + opts.map(function (o, k) { return o.svg ? '<button class="tilebtn jmv" data-i="' + (base + k) + '" title="' + esc(o.label) + '">' + o.svg + '</button>' : '<button class="pill jmv" data-i="' + (base + k) + '">' + esc(o.label) + '</button>'; }).join('') + '</div>';
  }
  function runRoutesUi(J) {
    var doc = w.document, out = doc.getElementById('rr-out'), b = doc.getElementById('rr-find'); if (!out) return;
    b.disabled = true; b.textContent = 'Searching…'; out.innerHTML = '<p class="note">The auto-router is looking for the best routes (up to about 30 seconds)…</p>';
    setTimeout(function () {
      findRoutes(J, function (r, err) {
        b.disabled = false; b.textContent = 'Find the best routes again';
        if (!r) { out.innerHTML = '<p class="bad">' + esc(err) + '</p>'; return; }
        var i = E.opts.length; E.opts.push({ group: 'Run trains', label: 'Run these routes (' + r.total + ')', h: r.h });
        out.innerHTML = '<ul>' + r.list.map(function (x) { return '<li><b>' + esc(x.train) + '</b>: ' + esc(x.stops.join('–')) + ' = ' + esc(String(x.rev)) + '</li>'; }).join('') + '</ul><button class="pill jmv" data-i="' + i + '">Run these routes (total ' + esc(String(r.total)) + ')</button>';
      });
    }, 30);
  }
  // self-test for map moves: was the real tile (and rotation) or station among those offered?
  function mapCheck(g, ent, a) {
    var acts = arr(g.$round().$actions_for(ent)).map(os);
    if (a.type === 'lay_tile') {
      var t = mapTargets(g, ent, acts); if (!t[a.hex] || t[a.hex].indexOf('t') < 0) return 'hex not offered';
      var o = hexOptions(g, ent, a.hex, 't'); return o.some(function (x) { return x.h.tile === a.tile && +x.h.rotation === +a.rotation; }) ? '' : 'tile/rotation not offered';
    }
    if (a.type === 'place_token') {
      var t2 = mapTargets(g, ent, acts), hexId = null;
      Object.keys(t2).forEach(function (id) { tileCities(g.$hex_by_id(id)).forEach(function (c) { if (os(c.$id()) === String(a.city)) hexId = id; }); });
      if (!hexId) return 'city not offered';
      return hexOptions(g, ent, hexId, 's').some(function (x) { return x.h.city === String(a.city); }) ? '' : 'station not offered';
    }
    return '';
  }

  // the move panel and the confirmation
  function movesHtml(d, t, me, myTurn, sup) {
    var gm = E.game, g = gm.g, step = g.$round().$active_step(), ent = null; try { ent = step.$current_entity(); } catch (e) {}
    if (!ent) return '';
    var acts = []; try { acts = arr(g.$round().$actions_for(ent)).map(os); } catch (e) { try { acts = arr(step.$actions(ent)).map(os); } catch (e2) {} }
    var opts = []; try { opts = moveOptions(g, ent, acts); } catch (e) { return '<p class="note">Could not read the choices: ' + esc(e.message) + '</p>'; }
    try { opts = opts.concat(extraOptions(g, ent)); } catch (eX) {}
    E.opts = opts;
    var other = acts.filter(function (a) { return SENDABLE.indexOf(a) < 0 && MAPACTS.indexOf(a) < 0 && ['end_game', 'message', 'undo', 'redo', 'log', 'bankrupt'].indexOf(a) < 0 && !/^program_/.test(a); });
    var groups = []; opts.forEach(function (o, i) { var gr = groups.filter(function (x) { return x.name === o.group; })[0]; if (!gr) { gr = { name: o.group, items: [] }; groups.push(gr); } gr.items.push(i); });
    var h = groups.map(function (gr) {
      var tp = opts[gr.items[0]] && opts[gr.items[0]].h && opts[gr.items[0]].h.type, hl = E.J && E.J.learnLevel() && HELP[tp] ? '<div class="help">' + esc(HELP[tp]) + '</div>' : '';
      return '<div class="mg"><div class="mgh">' + esc(gr.name) + '</div>' + hl + gr.items.map(function (i) { var o = opts[i];
        return '<span class="mo">' + (o.amount ? '<input type="number" class="amt" data-i="' + i + '" min="' + o.amount.min + '" max="' + o.amount.max + '" value="' + o.amount.min + '">' : '') + '<button class="pill jmv" data-i="' + i + '">' + esc(o.label) + '</button></span>'; }).join('') + '</div>';
    }).join('');
    try { h += mapMovesHtml(E.J, d, acts); } catch (eM) { h += '<p class="note">Could not read the map choices: ' + esc(eM.message) + '</p>'; }
    if (other.length) h += '<p class="note">Also possible now, but not in JNN-Engine yet (use the 18xx.games page): ' + other.map(function (a) { return esc(a.replace(/_/g, ' ')); }).join(', ') + '.</p>';
    var u = pageUser(), mode = !sup ? 'This title is not tested with JNN-Engine: you can try moves here, but they are never sent.' : !sendOn() ? 'Test mode: moves are checked on a copy of the game and shown, but not sent. Switch sending on above when you are ready.' : !u ? 'You are not logged in on this page, so moves are not sent.' : 'Sending is on: a move is sent to 18xx.games only after you confirm it.';
    return (h || '<p class="note">Nothing JNN-Engine can do in this step yet; use the 18xx.games page.</p>') + '<p class="note">' + esc(mode) + '</p>';
  }
  function confirmBox(J, i) {
    var doc = w.document, o = E.opts[i]; if (!o) return;
    if (o.mapUse) { E.mapEnt = o.mapUse.key ? o.mapUse : null; E.selHex = null; draw(J); return; }
    var h = JSON.parse(JSON.stringify(o.h));
    if (o.amount) { var inp = doc.querySelector('.amt[data-i="' + i + '"]'), v = Math.round(+inp.value); if (!(v >= o.amount.min && v <= o.amount.max)) { alertBox('Choose an amount between ' + o.amount.min + ' and ' + o.amount.max + '.'); return; } h[o.amount.key] = v; }
    var old = doc.getElementById('cbox'); if (old) old.remove();
    var box = doc.createElement('div'); box.id = 'cbox'; box.innerHTML = '<div class="cb"><b>Checking the move on a copy of the game…</b></div>'; doc.body.appendChild(box);
    setTimeout(function () {
      var r = null, err = null; try { r = dryRun(J, JSON.stringify(E.game.raw), h); } catch (e) { err = e.message || String(e); }
      var u = pageUser(), sup = SUPPORTED.indexOf(E.game.raw.title) >= 0, pinned = !!(E.game.raw.settings && E.game.raw.settings.pin);
      var mine = r && u && r.actors.indexOf(u.id) >= 0, canSend = !err && !E.fixed && sendOn() && sup && !pinned && mine && E.game.raw.status !== 'finished';
      var why = err ? '' : E.fixed ? 'this is a test preview of an earlier position' : !sup ? 'not a tested title' : pinned ? 'pinned games are not supported' : !sendOn() ? 'test mode is on' : !u ? 'you are not logged in on this page' : !mine ? 'it is not your move (only the player whose turn it is may make it)' : '';
      var risky = !err && r && r.warns.some(function (x) { return x.lv === 'warn'; });
      box.innerHTML = '<div class="cb"><h3>' + esc(o.label) + '</h3>' + (err ? '<p class="bad">The rules engine does not allow this move: ' + esc(err) + '</p>' :
        (r.warns.length ? '<div class="warns">' + r.warns.map(function (x) { return '<p class="' + (x.lv === 'warn' ? 'wn' : 'wi') + '">' + (x.lv === 'warn' ? '⚠ ' : 'ℹ ') + esc(x.t) + '</p>'; }).join('') + '</div>' : '') +
        '<p>This is what will happen:</p><ul>' + r.log.map(function (l) { var why = null; if (J.learnLevel() && E.d) { try { why = J.whyLine(E.d, l); } catch (e) {} } return '<li>' + esc(l) + (why ? '<br><small class="why">' + esc(why) + '</small>' : '') + '</li>'; }).join('') + '</ul><details><summary>What would be sent</summary><pre>' + esc(JSON.stringify(r.json, null, 1)) + '</pre></details>') +
        '<p class="note">' + (canSend ? 'Press Send to make this move on 18xx.games. It is checked again against the latest game first.' : err ? '' : 'Not sent: ' + esc(why) + '.') + '</p>' +
        (canSend && risky ? '<label class="ack"><input type="checkbox" id="cb-ack"> I have read the warnings above</label>' : '') +
        '<div class="cbb">' + (canSend ? '<button class="pill go" id="cb-send"' + (risky ? ' disabled' : '') + '>Send</button>' : '') + '<button class="pill" id="cb-x">' + (canSend ? 'Cancel' : 'Close') + '</button></div></div>';
      doc.getElementById('cb-x').onclick = function () { box.remove(); };
      var ack = doc.getElementById('cb-ack'); if (ack) ack.onchange = function () { var sb2 = doc.getElementById('cb-send'); if (sb2) sb2.disabled = !ack.checked; };
      var sb = doc.getElementById('cb-send');
      if (sb) sb.onclick = function () {
        sb.disabled = true; sb.textContent = 'Sending…';
        var n0 = E.game.raw.actions.length;
        J.fetchGameText(gid).then(function (text) {
          var fresh = JSON.parse(text); if (fresh.actions.length !== n0) throw new Error('the game has moved on since you chose this move; look again and choose again');
          var r2 = dryRun(J, text, h); if (r2.actors.indexOf(u.id) < 0) throw new Error('it is no longer your move');
          return postAction(r2.json);
        }).then(function () { box.innerHTML = '<div class="cb"><b>Sent.</b> The window updates in a moment.</div>'; setTimeout(function () { try { box.remove(); } catch (e) {} }, 1500); cycle(true); },
          function (e) { box.innerHTML = '<div class="cb"><p class="bad">Not sent: ' + esc(e.message || e) + '</p><p class="note">Nothing changed on 18xx.games. You can always make the move on the site.</p><div class="cbb"><button class="pill" id="cb-x2">Close</button></div></div>'; doc.getElementById('cb-x2').onclick = function () { box.remove(); }; cycle(true); });
      };
    }, 30);
  }
  function alertBox(msg) { var doc = w.document, b = doc.createElement('div'); b.id = 'cbox'; b.innerHTML = '<div class="cb"><p>' + esc(msg) + '</p><div class="cbb"><button class="pill" id="cb-x">Close</button></div></div>'; var old = doc.getElementById('cbox'); if (old) old.remove(); doc.body.appendChild(b); doc.getElementById('cb-x').onclick = function () { b.remove(); }; }

  // ---------- drawing ----------
  var CSS_EXTRA = [
    'body{margin:0}header.je{position:sticky;top:0;z-index:5;background:var(--surface-0);border-bottom:1px solid var(--grid);padding:8px 14px}',
    '.je h1{font-size:18px;margin:0 8px 0 0;display:inline}.je .kv{margin-right:12px;font-size:13px}.je .ro{display:inline-block;font-size:11px;padding:2px 8px;border-radius:10px;background:var(--grid);margin-left:6px}',
    '.jw{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(300px,1fr);gap:12px;padding:12px}@media (max-width:900px){.jw{grid-template-columns:1fr}}',
    '.jcol{display:flex;flex-direction:column;gap:12px;min-width:0}.jb svg{width:100%;height:auto}',
    '.act{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}.act button{opacity:.6;cursor:not-allowed}',
    '.yt{border:2px solid var(--accent);border-radius:12px}.note{font-size:12px;color:var(--text-secondary)}',
    '.mine td{font-weight:650}.ft{padding:4px 14px 14px;font-size:11.5px;color:var(--text-muted)}',
    '.mg{margin:6px 0}.mgh{font-size:11.5px;color:var(--text-secondary);margin-bottom:3px}.mo{display:inline-flex;gap:4px;margin:0 6px 6px 0;align-items:center}.amt{width:80px;padding:3px 5px;border-radius:6px;border:1px solid var(--grid);background:var(--surface-1);color:var(--text-primary)}',
    '#cbox{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:flex-start;justify-content:center;z-index:50;padding-top:8vh}.cb{background:var(--surface-1);border:1px solid var(--grid);border-radius:12px;padding:14px 18px;max-width:560px;width:92%;max-height:80vh;overflow:auto;box-shadow:0 10px 30px rgba(0,0,0,.35)}',
    '.cb h3{margin:0 0 8px}.cb pre{font-size:11px;white-space:pre-wrap}.cbb{display:flex;gap:8px;justify-content:flex-end;margin-top:8px}.go{background:var(--accent)!important;color:#fff!important}.bad{color:#d9534f}',
    '.sendsw{cursor:pointer;margin-left:6px}.sendsw.on{background:#2e9e5b;color:#fff}',
    '.warns{margin:6px 0}.warns p{margin:4px 0;padding:5px 8px;border-radius:6px}.wn{background:rgba(214,51,108,.14);border-left:3px solid #d6336c}.wi{background:rgba(57,135,229,.12);border-left:3px solid #3987e5}',
    '.why{color:var(--text-secondary)}.help{color:var(--text-secondary);font-size:12.5px;margin:0 0 5px}.ack{display:block;margin:6px 0}',
    '.pick svg{width:100%;height:auto}.hx{fill:rgba(57,135,229,.18);stroke:#3987e5;stroke-width:2.2;cursor:pointer}.hx:hover{fill:rgba(57,135,229,.38)}.hx.sel{fill:rgba(46,158,91,.4);stroke:#2e9e5b;stroke-width:3}',
    '.tiles{display:flex;flex-wrap:wrap;gap:6px}.tilebtn{background:var(--surface-0);border:1px solid var(--grid);border-radius:8px;padding:2px;cursor:pointer}.tilebtn:hover{border-color:var(--accent)}'
  ].join('\n');
  var ACT = { pass: 'Pass', bid: 'Bid', par: 'Start a company', buy_shares: 'Buy shares', sell_shares: 'Sell shares', lay_tile: 'Lay a tile', place_token: 'Place a station',
    run_routes: 'Run trains', dividend: 'Pay out or withhold', buy_train: 'Buy a train', buy_company: 'Buy a private', discard_train: 'Discard a train', bankrupt: 'Go bankrupt',
    take_loan: 'Take a loan', payoff_loan: 'Repay a loan', short: 'Short', choose: 'Choose', assign: 'Assign', convert: 'Convert', merge: 'Merge', sell_company: 'Sell a private' };

  function draw(J) {
    var gm = E.game, d = E.d = J.extract(gm.g, gm.raw), doc = w.document, dark = J.isDark(w), m = d.money;
    J.setDark(dark);
    var names = d.players.map(function (p) { return p.name; }), me = J.myName(names), pal = J.palette(dark);
    var pc = {}; d.players.forEach(function (p) { pc[p.name] = pal[p.idx % pal.length]; });
    var sup = SUPPORTED.indexOf(d.title) >= 0, t = d.live && d.live.turn, acting = t ? (t.entType === 'player' ? t.entity : t.owner) : null, myTurn = !!(me && acting === me);
    var sw = function (c) { return '<i class="sw" style="background:' + esc(c) + '"></i>'; };
    var h = [];
    h.push('<header class="je"><h1>' + esc(d.title) + '</h1><span class="ro">JNN-Engine</span><span class="ro sendsw' + (sendOn() ? ' on' : '') + '" id="sendsw" title="When on, a move you confirm is sent to 18xx.games. When off (test mode), moves are only checked on a copy.">Sending moves: ' + (sendOn() ? 'on' : 'off (test mode)') + '</span>' + (J.privacyOn() ? '<span class="ro">🕶 private</span>' : '') + '<br>' +
      '<span class="kv">Round <b>' + esc(d.roundLabel) + '</b></span><span class="kv">Phase <b>' + esc(d.phase) + '</b></span><span class="kv">Bank <b>' + esc(d.primer && d.primer.bankUnlimited ? 'unlimited' : m(d.bank)) + '</b></span>' +
      (d.nextTrain ? '<span class="kv">Next train <b>' + esc(d.nextTrain.name) + ' ' + esc(m(d.nextTrain.price)) + '</b></span>' : '') +
      (d.finished ? '<span class="kv"><b>Game over</b></span>' : acting ? '<span class="kv">To act: ' + (pc[acting] ? sw(pc[acting]) : '') + '<b>' + esc(acting) + '</b>' + (t.entType !== 'player' ? ' for ' + esc(t.entity) : '') + (myTurn ? ' · <b style="color:var(--accent)">your turn</b>' : '') + '</span>' : '') + '</header>');
    if (J.learnLevel()) h.push(J.roundBanner(d, me));
    h.push('<div class="jw"><div class="jcol">');
    // the board
    h.push('<section class="card wide jb"><h2>Board</h2>' + J.boardSvg(d, null, [], 1400) + '</section>');
    h.push('<section class="card wide"><h2>Stock market</h2>' + J.marketHtml(d, dark, me, (d.gridHist || []).length - 1, m) + '</section>');
    h.push('</div><div class="jcol">');
    // moves now
    if (!d.finished && t) {
      h.push('<section class="card' + (myTurn ? ' yt' : '') + '"><h2>' + (myTurn ? 'Your turn' : 'Now') + '</h2><p class="sub">' + esc(t.entity) + (t.desc ? ': ' + esc(t.desc) : '') + '</p>' + movesHtml(d, t, me, myTurn, sup) + '</section>');
      if (J.learnLevel()) h.push('<section class="card">' + J.yourTurnHtml(d, me, m) + '</section>');
    }
    // you
    var P = d.players.slice().sort(function (a, b) { return b.value - a.value; });
    if (me) {
      var mp = d.players.filter(function (p) { return p.name === me; })[0], row = (d.holdings && d.holdings.rows || []).filter(function (r) { return r.name === me; })[0];
      var mine = d.corps.filter(function (c) { return c.president === me && !c.closed; });
      h.push('<section class="card"><h2>You: ' + esc(me) + '</h2><p class="sub">Cash <b>' + esc(m(mp.cash)) + '</b> · value <b>' + esc(m(mp.value)) + '</b> · certificates <b>' + mp.certs + (mp.certLimit ? ' / ' + mp.certLimit : '') + '</b> · place <b>' + (P.indexOf(mp) + 1) + ' of ' + P.length + '</b></p>' +
        (row ? '<div class="tw"><table class="tight"><thead><tr><th style="text-align:left">Company</th><th>Share</th><th>Value</th></tr></thead><tbody>' + Object.keys(row.cells).map(function (cn) { var c = row.cells[cn]; return '<tr><td style="text-align:left">' + esc(cn) + (c.pres ? ' ★' : '') + '</td><td>' + c.pct + '%</td><td>' + esc(m(c.val)) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '') +
        (mine.length ? '<h3 class="rh">Companies you run</h3><div class="tw"><table class="tight"><thead><tr><th style="text-align:left">Company</th><th>Price</th><th>Cash</th><th>Trains</th></tr></thead><tbody>' + mine.map(function (c) { return '<tr><td style="text-align:left">' + sw(c.color) + esc(c.name) + '</td><td>' + esc(c.price != null ? m(c.price) : '–') + '</td><td>' + esc(m(c.cash)) + '</td><td>' + esc(c.trains.map(function (x) { return x.name; }).join(', ') || 'none') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '') + '</section>');
    } else h.push('<section class="card"><h2>You</h2><p class="sub">Pick your name under <b>I am</b> in the JNN-stats ⋯ menu; JNN-Engine uses the same setting.</p></section>');
    // players
    h.push('<section class="card"><h2>Players</h2><div class="tw"><table class="tight"><thead><tr><th style="text-align:left">Player</th><th>Value</th><th>Cash</th><th>Certs</th></tr></thead><tbody>' +
      P.map(function (p) { return '<tr' + (p.name === me ? ' class="mine"' : '') + '><td style="text-align:left">' + sw(pc[p.name]) + esc(p.name) + (p.name === acting ? ' ▶' : '') + '</td><td>' + esc(m(p.value)) + '</td><td>' + esc(m(p.cash)) + '</td><td>' + p.certs + '</td></tr>'; }).join('') + '</tbody></table></div></section>');
    // companies
    var open = d.corps.filter(function (c) { return !c.closed && c.floated !== false; });
    if (open.length) h.push('<section class="card"><h2>Companies</h2><div class="tw"><table class="tight"><thead><tr><th style="text-align:left">Company</th><th>President</th><th>Price</th><th>Cash</th><th>Trains</th></tr></thead><tbody>' +
      open.map(function (c) { return '<tr><td style="text-align:left">' + sw(c.color) + esc(c.name) + '</td><td>' + esc(c.president || '–') + '</td><td>' + esc(c.price != null ? m(c.price) : '–') + '</td><td>' + esc(m(c.cash)) + '</td><td>' + esc(c.trains.map(function (x) { return x.name; }).join(', ') || 'none') + '</td></tr>'; }).join('') + '</tbody></table></div></section>');
    h.push('</div></div>');
    h.push('<div class="ft">JNN-Engine ' + VERSION + ' · built on 18xx-JNNstats ' + esc(J.version) + ' (JNN-API ' + esc(J.apiVersion) + ')' + (E.pinned ? ' · using the newest JNN-stats release known to fit this JNN-Engine' : '') +
      ' · ' + (sup ? 'tested title' : 'title not tested with JNN-Engine yet: moves are never sent') + ' · updated ' + new Date().toLocaleTimeString() + ' · the 18xx.games page is always the place to play if anything here looks wrong.</div>');
    var y = w.scrollY || 0;
    if (!doc.getElementById('jcss')) { doc.head.innerHTML = '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JNN-Engine</title><style id="jcss"></style><style id="jcss2"></style>'; }
    doc.title = (myTurn ? '● Your turn · ' : '') + d.title + ' · JNN-Engine';
    doc.getElementById('jcss').textContent = J.css(); doc.getElementById('jcss2').textContent = CSS_EXTRA;
    doc.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    doc.body.innerHTML = h.join('');
    w.scrollTo(0, y);
    doc.body.onclick = function (ev) {
      var b = ev.target.closest && ev.target.closest('button.jmv'); if (b) { confirmBox(J, +b.getAttribute('data-i')); return; }
      var hx = ev.target.closest && ev.target.closest('.hx'); if (hx) { showHexOptions(J, hx.getAttribute('data-hex')); return; }
      if (ev.target.id === 'rr-find') { runRoutesUi(J); return; }
      if (ev.target.id === 'sendsw') {
        if (!sendOn()) {
          if (!w.confirm('Switch sending on?\n\nWhen on, a move you confirm in JNN-Engine is sent to 18xx.games as you, exactly as if you had made it on the site. Every move is checked on a copy of the game first. You can switch it off again at any time.')) return;
          setSend(true);
        } else setSend(false);
        draw(J);
      }
    };
  }

  function cycle(force) {
    if (!w || w.closed) { clearInterval(E.timer); unsubscribe(); return Promise.resolve(); }
    if (E.busy) return E.busy;
    E.busy = pickStats().then(loadStats).then(function (J) {
      var before = E.game ? E.game.raw.actions.length : -1;
      return load(J).then(function () { if (force || !E.game || E.game.raw.actions.length !== before || !E.drawn) { draw(J); E.drawn = true; } });
    }).catch(function (e) { status('JNN-Engine could not show this game: ' + (e && e.message || e) + '. You can always play on the 18xx.games page.'); })
      .then(function () { E.busy = null; });
    return E.busy;
  }
  try { w.document.title = 'JNN-Engine'; } catch (e) {}
  status('JNN-Engine is loading the game…');
  E.drawn = false; E.game = null;
  cycle(true);
  // New moves arrive through the site's own push channel (the page already listens to it), so no extra
  // requests are needed; a full fetch happens only when something does not line up, plus a slow backup check.
  function onBus(msg) {
    try {
      if (E.fixed) return;
      var a = msg && (msg.type ? msg : null); if (!a || !E.game || !E.J) { later(); return; }
      var last = E.game.raw.actions.length ? E.game.raw.actions[E.game.raw.actions.length - 1].id : 0;
      if (a.id === last + 1 && a.type !== 'undo' && a.type !== 'redo' && E.J.applyActions(E.game.g, [a])) { E.game.raw.actions.push(a); E.q = null; draw(E.J); }
      else later();
    } catch (e) { later(); }
  }
  var laterT = null; function later() { if (laterT) return; laterT = setTimeout(function () { laterT = null; cycle(true); }, 1500); }
  function unsubscribe() { try { if (E.subFn && window.MessageBus) window.MessageBus.unsubscribe('/game/' + gid, E.subFn); } catch (e) {} E.subFn = null; }
  function subscribe() {
    var MB = window.MessageBus; if (!MB || !MB.subscribe) return;
    if (E.subFn && (MB.callbacks || []).some(function (c) { return c.func === E.subFn; })) return;
    try {
      var ch = '/game/' + gid, last = -1; (MB.callbacks || []).forEach(function (c) { if (c.channel === ch && c.last_id != null) last = c.last_id; });
      if (E.subFn) { try { MB.unsubscribe(ch, E.subFn); } catch (e) {} }
      E.subFn = function (m2) { onBus(m2); }; MB.subscribe(ch, E.subFn, last);
    } catch (e) {}
  }
  subscribe();
  E.timer = setInterval(function () { subscribe(); cycle(false); }, REFRESH_MS);
})();
