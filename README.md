# 18xx-JNNengine

A JNN game window for [18xx.games](https://18xx.games): the game drawn the JNN way, in its own window beside the site and beside [18xx-JNNstats](https://github.com/mvhjim/18xx-jnnstats).

**Status: 0.6.1 (beta).** Shows the game and can make every move found in the tested titles' finished games: shares, starting companies, bids and auctions, dividends, trains, tiles, stations and routes, private company powers, and title-specific steps (1817 loans, shorts, conversions, mergers and acquisitions; The Old Prince 1871 auctions, splits, Union Bank purchases, exchanges and the Hunslet), buying private companies, and bankruptcy as a last resort. **Sending is off by default:** in test mode every move is checked on a copy of the game and shown, but nothing is sent.

## Use

1. Create a bookmark and paste the contents of [bookmarklet.txt](bookmarklet.txt) as its address.
2. Open a game on 18xx.games and click the bookmark. JNN-Engine opens in its own window (allow pop-ups for 18xx.games if your browser asks).
3. Pick your name under **I am** in the JNN-stats ⋯ menu: JNN-Engine uses the same settings (I am, privacy mode, Learning mode, colours).

The 18xx.games page stays exactly as it is. If JNN-Engine ever fails or shows something wrong, play on the site.

## Making moves

- Press a move in the **Your turn** card. JNN-Engine tries it on a copy of the game and shows exactly what will happen.
- **Warnings:** the confirmation also says what the move changes that is easy to miss: a phase change, trains that rust, a presidency that changes hands, share prices that move, a company left without a train, loans and their interest, the certificate limit, or your own money going into a train. Before a move with a ⚠ warning can be sent, you tick *I have read the warnings above*.
- **Learning mode** (set in JNN-stats): a one-line explanation of each kind of move in the *Your turn* card, and a plain-words explanation under each line of what will happen.
- **Tiles and stations:** the hexes where you may lay a tile or place a station are outlined on the small board in the card. Click one to see each legal tile in each legal rotation (drawn as it would lie), or the station spots, then press the one you want.
- **Your companies and private companies:** moves you can make *for* a company you run (for example taking a loan or buying back shares in an 1817 stock round) are listed as *For <company>*. Private company powers you can use now are listed as *Use <company>*; for a power on the map, press *Use … on the map* and the board shows where it can be used.
- **Running trains:** press *Find the best routes*. The site's own auto-router suggests the routes and the revenue; you confirm them like any other move. To draw routes by hand, use the 18xx.games page.
- To really make moves from JNN-Engine, click **Sending moves: off** in the header and confirm. It stays on until you switch it off.
- A move is sent only when you are logged in on the 18xx.games page, it is your move according to the rules engine, the title is a tested one and the game is not a pinned one. Just before sending, the game is fetched again; if anyone moved in between, nothing is sent and you choose again.
- Undo works as usual on the 18xx.games page.

## How it relates to JNN-stats

JNN-Engine contains no game logic of its own. It loads the released 18xx-JNNstats code through its read-only programming interface ([JNN-API](https://github.com/mvhjim/18xx-jnnstats/blob/main/docs/API.md)) and the site's own rules engine:

- it reads JNN-stats' `version.js`, checks that the API version fits (major version 1), and loads exactly that release, so it follows JNN-stats updates;
- if a JNN-stats release ever changes the API in a way that could break JNN-Engine, it stays on a known-good release until JNN-Engine is updated.

## Tested titles

1817, 1846, 1862, The Old Prince 1871 and 1849: Kingdom of the Two Sicilies. Other titles are shown, but will stay view only until they are tested.

## Beta

JNN-Engine is in beta. Testers: see the [beta guide](docs/BETA.md). Found a problem? Click **Copy a problem report** at the bottom of the window and send it with a line on what happened.

## Tests

[tests/run.js](tests/run.js) runs two checks on copies of finished games (it only reads, and pauses between games to go easy on the server):

- **Every real move offered:** walks through the game and checks that each move the players made was among JNN-Engine's choices at that moment, and replays a sample both ways to check JNN-Engine's version does exactly the same.
- **Every choice allowed:** at 8 positions in the game, tries each choice JNN-Engine offers on a copy and checks the rules engine accepts it.

A few choices are offered exactly as on the 18xx.games page but can only be checked when they are made: a tile that adds no new track, a station in a city the company is not connected to, a tile lay that costs more than the company has. JNN-Engine marks the last two in the label, and the confirmation shows the rules' answer before anything is sent.

## Plan

| Tranche | What |
|---|---|
| J2 (0.1) | View only: board, market, your position, players, companies, the moves allowed now |
| J3 (0.2) | Simple moves: pass, bid, start a company, buy and sell shares, pay out or withhold, buy trains; each tried on a copy first and confirmed; sending off by default |
| J4 (0.3) | Map moves: tiles (only legal tiles and rotations), stations, routes (suggested by the site's own auto-router) |
| J5 (0.4) | Special cases: private company powers, emergency train buys, title-specific steps |
| J6 (0.5) | Learning built in: explanations beside the buttons and warnings before risky moves |
| J7 (0.6) | Automatic tests on copies of real games, then a beta with friends |

## Security

- **Sending is off by default.** In test mode JNN-Engine only reads: it replays the game with the site's own engine and tries moves on a copy, and sends nothing.
- **With sending on**, a move is sent to 18xx.games (`/api/game/<number>/action`, the same request the site's own page makes) only after you press it and confirm, only if it is your move, and only after it has been checked against the latest game state. It never sends anything else and never sends data anywhere else.
- **Light on the server.** New moves arrive through the site's own live channel, which the page already keeps open, so JNN-Engine adds no requests of its own while you watch; it fetches the game only when something does not line up, plus a backup check once a minute.
- **It only talks to 18xx.games** for game data and moves, and loads code from this repository and from 18xx-JNNstats through the jsDelivr CDN (as JNN-stats does).

## Licence

GPL-3.0. Credit: jimiste.
