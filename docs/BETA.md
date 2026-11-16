# JNN-Engine beta: a guide for testers

Thank you for trying JNN-Engine. It is a second window for playing on [18xx.games](https://18xx.games): it draws the game the JNN way, explains what you can do, warns before risky moves and, if you allow it, makes your moves for you. The 18xx.games page stays exactly as it is, so you can always play there instead.

## What you need

- A computer with Chrome, Edge, Firefox or Safari. (The bookmark does not work in phone browsers.)
- An account on 18xx.games, logged in.
- One of the tested titles: **1817, 1846, 1862, The Old Prince 1871, 1849: Kingdom of the Two Sicilies**. Other titles are shown, but moves are never sent there.

## Setting up (two minutes)

1. Create a bookmark in your browser and paste the text of [bookmarklet.txt](../bookmarklet.txt) as its address (URL). Name it "JNN-Engine".
2. Do the same with [18xx-JNNstats' bookmarklet](https://github.com/mvhjim/18xx-jnnstats/blob/main/bookmarklet.txt) if you want the stats window too.
3. Open one of your games on 18xx.games and click the bookmark. Allow pop-ups for 18xx.games if the browser asks.
4. In the JNN-stats ⋯ menu, pick your name under **I am**. If you are new to the title, switch **Learning mode** on (beginner or intermediate).

## How to test

**Week 1: test mode only.** Sending is off when you start (*Sending moves: off (test mode)* in the header). In test mode JNN-Engine only reads: when you press a move, it tries it on a copy of the game and shows exactly what would happen, but nothing is sent. Play as usual on the 18xx.games page, and before each move, check JNN-Engine:

- Is the move you want to make offered? If not, note what was missing.
- When you press it, does *This is what will happen* match what then happens when you make the move on the site?
- Do the warnings make sense? Anything missing or wrong?
- Is anything shown wrongly (board, market, cash, shares, trains)?

**After that: sending on, for simple moves first.** Click *Sending moves: off* in the header to switch sending on. Then a confirmed move is sent to 18xx.games as you, but only when you are logged in, it is your move, and the game has not changed since you looked. Start with simple moves (pass, buy a share, pay out) and keep the 18xx.games page open beside it. Undo works as usual on the site.

## Reporting a problem

1. In the JNN-Engine window, click **Copy a problem report** at the bottom.
2. Tick *Include the game number* if you are happy for the person you send it to to open the game.
3. Read the text (error messages can contain player names), press **Copy**, add a line or two on what you did and what went wrong, and send it to Jim.

A screenshot helps too. If you take one, switch on privacy mode in the JNN-stats ⋯ menu first if the picture will be shared.

## Good to know

- **It is light on the server.** New moves arrive through the site's own live channel, which the page already keeps open, so JNN-Engine adds no requests while you watch.
- **Nothing is stored on a server.** Settings (sending on or off, Learning mode, I am) are kept in your own browser.
- **Going bankrupt** is left to the 18xx.games page on purpose.
- If a new version has just been released, the bookmark may load the previous one for a few hours (the code is delivered through the jsDelivr CDN). The version is shown at the bottom of the window.
