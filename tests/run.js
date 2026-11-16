/* JNN-Engine automatic tests on copies of real games (J7).
   Open any game on 18xx.games, open JNN-Engine (the bookmark), then paste this into the browser console.
   Optional before pasting:
     window.__JNN_TEST_IDS = [finished game numbers]       // otherwise finished games are picked per title
     window.__JNN_TEST_PER_TITLE = 2                         // how many games per title when picking
   It reads only (nothing is sent) and waits a few seconds between games, to go easy on the server.
   Results: window.__jnnTestRows (one row per game) and a summary table in the console. */
(function () {
  var E = window.__jnnEngine;
  if (!E || !E.testGame) { console.error('Open JNN-Engine on this page first.'); return; }
  var TITLES = ['1817', '1846', '1862', 'The Old Prince 1871', '1849: Kingdom of the Two Sicilies'];
  var per = window.__JNN_TEST_PER_TITLE || 2;
  // a pause that also works in a hidden window (where timers run only about once a minute)
  var pause = function (ms) { return new Promise(function (r) { var end = Date.now() + ms, mc = new MessageChannel(); mc.port1.onmessage = function () { if (Date.now() >= end) r(); else setTimeout(function () { mc.port2.postMessage(0); }, 50); }; mc.port2.postMessage(0); }); };
  window.__jnnTestRows = []; window.__jnnTestDone = false;
  (async function () {
    var ids = window.__JNN_TEST_IDS;
    if (!ids) {
      ids = [];
      for (var t = 0; t < TITLES.length; t++) {
        try {
          var r = await (await fetch('/api/game?title=' + encodeURIComponent(TITLES[t]), { credentials: 'same-origin' })).json();
          (r.games || []).filter(function (g) { return g.status === 'finished'; }).slice(0, per).forEach(function (g) { ids.push(g.id); });
        } catch (e) { console.warn('Could not list ' + TITLES[t] + ': ' + e.message); }
        await pause(1500);
      }
    }
    for (var i = 0; i < ids.length; i++) {
      var row = { n: i + 1 };
      try {
        var x = await E.testGame(ids[i]);
        row.title = x.title;
        row.moves = x.self.found + '/' + x.self.moves;
        row.missing = Object.keys(x.self.missingByType).map(function (k) { return k + ' ' + x.self.missingByType[k]; }).join(', ') || '-';
        row.replay = x.self.replayed;
        row.choices = x.options.ok + '/' + (x.options.tried - (x.options.late || 0)) + ' at ' + x.options.positions + ' positions' + (x.options.late ? ' (+' + x.options.late + ' tiles refused on laying, as on the site)' : '');
        row.refused = Object.keys(x.options.byType).map(function (k) { return k + ' ' + x.options.byType[k]; }).join(', ') || '-';
        row.ok = x.self.found === x.self.moves && x.options.ok === x.options.tried - (x.options.late || 0) && !x.self.replayDiffs.length;
        row._detail = { missing: x.self.missing, replayDiffs: x.self.replayDiffs, refused: x.options.bad };
      } catch (e) { row.error = e.message; row.ok = false; }
      window.__jnnTestRows.push(row);
      console.log('JNN-Engine test ' + (i + 1) + '/' + ids.length + ': ' + (row.title || '') + ' ' + (row.ok ? 'OK' : 'CHECK'));
      await pause(3000);
    }
    window.__jnnTestDone = true;
    console.table(window.__jnnTestRows.map(function (r) { var c = Object.assign({}, r); delete c._detail; return c; }));
  })();
})();
