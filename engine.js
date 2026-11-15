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
  var VERSION = '0.2.0';
  var API_MAJOR = '1';                 // the JNN-API major version this code is written for
  var API_MIN = '1.1';                 // the oldest minor version it can use
  var FALLBACK_SHA = '5c17e79';        // a JNN-stats release known to work, used if the latest is incompatible
  var STATS_CDN = 'https://cdn.jsdelivr.net/gh/mvhjim/18xx-jnnstats@';
  var REFRESH_MS = 10000;
  // Titles tested with JNN-Engine. Others are shown, but sending moves (in later versions) stays off.
  var SUPPORTED = ['1846', '1862', 'The Old Prince 1871', '1849: Kingdom of the Two Sicilies'];

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
  function os(o) { return nil(o) ? '' : String(o); }
  // Opal defines a stub for every method name on every object, so ask the object itself (respond_to?)
  function has(o, m) { if (nil(o)) return false; try { if (typeof o['$respond_to?'] === 'function') return !!o['$respond_to?'](m); } catch (e) {} return typeof o['$' + m] === 'function'; }
  function call(o, m) { var a = Array.prototype.slice.call(arguments, 2); if (!has(o, m)) return null; try { var r = o['$' + m].apply(o, a); return nil(r) ? null : r; } catch (e) { return null; } }
  function arr(o) { if (nil(o)) return []; if (Array.isArray(o)) return o; if (has(o, 'to_a')) return o.$to_a(); return []; }
  function num(o) { var v = nil(o) ? null : Number(o); return v == null || isNaN(v) ? null : v; }
  function hget(h, k) { if (nil(h)) return null; try { var v = h['$[]'](k); if (nil(v) && Opal.Symbol) v = null; return nil(v) ? null : v; } catch (e) { return null; } }
  var SENDABLE = ['pass', 'bid', 'par', 'buy_shares', 'sell_shares', 'dividend', 'buy_train'];
  // the options for one entity in the current step; each is { group, label, h: action JSON (without id), amount?: {min, max, key} }
  function moveOptions(g, entity, acts) {
    var out = [], round = g.$round(), active = round.$active_step(), step = active, id = os(call(entity, 'id')), etype = call(entity, 'player?') ? 'player' : call(entity, 'corporation?') ? 'corporation' : call(entity, 'minor?') ? 'minor' : call(entity, 'company?') ? 'company' : 'player';
    var base = function (type) { return { type: type, entity: isNaN(+id) ? id : +id, entity_type: etype }; };
    var money = function (v) { try { return os(g.$format_currency(v)); } catch (e) { return String(v); } };
    var add = function (group, label, h, amount) { out.push({ group: group, label: label, h: h, amount: amount || null }); };
    var can = function (a) { if (acts.indexOf(a) < 0) return false; var st = null; try { st = round.$step_for(entity, a); } catch (e) {} step = nil(st) ? active : st; return true; };
    if (can('pass')) add('Pass', 'Pass', base('pass'));
    if (can('buy_shares')) {
      g.$corporations().forEach(function (c) {
        // like the site: shares are offered only for companies that have been started (a new company is started with "Start a company")
        if (!call(c, 'ipoed') && !call(c, 'floated?')) return;
        var cn = os(c.$name()), seen = {};
        var tryShare = function (sh, src) {
          if (nil(sh)) return; var b = sh.$to_bundle(), pct = num(b.$percent()), key = src + pct;
          if (seen[key]) return;
          try { if (!step['$can_buy?'](entity, b)) return; } catch (e) { return; }
          seen[key] = 1;
          var h = base('buy_shares'); h.shares = [os(sh.$id())]; h.percent = pct; h.share_price = num(call(b, 'share_price')) || undefined;
          add('Buy shares', 'Buy ' + pct + '% of ' + cn + ' from the ' + src + ' (' + money(b.$price()) + ')', h);
        };
        try { arr(c.$ipo_shares()).filter(function (s) { return call(s, 'buyable') !== false; }).forEach(function (s) { tryShare(s, os(g.$ipo_name(c)) || 'IPO'); }); } catch (e) {}
        try { arr(g.$share_pool().$shares_by_corporation()['$[]'](c)).forEach(function (s) { tryShare(s, 'market'); }); } catch (e) {}
        try { if (!call(c, 'ipo_is_treasury?')) arr(call(c, 'treasury_shares')).filter(function (s) { return call(s, 'buyable') !== false; }).forEach(function (s) { tryShare(s, 'treasury'); }); } catch (e) {}
      });
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
        try { if (!g['$can_par?'](c, entity)) return; } catch (e) { return; }
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
            add('Buy a train', 'Buy a ' + os(vn) + ' from the bank (' + money(price) + ')', h);
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
      cos.forEach(function (co) {
        var tp = call(co, 'company?') ? 'company' : call(co, 'minor?') ? 'minor' : 'corporation', h = base('bid'); h[tp] = os(co.$id());
        if (has(step, 'min_bid')) {
          var min = null, max = null; try { min = num(step.$min_bid(co)); } catch (e) {} try { max = num(step.$max_bid(entity, co)); } catch (e) {}
          if (min == null) return; h.price = min;
          add('Bid', 'Bid on ' + os(co.$name()) + ' (at least ' + money(min) + ')', h, { key: 'price', min: min, max: max != null ? max : min });
        } else {
          // a draft: take the company at its own price
          var pr = num(call(co, 'value')); if (pr == null) pr = 0; h.price = pr;
          add('Take a company', 'Take ' + os(co.$name()) + (pr ? ' (' + money(pr) + ')' : ''), h);
        }
      });
    }
    return out;
  }
  // Try a move on a fresh copy of the game: the new log lines, the JSON the page would send, or the engine's reason it is not allowed
  function dryRun(J, text, h) {
    var g = J.loadGame(text), before = arr(g.$log()).length;
    var action = Opal.Engine.Action.Base.$action_from_h(Opal.JSON.$parse(JSON.stringify(h)), g);
    var g2 = g.$process_action(action, Opal.hash({ add_auto_actions: true }));
    var ex = call(g2, 'exception'); if (ex) throw new Error(os(call(ex, 'message')) || os(ex));
    var log = arr(g2.$log()).slice(before).map(function (l) { return os(call(l, 'message')); }).filter(Boolean);
    var json = action.$to_h().$to_n(), actors = []; try { actors = arr(g.$valid_actors(action)).map(function (p) { return num(p.$id()); }); } catch (e) {}
    return { log: log, json: json, actors: actors };
  }
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
    var same = function (h, a) {
      if (h.type !== a.type || String(h.entity) !== String(a.entity)) return false;
      var keys = { buy_shares: ['shares'], sell_shares: ['shares'], par: ['corporation', 'share_price'], dividend: ['kind'], buy_train: ['train', 'variant'], bid: ['company', 'minor', 'corporation'], pass: [] }[h.type] || [];
      return keys.every(function (k) { var x = h[k], y = a[k]; if (k === 'shares') return shareKey(x) === shareKey(y); if (k === 'variant' && (y == null || x === y)) return true; return x == null && y == null || String(x) === String(y); });
    };
    eff.forEach(function (a) {
      k++;
      if (SENDABLE.indexOf(a.type) >= 0 && a.type !== 'message') {
        n++;
        try {
          var ent = g.$get(a.entity_type, a.entity), acts = arr(g.$round().$actions_for(ent)).map(os);
          var match = moveOptions(g, ent, acts).filter(function (o) { return same(o.h, a); })[0], found = !!match;
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
  E.selfTest = function (id) { return pickStats().then(loadStats).then(function (J) { return J.fetchGameText(id || gid).then(function (t) { var raw = JSON.parse(t); return J.ensureTitle(raw.title).then(function () { return selfTest(J, t); }); }); }); };

  // the move panel and the confirmation
  function movesHtml(d, t, me, myTurn, sup) {
    var gm = E.game, g = gm.g, step = g.$round().$active_step(), ent = null; try { ent = step.$current_entity(); } catch (e) {}
    if (!ent) return '';
    var acts = []; try { acts = arr(g.$round().$actions_for(ent)).map(os); } catch (e) { try { acts = arr(step.$actions(ent)).map(os); } catch (e2) {} }
    var opts = []; try { opts = moveOptions(g, ent, acts); } catch (e) { return '<p class="note">Could not read the choices: ' + esc(e.message) + '</p>'; }
    E.opts = opts;
    var other = acts.filter(function (a) { return SENDABLE.indexOf(a) < 0 && ['end_game', 'message', 'undo', 'redo', 'log', 'bankrupt'].indexOf(a) < 0 && !/^program_/.test(a); });
    var groups = []; opts.forEach(function (o, i) { var gr = groups.filter(function (x) { return x.name === o.group; })[0]; if (!gr) { gr = { name: o.group, items: [] }; groups.push(gr); } gr.items.push(i); });
    var h = groups.map(function (gr) {
      return '<div class="mg"><div class="mgh">' + esc(gr.name) + '</div>' + gr.items.map(function (i) { var o = opts[i];
        return '<span class="mo">' + (o.amount ? '<input type="number" class="amt" data-i="' + i + '" min="' + o.amount.min + '" max="' + o.amount.max + '" value="' + o.amount.min + '">' : '') + '<button class="pill mv" data-i="' + i + '">' + esc(o.label) + '</button></span>'; }).join('') + '</div>';
    }).join('');
    if (other.length) h += '<p class="note">Also possible now, but not in JNN-Engine yet (use the 18xx.games page): ' + other.map(function (a) { return esc(a.replace(/_/g, ' ')); }).join(', ') + '.</p>';
    var u = pageUser(), mode = !sup ? 'This title is not tested with JNN-Engine: you can try moves here, but they are never sent.' : !sendOn() ? 'Test mode: moves are checked on a copy of the game and shown, but not sent. Switch sending on above when you are ready.' : !u ? 'You are not logged in on this page, so moves are not sent.' : 'Sending is on: a move is sent to 18xx.games only after you confirm it.';
    return (h || '<p class="note">Nothing JNN-Engine can do in this step yet; use the 18xx.games page.</p>') + '<p class="note">' + esc(mode) + '</p>';
  }
  function confirmBox(J, i) {
    var doc = w.document, o = E.opts[i]; if (!o) return;
    var h = JSON.parse(JSON.stringify(o.h));
    if (o.amount) { var inp = doc.querySelector('.amt[data-i="' + i + '"]'), v = Math.round(+inp.value); if (!(v >= o.amount.min && v <= o.amount.max)) { alertBox('Choose an amount between ' + o.amount.min + ' and ' + o.amount.max + '.'); return; } h[o.amount.key] = v; }
    var old = doc.getElementById('cbox'); if (old) old.remove();
    var box = doc.createElement('div'); box.id = 'cbox'; box.innerHTML = '<div class="cb"><b>Checking the move on a copy of the game…</b></div>'; doc.body.appendChild(box);
    setTimeout(function () {
      var r = null, err = null; try { r = dryRun(J, JSON.stringify(E.game.raw), h); } catch (e) { err = e.message || String(e); }
      var u = pageUser(), sup = SUPPORTED.indexOf(E.game.raw.title) >= 0, pinned = !!(E.game.raw.settings && E.game.raw.settings.pin);
      var mine = r && u && r.actors.indexOf(u.id) >= 0, canSend = !err && sendOn() && sup && !pinned && mine && E.game.raw.status !== 'finished';
      var why = err ? '' : !sup ? 'not a tested title' : pinned ? 'pinned games are not supported' : !sendOn() ? 'test mode is on' : !u ? 'you are not logged in on this page' : !mine ? 'it is not your move (only the player whose turn it is may make it)' : '';
      box.innerHTML = '<div class="cb"><h3>' + esc(o.label) + '</h3>' + (err ? '<p class="bad">The rules engine does not allow this move: ' + esc(err) + '</p>' :
        '<p>This is what will happen:</p><ul>' + r.log.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul><details><summary>What would be sent</summary><pre>' + esc(JSON.stringify(r.json, null, 1)) + '</pre></details>') +
        '<p class="note">' + (canSend ? 'Press Send to make this move on 18xx.games. It is checked again against the latest game first.' : err ? '' : 'Not sent: ' + esc(why) + '.') + '</p>' +
        '<div class="cbb">' + (canSend ? '<button class="pill go" id="cb-send">Send</button>' : '') + '<button class="pill" id="cb-x">' + (canSend ? 'Cancel' : 'Close') + '</button></div></div>';
      doc.getElementById('cb-x').onclick = function () { box.remove(); };
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
    '.sendsw{cursor:pointer;margin-left:6px}.sendsw.on{background:#2e9e5b;color:#fff}'
  ].join('\n');
  var ACT = { pass: 'Pass', bid: 'Bid', par: 'Start a company', buy_shares: 'Buy shares', sell_shares: 'Sell shares', lay_tile: 'Lay a tile', place_token: 'Place a station',
    run_routes: 'Run trains', dividend: 'Pay out or withhold', buy_train: 'Buy a train', buy_company: 'Buy a private', discard_train: 'Discard a train', bankrupt: 'Go bankrupt',
    take_loan: 'Take a loan', payoff_loan: 'Repay a loan', short: 'Short', choose: 'Choose', assign: 'Assign', convert: 'Convert', merge: 'Merge', sell_company: 'Sell a private' };

  function draw(J) {
    var gm = E.game, d = J.extract(gm.g, gm.raw), doc = w.document, dark = J.isDark(w), m = d.money;
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
      var b = ev.target.closest && ev.target.closest('button.mv'); if (b) { confirmBox(J, +b.getAttribute('data-i')); return; }
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
    if (!w || w.closed) { clearInterval(E.timer); return Promise.resolve(); }
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
  E.timer = setInterval(function () { cycle(false); }, REFRESH_MS);
})();
