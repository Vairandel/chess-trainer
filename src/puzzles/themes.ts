/** The puzzle themes the app trains, with the idea behind each (names follow the Lichess tags). */
export const THEMES: Record<string, { name: string; idea: string }> = {
  fork: {
    name: 'Fork',
    idea: 'One piece attacks two (or more) targets at once. The opponent can only save one of them. Knights and queens are the usual forkers.',
  },
  pin: {
    name: 'Pin',
    idea: 'A piece cannot move without exposing a more valuable piece behind it (often the king). Attack the pinned piece again, or exploit that it no longer defends.',
  },
  skewer: {
    name: 'Skewer',
    idea: 'The reverse of a pin: a valuable piece is attacked, and when it moves away, the piece behind it falls.',
  },
  discoveredAttack: {
    name: 'Discovered attack',
    idea: 'Moving one piece uncovers an attack by another one behind it. The moving piece can make its own threat at the same time.',
  },
  doubleCheck: {
    name: 'Double check',
    idea: 'Two pieces give check at once. The only defence is to move the king, so it is often decisive.',
  },
  backRankMate: {
    name: 'Back-rank mate',
    idea: 'A rook or queen mates on the last rank because the king is blocked in by its own pawns. Always check whether the back rank is protected.',
  },
  mateIn1: {
    name: 'Mate in 1',
    idea: 'Checkmate in one move. Look at every check first.',
  },
  mateIn2: {
    name: 'Mate in 2',
    idea: 'Checkmate in two moves, usually starting with a check or a sacrifice that forces the reply.',
  },
  hangingPiece: {
    name: 'Hanging piece',
    idea: 'A piece is undefended or not defended enough. Take it — or notice that yours is hanging.',
  },
  trappedPiece: {
    name: 'Trapped piece',
    idea: 'A piece has no safe square left. Attack it and it is lost.',
  },
  sacrifice: {
    name: 'Sacrifice',
    idea: 'Give material on purpose to get something bigger: mate, a winning attack, or more material back.',
  },
  deflection: {
    name: 'Deflection',
    idea: 'Force a defender away from the square or piece it protects.',
  },
  attraction: {
    name: 'Attraction',
    idea: 'Force a piece (often the king) onto a square where it can be attacked, forked or mated.',
  },
  defensiveMove: {
    name: 'Defensive move',
    idea: 'The best move is a defensive one: stop the threat precisely instead of attacking.',
  },
  promotion: {
    name: 'Promotion',
    idea: 'Push a pawn to the last rank, or clear its path so it can promote.',
  },
  quietMove: {
    name: 'Quiet move',
    idea: 'The key move is not a check or a capture. It prepares an unstoppable threat.',
  },
};
