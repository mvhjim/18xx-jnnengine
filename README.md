# 18xx-JNNengine

A JNN game window for [18xx.games](https://18xx.games): the game drawn the JNN way, in its own window beside the site and beside [18xx-JNNstats](https://github.com/mvhjim/18xx-jnnstats).

**Status: 0.2.0.** Shows the game and can make the simple moves (pass, shares, starting a company, bids, dividends, trains). **Sending is off by default:** in test mode every move is checked on a copy of the game and shown, but nothing is sent. Tiles, stations and routes still go on the 18xx.games page.

## Use

1. Create a bookmark and paste the contents of [bookmarklet.txt](bookmarklet.txt) as its address.
2. Open a game on 18xx.games and click the bookmark. JNN-Engine opens in its own window (allow pop-ups for 18xx.games if your browser asks).
3. Pick your name under **I am** in the JNN-stats ⋯ menu: JNN-Engine uses the same settings (I am, privacy mode, Learning mode, colours).

The 18xx.games page stays exactly as it is. If JNN-Engine ever fails or shows something wrong, play on the site.

## Making moves

- Press a move in the **Your turn** card. JNN-Engine tries it on a copy of the game and shows exactly what will happen.
- To really make moves from JNN-Engine, click **Sending moves: off** in the header and confirm. It stays on until you switch it off.
- A move is sent only when you are logged in on the 18xx.games page, it is your move according to the rules engine, the title is a tested one and the game is not a pinned one. Just before sending, the game is fetched again; if anyone moved in between, nothing is sent and you choose again.
- Undo works as usual on the 18xx.games page.

## How it relates to JNN-stats

JNN-Engine contains no game logic of its own. It loads the released 18xx-JNNstats code through its read-only programming interface ([JNN-API](https://github.com/mvhjim/18xx-jnnstats/blob/main/docs/API.md)) and the site's own rules engine:

- it reads JNN-stats' `version.js`, checks that the API version fits (major version 1), and loads exactly that release, so it follows JNN-stats updates;
- if a JNN-stats release ever changes the API in a way that could break JNN-Engine, it stays on a known-good release until JNN-Engine is updated.

## Tested titles

1846, 1862, The Old Prince 1871 and 1849: Kingdom of the Two Sicilies. Other titles are shown, but will stay view only until they are tested.

## Plan

| Tranche | What |
|---|---|
| J2 (0.1) | View only: board, market, your position, players, companies, the moves allowed now |
| J3 (0.2) | Simple moves: pass, bid, start a company, buy and sell shares, pay out or withhold, buy trains; each tried on a copy first and confirmed; sending off by default |
| J4 | Map moves: tiles (only legal tiles and rotations), stations, routes (suggested by the site's own auto-router) |
| J5 | Special cases: private company powers, emergency train buys, title-specific steps |
| J6 | Learning built in: explanations beside the buttons and warnings before risky moves |
| J7 | Automatic tests on copies of real games, then a beta with friends |

## Security

- **Sending is off by default.** In test mode JNN-Engine only reads: it replays the game with the site's own engine and tries moves on a copy, and sends nothing.
- **With sending on**, a move is sent to 18xx.games (`/api/game/<number>/action`, the same request the site's own page makes) only after you press it and confirm, only if it is your move, and only after it has been checked against the latest game state. It never sends anything else and never sends data anywhere else.
- **It only talks to 18xx.games** for game data and moves, and loads code from this repository and from 18xx-JNNstats through the jsDelivr CDN (as JNN-stats does).

## Licence

GPL-3.0. Credit: jimiste.
