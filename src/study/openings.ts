/**
 * Opening chapters: Randi's repertoire as move trees, with a comment on every move.
 * At each of your turns there is exactly one move (your repertoire move); at the opponent's
 * turns the tree branches into their common replies. src/study/openings.test.ts checks with
 * Stockfish that every one of your moves is sound.
 */

export interface OpeningChapter {
  id: string;
  /** Which part of the repertoire the chapter belongs to. */
  section: 'white' | 'black-e4' | 'black-d4';
  title: string;
  /** Your side in this chapter (board orientation, and the moves you practise). */
  you: 'w' | 'b';
  summary: string;
  /** The tree, as PGN with {comments} on every move and (variations) for the opponent's replies. */
  pgn: string;
  /** Typical plans and ideas, shown under the moves. */
  plans: string[];
  /** Ids of related trap chapters. */
  traps?: string[];
}

export const OPENINGS: OpeningChapter[] = [
  {
    id: 'white-catalan',
    section: 'white',
    title: 'Against ...d5 and ...e6: the Catalan',
    you: 'w',
    summary: 'Your main system: Nf3, d4, g3, Bg2, O-O and c4. The g2 bishop on the long diagonal is your best piece.',
    pgn: `
1. Nf3 {Your usual first move: it develops, controls d4 and e5, and keeps every option open.}
1... d5 {Black takes the center.}
2. d4 {You take your share of the center.}
2... Nf6 {The most common reply.}
(2... Bf5 {Black develops the light-squared bishop before ...e6. That leaves the b7 pawn with fewer defenders.}
 3. g3 {Continue your setup.} 3... e6 {Black supports d5.}
 4. Bg2 {The bishop goes to the long diagonal.} 4... Nf6 {Black develops.}
 5. O-O {Your king is safe.} 5... Be7 {Black develops.}
 6. c4 {Your key push: it attacks d5 and opens the diagonal.} 6... c6 {Black supports d5.}
 7. Qb3 {The point: the c8 bishop has left, so b7 is weak. The queen attacks it.}
 7... Qb6 {Black defends b7 by offering a queen trade.}
 8. Nc3 {Develop. You keep pressure on d5 and b7, a small but lasting edge.})
3. g3 {Prepares the fianchetto: the bishop goes to g2.}
3... e6 {Solid: supports d5 and frees the f8 bishop.}
(3... c6 {A Slav setup: d5 is supported by a pawn.}
 4. Bg2 {Continue.} 4... Bf5 {The bishop comes out before ...e6.}
 5. O-O {Castle.} 5... e6 {Black supports d5.}
 6. c4 {Your usual push.} 6... Nbd7 {Black develops.}
 7. Qb3 {Again the queen hits b7, which the c8 bishop no longer guards.}
 7... Qb6 {Black offers a queen trade to defend b7.}
 8. Nc3 {Develop and keep the pressure.})
4. Bg2 {The key piece of your system, aiming at b7 and a8.}
4... Be7 {Black develops and prepares to castle.}
(4... c5 {Black hits d4 before you castle.}
 5. O-O {Castle first: your king is safe before the center opens.}
 5... Nc6 {Black adds pressure on d4.}
 6. c4 {Now c4 anyway: the diagonal opens.}
 6... dxc4 {Black takes.}
 7. dxc5 {You take back in the center; the queens come off.}
 7... Qxd1 {Black trades queens.} 8. Rxd1 {Recapture with the rook, now on the open d-file.}
 8... Bxc5 {Black takes back on c5.}
 9. Nbd2 {The knight goes to c4 to win back your pawn. The endgame is pleasant: the g2 bishop is strong.})
5. O-O {Castle: your king is safe.}
5... O-O {Black castles too.}
6. c4 {Your typical push: it attacks d5 to open the long diagonal.}
6... dxc4 {The Open Catalan: Black takes the pawn.}
(6... c6 {The Closed Catalan: Black keeps d5 solid.}
 7. Qc2 {Supports the e4 push.} 7... Nbd7 {Black develops.}
 8. Nbd2 {Supports e4 a second time. Now the break is ready.} 8... b6 {Prepares ...Bb7.}
 9. e4 {The central break, well prepared. It opens the position for your pieces.}
 9... dxe4 {Black takes.} 10. Nxe4 {Recapture with the knight: it is centralized.}
 10... Bb7 {Black develops the bishop.} 11. Nxf6+ {Trade a defender.} 11... Nxf6 {Black recaptures.}
 12. Rd1 {The rook stands behind the d-pawn. You have more space and easy play.})
(6... Nbd7 {Black develops first.}
 7. Qc2 {Supports e4.} 7... c6 {Black supports d5: the Closed Catalan again.}
 8. Nbd2 {Prepare e4.} 8... b6 {Prepares ...Bb7.}
 9. e4 {Same break, same idea.} 9... dxe4 {Black takes.} 10. Nxe4 {Recapture.}
 10... Bb7 {Black develops.} 11. Nxf6+ {Trade a defender.} 11... Nxf6 {Recapture.}
 12. Rd1 {Rook behind the d-pawn: more space for you.})
(6... c5 {Black strikes back in the center.}
 7. cxd5 {Take on d5.} 7... exd5 {Black recaptures.}
 8. Nc3 {Develop, aiming at d5.} 8... Nc6 {Black develops.}
 9. dxc5 {Take on c5: Black's d5 pawn is now isolated.} 9... Bxc5 {Black recaptures.}
 10. Bg5 {Pin the f6 knight, a defender of d5. The isolated pawn is a long-term target.})
7. Qc2 {Calm: you will win the pawn back with the queen. No hurry.}
7... a6 {Black prepares ...b5 to keep the pawn.}
(7... b5 {Black defends c4 at once.}
 8. a4 {Attack the pawn chain at its base.}
 8... b4 {The right reply. (8...c6? loses the a8 rook: see the trap chapter.)}
 9. Nfd2 {The knight heads for c4.} 9... c6 {Black makes the queenside solid.}
 10. Nxc4 {Pawn regained, with a fine knight on c4.})
(7... Nc6 {Black develops and hits d4.}
 8. Qxc4 {Take back the pawn.} 8... Qd5 {Black offers a queen trade.}
 9. Qa4 {Keep the queens: from a4 your queen presses on the c6 knight.})
8. Qxc4 {Pawn back.}
8... b5 {Black gains space with tempo.}
9. Qc2 {The queen retreats, still watching c6 and the long diagonal.}
9... Bb7 {Black fights for the long diagonal.}
10. Bf4 {An active bishop: it covers c7 and controls e5.}
10... Nd5 {Black challenges the bishop.}
11. Nc3 {Develop and challenge the d5 knight.}
11... Nxf4 {Black takes the bishop.}
12. gxf4 {Your pawns change, but you gain the open g-file and control of e5. Balanced, with play for both sides.}
`,
    plans: [
      'The g2 bishop is your star: keep the long diagonal open (c4, and later sometimes e4).',
      'When Black takes on c4, win the pawn back calmly with Qc2 or Qa4+. If Black holds it with ...b5, hit the chain with a4.',
      'In the closed lines (...c6), prepare the e4 break with Nbd2 and Qc2 first, then push e4.',
      'If Black develops the c8 bishop early (...Bf5), the b7 pawn is weak: Qb3.',
    ],
    traps: ['catalan-c6'],
  },
  {
    id: 'white-c5-after-d5',
    section: 'white',
    title: 'Against ...d5 and ...c5: c4 anyway',
    you: 'w',
    summary: 'When Black meets your d4 with ...c5, c3 is playable but passive. c4 keeps your plan alive and often gives Black an isolated pawn for your g2 bishop to attack.',
    pgn: `
1. Nf3 {Your usual start.}
1... d5 {Black takes the center.}
2. d4 {You take your share.}
2... c5 {Black attacks d4 immediately.}
3. c4 {The best answer. Instead of the passive 3.c3, you play c4 anyway: you fight for the center and keep your plan of opening the long diagonal.}
3... e6 {Black supports d5. This is a Tarrasch structure.}
(3... dxc4 {Black takes the pawn.}
 4. e3 {Simple: you will take back with the bishop.} 4... Nf6 {Black develops.}
 5. Bxc4 {Pawn back.} 5... e6 {Black opens the f8 bishop.}
 6. O-O {Castle.} 6... a6 {Black prepares ...b5.}
 7. a4 {Stop ...b5. You have a comfortable position with more space.})
(3... cxd4 {Black releases the tension.}
 4. cxd5 {Take on d5 first.} 4... Nf6 {Black attacks the d5 pawn.}
 5. Nxd4 {Take back on d4.} 5... Nxd5 {Black regains the pawn.}
 6. e4 {Gain space with tempo on the knight: you develop easily.})
(3... Nf6 {Black develops but leaves d5 weak.}
 4. cxd5 {Take.} 4... Nxd5 {Recapturing with the knight is a small mistake here.}
 5. e4 {Chase the knight and take the center: you are clearly better.}
 5... Nf6 {The knight retreats.}
 (5... Nb6 {Another retreat.} 6. d5 {Gain more space: Black's pieces are pushed back.})
 6. Nc3 {Develop and support e4.} 6... e6 {Black prepares ...Be7.}
 7. d5 {A big center: Black is cramped.})
4. cxd5 {Exchange on d5.}
4... exd5 {Black recaptures. The d5 pawn will become isolated.}
5. g3 {Rubinstein's system: on g2 the bishop is the best piece against an isolated d5 pawn.}
5... Nc6 {Black develops and adds pressure on d4.}
(5... Nf6 {Black develops the other knight first.}
 6. Bg2 {The bishop aims at d5.} 6... Nc6 {Black develops.}
 7. O-O {Castle.} 7... Be7 {Black develops.}
 8. Nc3 {A third attacker on d5.} 8... O-O {Black castles.}
 9. dxc5 {Take on c5: d5 is now isolated.} 9... Bxc5 {Black recaptures.}
 10. Bg5 {Pin the f6 knight, a defender of d5.})
6. Bg2 {The bishop aims straight at d5.}
6... Nf6 {Black defends d5.}
7. O-O {Castle.}
7... Be7 {Black develops.}
8. Nc3 {A third attacker on d5.}
8... O-O {Black castles.}
9. dxc5 {Take on c5: now d5 is an isolated pawn.}
9... Bxc5 {Black recaptures.}
10. Bg5 {Pin the f6 knight, one of d5's defenders.}
10... d4 {Black pushes the pawn forward rather than wait to lose it.}
11. Bxf6 {Remove the knight.}
11... Qxf6 {Black recaptures.}
12. Nd5 {The knight jumps into the hole on d5 and attacks the queen.}
12... Qd8 {The queen retreats.}
13. Nd2 {The knight reroutes (to b3 or e4) to attack d4. You keep a lasting pressure on the isolated pawn.}
`,
    plans: [
      'Against ...c5, play c4 rather than c3: your c-pawn opens the long diagonal and fights for d5.',
      'When Black gets an isolated d5 pawn, attack it with Bg2, Nc3, Bg5 (to remove the f6 knight) and later Rd1.',
      'Put a piece in front of an isolated pawn (a knight on d4 or d5): it can never be chased by a pawn.',
      'If Black recaptures on d5 with a knight, e4 gains the center with tempo.',
    ],
  },
  {
    id: 'white-c5-first',
    section: 'white',
    title: 'Against 1...c5: your c3 plan',
    you: 'w',
    summary: 'When Black plays ...c5 before you play d4, your idea c3 then d4 works well — except against ...d5, where d4 should come at once.',
    pgn: `
1. Nf3 {Your usual start.}
1... c5 {Black plays ...c5 before you have played d4: an English-style setup.}
2. g3 {Continue your setup.}
2... Nc6 {Black develops and controls d4.}
(2... d5 {Black takes the center.}
 3. Bg2 {Your bishop.} 3... Nc6 {Black develops.}
 4. d4 {Strike in the center at once: here it is better than castling first, by about half a pawn.}
 4... Nf6 {Black develops.}
 (4... cxd4 {Black takes.} 5. Nxd4 {Recapture with the knight.} 5... Nxd4 {Black trades.}
  6. Qxd4 {Your queen is active, and the g2 bishop presses on d5.} 6... Nf6 {Black develops.}
  7. O-O {Castle: you are a little better.})
 5. O-O {Castle.} 5... e6 {Black supports d5.}
 6. c4 {Now c4: it is a Catalan!} 6... dxc4 {Black takes.}
 7. dxc5 {Take back in the center; the queens come off.} 7... Qxd1 {Black trades queens.}
 8. Rxd1 {Rook on the open d-file.} 8... Bxc5 {Black recaptures.}
 9. Nbd2 {The knight wins back c4. The endgame favors your g2 bishop.})
(2... g6 {Black fianchettoes too.}
 3. Bg2 {Your bishop.} 3... Bg7 {Black's bishop.} 4. O-O {Castle.} 4... Nc6 {Black develops.}
 5. c3 {Your idea: prepare d4 so that ...cxd4 can be met by cxd4.} 5... Nf6 {Black develops.}
 6. d4 {Now d4.} 6... cxd4 {Black takes.} 7. cxd4 {Recapture: symmetrical, but it is your move.}
 7... d5 {Black takes the center.} 8. Nc3 {Develop.} 8... O-O {Black castles.}
 9. Ne5 {The knight hits c6, with the g2 bishop behind it: you keep a small initiative.})
3. Bg2 {Your bishop on the long diagonal.}
3... g6 {Black fianchettoes as well.}
4. O-O {Castle.}
4... Bg7 {Black's bishop also aims at the long diagonal.}
5. c3 {Your idea: prepare d4 so that ...cxd4 can be answered by cxd4.}
5... Nf6 {Black develops.}
(5... e5 {Black takes control of d4 first.}
 6. d3 {Then don't force d4: play d3 and expand on the queenside instead.}
 6... Nge7 {Black develops.} 7. a3 {Prepares b4.} 7... O-O {Black castles.}
 8. b4 {Queenside expansion: b4 challenges the c5 pawn.})
6. d4 {Now d4.}
6... cxd4 {Black takes.}
7. cxd4 {Recapture. The position is symmetrical, but it is your move.}
7... d5 {Black takes the center.}
8. Nc3 {Develop.}
8... O-O {Black castles.}
9. Ne5 {The knight hits c6, with the g2 bishop behind it: you keep a small initiative.}
`,
    plans: [
      'After 1...c5, your c3-and-d4 plan works when Black plays ...g6 or ...Nc6.',
      'If Black takes control of d4 with ...e5, play d3 and expand with a3 and b4 instead of forcing d4.',
      'Against an early ...d5, play d4 at once, then c4: you reach a Catalan.',
    ],
  },
  {
    id: 'white-kings-indian',
    section: 'white',
    title: 'Against the King’s Indian setup',
    you: 'w',
    summary: 'Many players answer Nf3 and d4 with ...g6, ...Bg7 and ...d6. Your setup stays the same: g3, Bg2, O-O, c4 — then take the center with e4.',
    pgn: `
1. Nf3 {Your usual start.}
1... Nf6 {Black develops.}
2. d4 {Take the center.}
2... g6 {Black prepares a fianchetto: the King's Indian setup.}
3. g3 {Your fianchetto too.}
3... Bg7 {Black's bishop goes to the long diagonal.}
4. Bg2 {Yours too.}
4... O-O {Black castles.}
5. O-O {You castle.}
5... d6 {The King's Indian: Black prepares ...e5 or ...c5.}
(5... d5 {A Grünfeld-style setup instead.}
 6. c4 {Your usual push.} 6... c6 {Black supports d5.}
 7. cxd5 {Exchange.} 7... cxd5 {Black recaptures: symmetry.}
 8. Nc3 {Develop.} 8... Nc6 {Black develops.}
 9. Ne5 {Your extra tempo counts: the knight hits c6, backed by the g2 bishop.})
6. c4 {Gain space in the center.}
6... Nbd7 {Black prepares ...e5.}
(6... Nc6 {Black develops toward d4.}
 7. Nc3 {Develop.} 7... a6 {Black prepares ...Rb8 and ...b5.}
 8. d5 {Gain space and kick the knight.} 8... Na5 {The knight goes to the edge.}
 9. Nd2 {Covers c4 and opens the long diagonal again.} 9... c5 {Black supports the knight.}
 10. Qc2 {Protects c4 and prepares b3: the a5 knight has no future.})
(6... c6 {Black prepares ...Qa5 or ...d5.}
 7. Nc3 {Develop.} 7... Qa5 {The queen eyes the c3 knight.}
 8. h3 {A useful waiting move: it stops ...Bg4 and ...Ng4 and prepares e4 or Be3.})
7. Nc3 {Develop.}
7... e5 {The typical King's Indian break.}
8. e4 {Take your share of the center: your pieces get more space.}
8... exd4 {Black releases the tension.}
9. Nxd4 {Recapture with a centralized knight.}
9... Re8 {Black puts pressure on e4.}
10. h3 {Useful: stops ...Ng4 and ...Bg4.}
10... a6 {Black prepares ...Rb8 and ...b5.}
11. Re1 {Protects e4. You have more space and a solid center.}
`,
    plans: [
      'Keep the same setup: g3, Bg2, O-O, c4, Nc3 — then claim the center with e4 when Black plays ...e5.',
      'h3 is often useful: it stops ...Ng4 and ...Bg4.',
      'If Black plays ...Nc6 and ...a6, d5 gains space with tempo.',
      'Against a symmetrical Grünfeld-style setup, Ne5 uses your extra tempo.',
    ],
  },
];
