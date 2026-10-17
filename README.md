# ♟ Chess Trainer

A personal chess training app. The plan and roadmap are in [docs/PROJECT.md](docs/PROJECT.md).

## Run it

```sh
npm install
npm run dev      # open the URL it prints
npm test         # all tests (rules, engine, study content, server)
npm run build    # production files in dist/
```

## Online

The site is a Cloudflare Pages project (`wrangler.toml`), served at chess.randivague.org:

```sh
npm run build
wrangler pages dev dist --port 8788   # the production build locally, with the headers from public/_headers
wrangler pages deploy                 # publish (only an approved, pushed main)
```

- `public/_headers`: security headers, Content-Security-Policy and caching.
- `public/manifest.webmanifest` and `public/icons/`: the installable app. `scripts/make-icons.mjs` renders the PNG icons from the SVGs.
- `vite.config.ts` writes `dist/sw.js` from `scripts/sw-template.js`: the service worker that keeps the app usable offline. `src/pwa.ts` registers it and offers to reload when a new version is ready.

### Profiles (server)

`functions/api/` (Cloudflare Pages Functions) and a D1 database (`migrations/`) hold the profiles and their synced data. To run them locally:

```sh
# .dev.vars (not committed) holds the local secrets:
#   ADMIN_PASSWORD="..."
#   PIN_PEPPER="..."
wrangler d1 migrations apply chess-trainer --local
npm run build && wrangler pages dev dist --port 8788
```

Online, the database and secrets are created once:

```sh
wrangler d1 create chess-trainer                      # put its id in wrangler.toml
wrangler d1 migrations apply chess-trainer --remote
wrangler pages secret put ADMIN_PASSWORD --project-name chess-trainer
wrangler pages secret put PIN_PEPPER --project-name chess-trainer
```

- `src/store.ts`: the app's storage (Guest: this browser; a profile: an offline copy synced with the server).
- `src/boot.ts` and `src/profiles.ts`: the "Who's training?" picker, PIN keypad and account menu, before the app starts.
- `src/share.ts`: PGNs shared from other apps (Android share menu), received by the service worker.
- `src/adminView.ts`: the admin page (`#admin`). `src/api.ts`: calls to the server. `src/profileOptions.ts`: rules shared with the server.

## Code

- `src/game.ts`: the game model. It holds the move tree (main line and variations), the current position, PGN import/export with variations, and the game status, on top of [chess.js](https://github.com/jhlywa/chess.js).
- `src/main.ts`: the page. It runs the board ([chessground](https://github.com/lichess-org/chessground), the Lichess board), the move list, navigation and the import dialog.
- `src/engine.ts`: talks to Stockfish (UCI protocol) running in a Web Worker.
- `src/analyzer.ts`: evaluates positions, remembers the results by FEN, analyzes whole games.
- `src/review.ts`: win chances, move grades (best → blunder) and accuracy.
- `src/teach.ts`: the plain-English explanation of each move.
- `src/graph.ts`: the evaluation graph.
- `src/library.ts`: "My games", saved with their analysis in the browser's localStorage.
- `src/opponent.ts` and `src/play.ts`: the computer opponent and the Play page.
- `src/dom.ts`: small page helpers shared by the pages.
- `src/studyView.ts` and `src/study/`: the Study page — trap chapters (`traps.ts`), opening chapters (`openings.ts`), famous games (`games.ts`, with the downloaded scores in `games-source.json`), the opening trainer and "Guess the move" logic (`trainer.ts`) and saved progress (`progress.ts`). Their tests check every line with Stockfish.
- `src/studyLibrary.ts`: the Study library (tabs, Continue box, overview, search and filters).
- `src/puzzleView.ts` and `src/puzzles/`: the Puzzles page — the puzzle set (`data.json`, from the [Lichess puzzle database](https://database.lichess.org/#puzzles), CC0), theme explanations and the trainer logic (rating, missed puzzles). `scripts/select-puzzles.mjs` rebuilds the set.
- `src/settings.ts`: appearance settings (theme, board colors, pieces, accent, coordinates).
- `public/pieces/`: extra piece sets from Lichess, with their authors and licenses in `CREDITS.md`.
- `public/engine/`: Stockfish 19 builds from [stockfish.js](https://github.com/nmrugg/stockfish.js) (lite WASM + asm.js fallback).

Tests (`npm test`) cover the rules, PGN formats, engine protocol, grading and explanations. The engine and explanation tests run the real Stockfish build under Node.

chessground and Stockfish are GPL-3.0 licensed (see `public/engine/COPYING.txt`), so this project's source is public.
