# 18xx-JNNengine

A JNN game window for [18xx.games](https://18xx.games): the game drawn the JNN way, in its own window beside the site and beside [18xx-JNNstats](https://github.com/mvhjim/18xx-jnnstats).

**Status: 0.1.0, view only.** This version shows the game; it does not send moves. Make your moves on the 18xx.games page as usual. Sending moves will come in later versions, only for titles that have been tested, and only when you press a button.

## Use

1. Create a bookmark and paste the contents of [bookmarklet.txt](bookmarklet.txt) as its address.
2. Open a game on 18xx.games and click the bookmark. JNN-Engine opens in its own window (allow pop-ups for 18xx.games if your browser asks).
3. Pick your name under **I am** in the JNN-stats ⋯ menu: JNN-Engine uses the same settings (I am, privacy mode, Learning mode, colours).

The 18xx.games page stays exactly as it is. If JNN-Engine ever fails or shows something wrong, play on the site.

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
| J3 | Simple moves: pass, bid, start a company, buy and sell shares, pay out or withhold, buy trains; each confirmed, tested on a copy first, with undo |
| J4 | Map moves: tiles (only legal tiles and rotations), stations, routes (suggested by the site's own auto-router) |
| J5 | Special cases: private company powers, emergency train buys, title-specific steps |
| J6 | Learning built in: explanations beside the buttons and warnings before risky moves |
| J7 | Automatic tests on copies of real games, then a beta with friends |

## Security

- **This version only reads.** It replays the game with the site's own engine and draws it. It sends no moves and no data to anyone.
- **It only talks to 18xx.games** for game data, and loads code from this repository and from 18xx-JNNstats through the jsDelivr CDN (as JNN-stats does).
- When moves are added, they will be sent to 18xx.games only when you press a button, after a confirmation, and checked on a copy of the game first.

## Licence

GPL-3.0. Credit: jimiste.
