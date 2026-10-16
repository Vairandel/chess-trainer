# ♟ Chess Trainer

A personal chess training app. The plan and roadmap are in [docs/PROJECT.md](docs/PROJECT.md).

## Run it

```sh
npm install
npm run dev      # open the URL it prints
npm test         # rules and PGN tests
npm run build    # production files in dist/
```

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
- `src/studyView.ts` and `src/study/`: the Study page — trap chapters (`traps.ts`), opening chapters (`openings.ts`), the opening trainer logic (`trainer.ts`) and saved progress (`progress.ts`). Their tests check every line with Stockfish.
- `src/studyLibrary.ts`: the Study library (tabs, Continue box, overview, search and filters).
- `src/puzzleView.ts` and `src/puzzles/`: the Puzzles page — the puzzle set (`data.json`, from the [Lichess puzzle database](https://database.lichess.org/#puzzles), CC0), theme explanations and the trainer logic (rating, missed puzzles). `scripts/select-puzzles.mjs` rebuilds the set.
- `src/settings.ts`: appearance settings (theme, board colors, pieces, accent, coordinates).
- `public/pieces/`: extra piece sets from Lichess, with their authors and licenses in `CREDITS.md`.
- `public/engine/`: Stockfish 19 builds from [stockfish.js](https://github.com/nmrugg/stockfish.js) (lite WASM + asm.js fallback).

Tests (`npm test`) cover the rules, PGN formats, engine protocol, grading and explanations. The engine and explanation tests run the real Stockfish build under Node.

chessground and Stockfish are GPL-3.0 licensed (see `public/engine/COPYING.txt`), so this project's source is public.
