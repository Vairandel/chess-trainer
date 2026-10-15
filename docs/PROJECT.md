# ♟️ Chess Learning App — Project Documentation

**Project owner:** Randi Atewoung
**Skill level:** ~1500 Elo (chess.com)
**Goal:** A personal chess training app to learn traps, openings, tactics, strategy, and legendary games — with a comment on **every move** to understand the purpose of each one.

---

## 1. Objectives & Success Criteria

| Objective | Success criteria |
|---|---|
| Analyze my own games | Import PGN (paste or file), replay with per-move evaluation and comments |
| Understand every move | Each move gets an evaluation + a plain-English explanation |
| Learn theory | Traps, opening lines, plans, legendary annotated games |
| Practice tactics | Puzzle trainer by theme (forks, pins, back-rank, etc.) |
| Play practice | Computer opponent with adjustable strength (~800–1800 Elo) |

---

## 2. Architecture Overview

```mermaid
flowchart TD
    A[PGN Input: paste or .pgn file] --> B[Board & Rules Engine]
    B --> C[Game Analysis Layer]
    C --> D[Move-by-move comments + eval graph]
    B --> E[Study Library]
    E --> F[Traps / Openings / Legendary games]
    B --> G[Play Mode vs Computer]
    B --> H[Puzzle Trainer]
    C --> I[(Stockfish or fallback engine)]
```

### Modules

1. **Board & Rules Engine** — full legality (castling, en passant, promotion, checks), PGN read/write. *Phase 1*
2. **Game Analysis** — evaluation per move, blunder/mistake/inaccuracy flags, best-move suggestion, evaluation graph, teaching comments. *Phase 2*
3. **Study Library** — annotated content with a comment on every move. *Phase 3*
4. **Play Mode** — adjustable computer opponent (easy → hard). *Phase 3*
5. **Puzzle Trainer** — themes: fork, pin, discovered attack, back-rank, traps. *Phase 4*

---

## 3. Technical Decisions

| Decision | Choice | Rationale | Fallback |
|---|---|---|---|
| Analysis engine | Stockfish (browser/WASM) | Strongest analysis, catches deep tactics | Custom built-in eval engine (material, activity, king safety, shallow search) |
| Game input | PGN paste **and** file upload | Both requested by user | Paste only |
| Opponent strength | Adjustable ~800–1800 Elo | Matches user level and progression path | Fixed 1500 |
| Language of annotations | English | Doubles as English learning practice | — |
| Build approach | Phased, test each phase before moving on | Iterative beats one-shot; each phase is usable alone | — |
| Hosting | Cloudflare Pages at `chess.randivague.org` | Everything runs in the browser, so no server is needed | Google Cloud VM (Undercover) only if a backend is ever needed |

---

## 4. Roadmap & Status

- [x] **Phase 1 — Interactive board**: move validation, all special moves, PGN import, navigation — *approved 2026-10-15*
- [ ] **Phase 2 — Game analysis**: per-move evaluation, comments on every move, eval graph
- [ ] **Phase 3 — Study library + play mode**: annotated traps/openings/legendary games, adjustable computer opponent
- [ ] **Phase 4 — Puzzles**: themed tactics trainer

**Rule:** each phase must be tested and approved by Randi before starting the next. The current version is the stable base — never rebuild from scratch.

---

## 5. Comment System (the heart of the app)

Every move gets annotations from **three layers**:

1. **Engine layer** — evaluation score, classification (blunder / mistake / inaccuracy / best), suggested better move
2. **Teaching layer** — plain-English explanation of the move's purpose: tempo, weakness created/attacked, plan followed, tactical pattern (e.g. "this follows the Légal trap pattern")
3. **Reference layer** (study library only) — hand-written rich annotations for legendary games

## 6. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Stockfish can't load in the app | Custom fallback engine, same teaching experience |
| Losing work between sessions | Docs + phased approach; each phase is a stable base |
| Session/usage limits | Small, focused phases; resume from docs |
| Bugs in special moves (castling, en passant) | Use battle-tested chess logic, test each phase |

---

*Last updated: 2026-10-15 — Phase 1 approved (Vite + TypeScript, chess.js, @lichess-org/chessground). Ready for Phase 2.*
