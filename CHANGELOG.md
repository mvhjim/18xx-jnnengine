# Changelog
All notable changes to this project are listed here. The format follows [Keep a Changelog](https://keepachangelog.com), and versions follow [Semantic Versioning](https://semver.org).

## [0.3.0] - 2026-11-16

### Added
- **Map moves (tranche J4):** lay or upgrade a tile, place a station, run trains.
  - The hexes you may build on are outlined on the board in the *Your turn* card. Clicking one shows every legal tile in every legal rotation, drawn as it would lie, as asked from the site's own rules engine (the same questions the 18xx.games page asks).
  - Stations: the cities you may place in, with the slot chosen the way the site does (reserved home spots respected).
  - Running trains: *Find the best routes* uses the site's own auto-router on a copy of the game and shows each train's stops and revenue; confirm to run them.
- 1862: choose the number of warranties when buying a train from the bank.
- Self-test also checks tiles (hex, tile and rotation offered) and stations. Results on finished games: 1846 402 moves, 401 found (the miss is a private company's station power, J5); 1862 388/388; 1849: Kingdom of the Two Sicilies 606/606; The Old Prince 1871 213/215 (Union Bank purchases, J5). Sample replays 10/10 each after the warranty fix.
- Test preview for developers: `__jnnEngine.preview(gameNumber, moves)` shows an earlier position of a game (never sends); `__jnnEngine.preview(null)` goes back.

### Changed
- **Easier on the 18xx.games server:** new moves now arrive through the site's own live channel (the page already listens to it) and are applied directly, instead of fetching the whole game every 10 seconds. A full fetch happens only when something does not line up, plus a backup check once a minute.
- Move buttons are always visible (they used to show only when the mouse was over the card, because of a clash with a JNN-stats style).
- Yes/no answers from the rules engine are read the Ruby way (only *nil* and *false* are false), which fixes hexes and choices that could wrongly look allowed.

## [0.2.0] - 2026-11-15

### Added
- **Moves (tranche J3):** pass, buy and sell shares, start a company (par), take or bid on a private company or charter (drafts and auctions), pay out, withhold or pay half, buy a train (from the bank, with its variants, or from another company at an agreed price), and, for companies, issue and buy back shares. The choices are asked from the site's own rules engine, the same way the 18xx.games page does.
- **Every move is tried on a copy of the game first**, and the confirmation shows exactly what will happen (the log lines the move produces) and what would be sent.
- **Sending is off by default (test mode).** With *Sending moves: on*, a confirmed move is sent to 18xx.games as you, but only when: you are logged in on the page, the rules engine says it is your move, the title is tested, and the game is not a pinned one. Right before sending, the game is fetched again and the move checked against the latest state; if anyone moved in between, nothing is sent.
- **Self-test** (`__jnnEngine.selfTest(gameNumber)` in the browser console): walks through a finished game and checks that every move of these kinds was among the choices JNN-Engine would have offered, and replays a sample both ways to check that they do exactly the same. Results on 24 finished games: 1846 and 1862 (4 games each) and 1849: Kingdom of the Two Sicilies (8 games): every move found; The Old Prince 1871 (8 games): about 99%, the rest being the title's private-company exchanges and Union Bank purchases, which come later.

### Not yet
- Tiles, stations and running routes (J4, done in 0.3.0), private company powers and title-specific moves such as Old Prince exchanges and Union Bank purchases (J5): make those on the 18xx.games page; JNN-Engine lists them under "Also possible now".

## [0.1.0] - 2026-11-15

### Added
- First version, **view only** (tranche J2): a JNN game window that opens beside the 18xx.games page and beside 18xx-JNNstats, with the board, the stock market, who is to act and the moves the rules allow right now (shown, not yet clickable), your own position (cash, value, certificates, shares and the companies you run), all players and all companies. With Learning mode on in JNN-stats it also shows the round banner and *Your turn, explained*. Updates every 10 seconds.
- Built on the released 18xx-JNNstats code through JNN-API 1.x: JNN-Engine reads JNN-stats' `version.js`, checks the API version and loads exactly that release, so it follows JNN-stats updates. If a JNN-stats release is not compatible, it stays on a known-good release.
- Tested titles: 1846, 1862, The Old Prince 1871 and 1849: Kingdom of the Two Sicilies. Other titles are shown, but will stay view only.
