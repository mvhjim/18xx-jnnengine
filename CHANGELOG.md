# Changelog
All notable changes to this project are listed here. The format follows [Keep a Changelog](https://keepachangelog.com), and versions follow [Semantic Versioning](https://semver.org).

## [0.1.0] - 2026-11-15

### Added
- First version, **view only** (tranche J2): a JNN game window that opens beside the 18xx.games page and beside 18xx-JNNstats, with the board, the stock market, who is to act and the moves the rules allow right now (shown, not yet clickable), your own position (cash, value, certificates, shares and the companies you run), all players and all companies. With Learning mode on in JNN-stats it also shows the round banner and *Your turn, explained*. Updates every 10 seconds.
- Built on the released 18xx-JNNstats code through JNN-API 1.x: JNN-Engine reads JNN-stats' `version.js`, checks the API version and loads exactly that release, so it follows JNN-stats updates. If a JNN-stats release is not compatible, it stays on a known-good release.
- Tested titles: 1846, 1862, The Old Prince 1871 and 1849: Kingdom of the Two Sicilies. Other titles are shown, but will stay view only.
