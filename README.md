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

- `src/game.ts`: the game model. It holds the moves, the cursor, PGN import/export and the game status, on top of [chess.js](https://github.com/jhlywa/chess.js).
- `src/main.ts`: the page. It runs the board ([chessground](https://github.com/lichess-org/chessground), the Lichess board), the move list, navigation and the import dialog.
- `src/game.test.ts`: tests for special moves, game endings and PGN formats from chess.com and Lichess.

chessground is GPL-3.0 licensed. If the app is published online, its source code has to be available too.
