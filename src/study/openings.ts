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

  // ------------------------------------------------------------------ Black vs 1.e4: Alekhine
  {
    id: 'alekhine-modern',
    section: 'black-e4',
    title: 'Alekhine: the Modern Variation (4.Nf3)',
    you: 'b',
    summary: "White's most popular line. Your system: ...d6, ...g6 and ...Bg7, then attack the center with ...dxe5, ...Nc6 and ...Bg4.",
    pgn: `
1. e4 {White takes the center.}
1... Nf6 {The Alekhine Defense: you attack e4 and invite White's pawns forward. A big pawn center can become a target.}
2. e5 {White accepts and kicks the knight.}
2... Nd5 {The knight's best square: central and safe.}
3. d4 {White builds the center.}
3... d6 {Attack the e5 pawn at once: that is the whole idea of the Alekhine.}
4. Nf3 {The Modern Variation: White defends e5 with a piece and develops calmly.}
4... g6 {Your system: the bishop goes to g7, where it hits White's center from afar.}
5. Bc4 {The most active move: the bishop hits your knight and aims at f7.}
(5. c4 {White kicks the knight.}
 5... Nb6 {The knight retreats to b6, where it eyes c4.}
 6. exd6 {White exchanges.} 6... cxd6 {Recapture toward the center: the d6 pawn controls e5 and c5.}
 7. Be2 {White develops.} 7... Bg7 {Your bishop on the long diagonal presses d4.}
 8. O-O {White castles.} 8... O-O {You castle.}
 9. Nc3 {White develops.} 9... Bg4 {Pin the knight that defends d4.}
 10. h3 {White asks the bishop.} 10... Bxf3 {Take the knight: one defender of d4 fewer.}
 11. Bxf3 {White recaptures.} 11... Nc6 {Now d4 is under heavy pressure: a typical, comfortable position for you.})
(5. Be2 {A calm developing move.}
 5... Bg7 {Develop.} 6. O-O {White castles.} 6... O-O {You castle.}
 7. c4 {White kicks the knight.} 7... Nb6 {The knight retreats.}
 8. exd6 {White exchanges.} 8... cxd6 {Recapture toward the center.}
 9. Nc3 {White develops.} 9... Bg4 {Same plan: pin the defender of d4.}
 10. h3 {White asks the bishop.} 10... Bxf3 {Take the defender.} 11. Bxf3 {Recapture.}
 11... Nc6 {Pressure on d4: the same comfortable position.})
(5. Ng5 {An early knight jump toward f7.}
 5... c6 {Solid: supports the d5 knight and prepares ...dxe5.}
 6. Bc4 {The bishop also aims at f7.} 6... dxe5 {Take on e5.}
 7. dxe5 {White recaptures.} 7... Bg7 {Your bishop hits the e5 pawn: you are fine.})
5... Nb6 {The knight retreats with tempo on the bishop.}
6. Bb3 {The bishop stays on the diagonal toward f7.}
6... Bg7 {Develop: the bishop aims at e5 and d4.}
7. Ng5 {The aggressive try: knight and bishop both aim at f7.}
(7. a4 {White threatens a5 to chase your knight.}
 7... a5 {Stop it: now the b6 knight is safe.}
 8. O-O {White castles.} 8... O-O {You castle.}
 9. h3 {White prevents ...Bg4.} 9... dxe5 {Release the tension now.}
 10. Nxe5 {White recaptures with the knight.} 10... Nc6 {Challenge the strong e5 knight.}
 11. Nxc6 {White trades.} 11... bxc6 {Your pawns are doubled, but the open b-file and your bishops give good play.}
 12. c3 {White supports d4.})
(7. O-O {White castles first.}
 7... O-O {You castle.} 8. h3 {White prevents ...Bg4.}
 8... a5 {Gain queenside space and threaten ...a4, hitting the b3 bishop.}
 9. a4 {White stops ...a4.} 9... dxe5 {Release the tension.}
 10. Nxe5 {White recaptures.} 10... Nc6 {Challenge the e5 knight.}
 11. Nxc6 {White trades.} 11... bxc6 {Open b-file and active bishops: good play for you.}
 12. c3 {White supports d4.})
7... d5 {Block the bishop's diagonal: f7 is safe now.}
8. O-O {White castles.}
8... h6 {Kick the knight.}
9. Nf3 {The knight retreats.}
9... Bg4 {Develop with a pin on the f3 knight.}
10. Nbd2 {White develops.}
10... e6 {A solid, French-like structure: d5 is secure and your pieces are well placed.}
`,
    plans: [
      'Attack the big center: ...d6, then ...dxe5, ...Nc6 and ...Bg4 to pressure d4.',
      'The g7 bishop is your best piece: it hits e5 and d4 from far away.',
      'Pin the f3 knight with ...Bg4 and take it with ...Bxf3 when it defends d4.',
      'When White aims at f7 (Bc4/Bb3 + Ng5), close the diagonal with ...d5 or ...e6.',
    ],
    traps: ['alekhine-ne4', 'alekhine-nxf7'],
  },
  {
    id: 'alekhine-c4',
    section: 'black-e4',
    title: 'Alekhine: Exchange and Four Pawns (4.c4)',
    you: 'b',
    summary: 'White grabs space with c4 (and sometimes f4). Recapture toward the center, fianchetto, and strike the center with ...e5 or ...f6.',
    pgn: `
1. e4 {White takes the center.}
1... Nf6 {The Alekhine Defense.}
2. e5 {White kicks the knight.}
2... Nd5 {The knight's best square.}
3. d4 {White builds the center.}
3... d6 {Attack e5 at once.}
4. c4 {White kicks the knight again: the big-center lines.}
4... Nb6 {The knight retreats to b6.}
5. exd6 {The Exchange Variation: White trades on d6.}
(5. f4 {The Four Pawns Attack: a huge center. It looks scary, but it is overextended.}
 5... dxe5 {Take on e5 first.} 6. fxe5 {White recaptures.}
 6... Nc6 {Attack d4 right away.} 7. Be3 {White defends d4.}
 7... Bf5 {Develop with an eye on b1 and c2.} 8. Nc3 {White develops.}
 8... e6 {Solid: opens the f8 bishop.} 9. Nf3 {White defends d4.}
 9... Be7 {Develop, ready to castle.} 10. Be2 {White develops.}
 10... O-O {You castle.} 11. O-O {White castles.}
 11... f6 {The key break: hit e5 and open the f-file. White's center starts to crumble.})
5... cxd6 {Recapture toward the center with the c-pawn.}
6. Nc3 {White develops.}
(6. Nf3 {White develops the other knight.}
 6... g6 {Fianchetto.} 7. Be2 {White develops.} 7... Bg7 {Your bishop presses d4.}
 8. O-O {White castles.} 8... O-O {You castle.} 9. Nc3 {White develops.}
 9... Nc6 {Pressure on d4.} 10. Be3 {White protects d4.}
 10... Bg4 {Pin the knight that defends d4.})
(6. Bd3 {The bishop aims at your kingside.}
 6... g6 {Fianchetto: your king will be well protected.} 7. Ne2 {White develops.}
 7... Bg7 {The bishop hits d4.} 8. O-O {White castles.} 8... O-O {You castle.}
 9. Nbc3 {White develops.} 9... Nc6 {Pressure on d4.})
6... g6 {Fianchetto: the bishop will hit d4.}
7. Be3 {White protects d4.}
7... Bg7 {Develop.}
8. Rc1 {Supports the c4 pawn.}
8... O-O {You castle.}
9. b3 {Protects c4 with a pawn.}
9... e5 {The central break: challenge d4.}
10. dxe5 {White takes.}
10... dxe5 {The d-file opens and your pieces become active. Balanced.}
`,
    plans: [
      'Recapture on d6 with the c-pawn, toward the center.',
      'Fianchetto (...g6, ...Bg7), then pressure d4 with ...Nc6, ...Bg4 and the ...e5 break.',
      'Against the Four Pawns Attack, take on e5, hit d4 with ...Nc6, develop with ...Bf5 and ...e6, then break with ...f6.',
      'Your b6 knight eyes c4: White’s advanced c-pawn can become weak.',
    ],
    traps: ['alekhine-ne4'],
  },
  {
    id: 'alekhine-sidelines',
    section: 'black-e4',
    title: "Alekhine: White's sidelines",
    you: 'b',
    summary: "Against 2.Nc3, 3.c4 Nb6 4.c5, 3.Nc3 or 3.Bc4, keep it simple: strike the center, trade the active knights, and develop.",
    pgn: `
1. e4 {White takes the center.}
1... Nf6 {The Alekhine Defense.}
2. Nc3 {White protects e4 instead of pushing.}
(2. e5 {White kicks the knight.}
 2... Nd5 {The best square.}
 3. c4 {White chases the knight.}
 (3. Nc3 {White offers to trade knights.}
  3... Nxc3 {Trade: White's pawns get doubled.} 4. dxc3 {White recaptures.}
  4... d6 {Attack e5.} 5. Nf3 {White defends e5.} 5... Nc6 {Attack e5 again.}
  6. Bb5 {White pins the knight.} 6... a6 {Ask the bishop.} 7. Ba4 {The bishop keeps the pin.}
  7... dxe5 {Win the fight for e5: you are comfortable.})
 (3. Bc4 {White hits the knight.}
  3... Nb6 {The knight retreats with tempo.} 4. Bb3 {The bishop retreats.}
  4... d6 {Attack e5.} 5. exd6 {White exchanges.} 5... cxd6 {Recapture toward the center.}
  6. Nc3 {White develops.} 6... Nc6 {Develop: easy play for you.})
 3... Nb6 {The knight retreats.}
 4. c5 {The Chase Variation: White keeps chasing.}
 4... Nd5 {The knight returns to the center.}
 5. Bc4 {White hits the knight.} 5... e6 {Support the knight.}
 6. Nc3 {Attack it again.} 6... Nxc3 {Trade it.}
 7. dxc3 {White recaptures.} 7... Nc6 {Develop: the c5 and e5 pawns are overextended targets.})
(2. d3 {A quiet move.}
 2... e5 {Take the center yourself.} 3. Nf3 {White develops.}
 3... Nc6 {Develop.} 4. Be2 {White develops.} 4... d5 {A big center for you.})
2... d5 {Strike the center at once.}
3. exd5 {White takes.}
(3. e5 {White pushes.}
 3... Nfd7 {The knight retreats.} 4. d4 {White builds the center.}
 4... e6 {A French-like structure.} 5. Nf3 {White develops.}
 5... c5 {Attack the center at its base.})
3... Nxd5 {Recapture.}
4. Bc4 {White hits the knight.}
4... Nb6 {The knight retreats with tempo.}
5. Bb3 {The bishop retreats.}
5... Nc6 {Develop.}
6. Nf3 {White develops.}
6... Bf5 {Develop the bishop outside the pawn chain.}
7. a4 {White threatens a5 to chase your knight.}
7... Na5 {Go after the b3 bishop.}
8. Ba2 {The bishop retreats.}
8... e6 {Solid development: you are fine.}
`,
    plans: [
      'Against 2.Nc3, ...d5 gives an easy game.',
      'When White chases the knight (c4, c5), bring it back to d5 and trade it on c3.',
      'Overextended pawns (c5, e5) are targets: attack them with pieces.',
    ],
  },

  // ------------------------------------------------------------------ Black vs 1.d4: QGD setup
  {
    id: 'qgd-main',
    section: 'black-d4',
    title: "Queen's Gambit Declined (2.c4)",
    you: 'b',
    summary: 'Your setup: ...Nf6, ...e6, ...d5, ...Be7, ...O-O. Against Bg5, the Lasker idea ...h6 and ...Ne4 trades pieces and frees your position.',
    pgn: `
1. d4 {White takes the center.}
1... Nf6 {Develop and control e4.}
2. c4 {The Queen's Gambit setup.}
2... e6 {Prepares ...d5 and frees the f8 bishop.}
3. Nc3 {White develops and supports e4.}
(3. Nf3 {White develops the other knight.}
 3... d5 {Take the center.} 4. Nc3 {White develops.} 4... Be7 {Develop, ready to castle.}
 5. Bg5 {White pins the f6 knight.} 5... O-O {You castle.} 6. e3 {White develops.}
 6... h6 {Ask the bishop.} 7. Bh4 {The bishop keeps the pin.}
 7... Ne4 {The Lasker idea: the knight jumps forward and forces trades.}
 8. Bxe7 {White trades bishops.} 8... Qxe7 {Recapture: your position is freer.})
3... d5 {The Queen's Gambit Declined: you hold the center.}
4. Bg5 {The classical main line: White pins the f6 knight.}
(4. cxd5 {The Exchange Variation.}
 4... exd5 {Recapture: your light-squared bishop's diagonal opens.}
 5. Bg5 {White pins the knight.} 5... c6 {Supports d5 and gives the queen b6 and a5.}
 6. e3 {White develops.} 6... Be7 {Unpin.} 7. Bd3 {White develops.}
 7... Nbd7 {Develop.} 8. Qc2 {White prepares to castle long or attack.}
 8... O-O {You castle: a solid, sound position.})
(4. Nf3 {White develops.}
 4... Be7 {Develop.} 5. Bf4 {The Bf4 line: the bishop goes outside the pawn chain.}
 5... O-O {You castle.} 6. e3 {White develops.}
 6... c5 {Strike back in the center: the main answer to Bf4.}
 7. dxc5 {White takes.} 7... Bxc5 {Recapture: active pieces, equal game.})
4... Be7 {Unpin: the bishop protects the knight.}
5. e3 {White develops.}
5... O-O {You castle.}
6. Nf3 {White develops.}
6... h6 {Ask the bishop to decide.}
7. Bh4 {The bishop keeps the pin.}
7... Ne4 {The Lasker Defense: the knight forces trades and frees your cramped position.}
8. Bxe7 {White trades bishops.}
8... Qxe7 {Recapture.}
9. cxd5 {White takes on d5.}
9... Nxc3 {Trade the knights first.}
10. bxc3 {White recaptures.}
10... exd5 {Recapture: a solid, equal position with fewer pieces to worry about.}
`,
    plans: [
      'Your setup is the same against everything: ...Nf6, ...e6, ...d5, ...Be7, ...O-O.',
      'Against Bg5, ...h6 and ...Ne4 (the Lasker idea) trade pieces and free your position.',
      'Your problem piece is the c8 bishop: free it with ...b6 and ...Bb7, or after cxd5 exd5.',
      'Against Bf4, strike back with ...c5.',
    ],
    traps: ['elephant-trap'],
  },
  {
    id: 'qgd-london',
    section: 'black-d4',
    title: 'Against the London System (Bf4)',
    you: 'b',
    summary: 'Many players at your level play the London: d4, Bf4, e3, c3. Answer with ...d5, ...e6, ...c5 and ...Bd6 to trade the strong f4 bishop.',
    pgn: `
1. d4 {White takes the center.}
1... Nf6 {Develop.}
2. Bf4 {The London System: the bishop goes out before e3.}
(2. Nf3 {White develops first.}
 2... d5 {Take the center.} 3. Bf4 {Now the London.} 3... e6 {Your setup.}
 4. e3 {White supports d4.} 4... c5 {Strike at d4.}
 5. c3 {White supports d4.} 5... Nc6 {Pressure on d4.}
 6. Nbd2 {White develops.} 6... Bd6 {Challenge the f4 bishop.}
 7. Bg3 {White keeps the bishop.} 7... O-O {You castle.}
 8. Bd3 {White develops.} 8... b6 {Prepares ...Bb7: your last piece comes out.})
2... d5 {Take the center.}
3. e3 {White supports d4.}
3... e6 {Your usual setup.}
4. Nf3 {White develops.}
4... c5 {Strike at d4: the best way to fight the London.}
5. c3 {White supports d4.}
5... Nc6 {Pressure on d4.}
6. Nbd2 {White develops.}
6... Bd6 {Challenge the f4 bishop, White's best piece.}
7. Bg3 {White avoids the trade.}
7... O-O {You castle.}
8. Bd3 {White develops.}
8... b6 {Prepares ...Bb7.}
9. Ne5 {A typical London move: the knight jumps to e5.}
9... Bb7 {Develop your last piece: balanced position.}
`,
    plans: [
      'Against the London, play ...c5: it hits d4 and opens lines for your pieces.',
      'Trade the f4 bishop with ...Bd6 when you can: it is White’s best piece.',
      'Finish development with ...b6 and ...Bb7.',
    ],
  },
  {
    id: 'qgd-catalan',
    section: 'black-d4',
    title: 'Against the Catalan (g3)',
    you: 'b',
    summary: 'The mirror of your White system. Take on c4, then free the queenside with ...a6, ...b5 and ...Bb7 — and remember the trap you know as White.',
    pgn: `
1. d4 {White takes the center.}
1... Nf6 {Develop.}
2. c4 {White gains space.}
2... e6 {Your setup.}
3. g3 {The Catalan: the bishop will go to g2.}
3... d5 {Take the center.}
4. Bg2 {The bishop on the long diagonal.}
(4. Nf3 {White develops first.}
 4... Be7 {Develop.} 5. Bg2 {The bishop.} 5... O-O {You castle.}
 6. O-O {White castles.} 6... dxc4 {Take the pawn, as in the main line.})
4... Be7 {Develop.}
5. Nf3 {White develops.}
5... O-O {You castle.}
6. O-O {White castles.}
6... dxc4 {Take the pawn: the Open Catalan.}
7. Qc2 {White will win the pawn back.}
7... a6 {Prepares ...b5 — but never with ...c6: that is the trap you set as White!}
8. Qxc4 {White wins the pawn back.}
8... b5 {Gain space with tempo.}
9. Qc2 {The queen retreats.}
9... Bb7 {Fight for the long diagonal: your bishop faces White's g2 bishop. Balanced.}
`,
    plans: [
      'Take on c4, then use the time to free your queenside: ...a6, ...b5, ...Bb7.',
      "Don't defend c4 with ...b5 and ...c6: the long diagonal opens and the a8 rook falls (see the trap).",
      'Your b7 bishop must fight White’s g2 bishop on the long diagonal.',
    ],
    traps: ['catalan-c6'],
  },
];
