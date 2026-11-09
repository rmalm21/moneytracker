/**
 * 9.7 Cocok Cuan: a match-three board of money things (coins, notes, gems, bags, cards, piggy banks). Swap two
 * neighbours to line up three or more of a kind. Four in a line leave a Petir (clears its row or column), an L or T
 * leaves a Ledakan (clears the 3×3 around it), five in a line leave a Bom Cuan (swap it with anything: every piece of
 * that kind goes). Cleared pieces fall, new ones drop in, chains score more.
 * Tagihan (bills) sit on the board: they do not match and cannot be moved, and they are paid off (cleared, +50) when a
 * piece next to them goes, or when a Petir, Ledakan or Bom takes them. Helpers: the Palu breaks one piece, and when
 * the moves run out the specials left on the board go off as an end bonus.
 * Pure: the screen animates what this says.
 */
export type Special = 'h' | 'v' | 'area' | 'bomb';
export type Tile = { id: number; kind: number; special?: Special };
export type Board = (Tile | null)[][];
export type Cell = [number, number];
/** billRate: the chance a new piece dropping in is a tagihan (only while fewer than three are on the board). */
export type Ctx = { rand: () => number; id: number; billRate?: number };
export const ROWS = 8, COLS = 7, KINDS = 6, BOMB = -1, BILL = -2;
export const MATCH_MOVES = 25, MATCH_BILLS = 6, BILL_POINTS = 50;

const at = (b: Board, r: number, c: number) => (r >= 0 && r < b.length && c >= 0 && c < b[0].length ? b[r][c] : null);
const same = (a: Tile | null, b: Tile | null) => Boolean(a && b && a.kind >= 0 && a.kind === b.kind);
const key = (r: number, c: number) => r * 100 + c;
export const copy = (b: Board): Board => b.map(row => row.map(t => (t ? { ...t } : null)));
const newTile = (ctx: Ctx, kind: number, special?: Special): Tile => ({ id: ctx.id++, kind, ...(special ? { special } : {}) });
export const isBill = (t: Tile | null | undefined) => t?.kind === BILL;
export const countBills = (b: Board) => b.reduce((n, row) => n + row.filter(isBill).length, 0);

/** A seeded random (the same seed, the same game: used by the tests). */
export function seeded(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1_000_000) / 1_000_000; }; }

/** A fresh board with no lines yet and at least one move (with some tagihan below the top two rows). */
export function newBoard(ctx: Ctx, rows = ROWS, cols = COLS, bills = 0): Board {
  for (let tries = 0; tries < 50; tries++) {
    const b: Board = [];
    for (let r = 0; r < rows; r++) {
      b.push([]);
      for (let c = 0; c < cols; c++) {
        let kind = 0;
        for (let k = 0; k < 20; k++) {
          kind = Math.floor(ctx.rand() * KINDS);
          const left = c >= 2 && b[r][c - 1]!.kind === kind && b[r][c - 2]!.kind === kind;
          const up = r >= 2 && b[r - 1][c]!.kind === kind && b[r - 2][c]!.kind === kind;
          if (!left && !up) break;
        }
        b[r].push(newTile(ctx, kind));
      }
    }
    for (let placed = 0, guard = 0; placed < bills && guard < 200; guard++) {
      const r = 2 + Math.floor(ctx.rand() * (rows - 2)), c = Math.floor(ctx.rand() * cols);
      if (isBill(b[r][c])) continue;
      b[r][c] = newTile(ctx, BILL); placed++;
    }
    if (!findGroups(b).length && hasMove(b)) return b;
  }
  throw Error('board');
}

type Run = { cells: Cell[]; kind: number; dir: 'h' | 'v' };
export type Group = { cells: Cell[]; kind: number; runs: Run[] };
/** Lines of three or more, joined where they cross (an L or a T is one group). */
export function findGroups(b: Board): Group[] {
  const runs: Run[] = [];
  for (let r = 0; r < b.length; r++) for (let c = 0; c < b[0].length;) {
    let e = c + 1; while (e < b[0].length && same(b[r][c], b[r][e])) e++;
    if (e - c >= 3) runs.push({ cells: Array.from({ length: e - c }, (_, i) => [r, c + i] as Cell), kind: b[r][c]!.kind, dir: 'h' });
    c = e;
  }
  for (let c = 0; c < b[0].length; c++) for (let r = 0; r < b.length;) {
    let e = r + 1; while (e < b.length && same(b[r][c], b[e][c])) e++;
    if (e - r >= 3) runs.push({ cells: Array.from({ length: e - r }, (_, i) => [r + i, c] as Cell), kind: b[r][c]!.kind, dir: 'v' });
    r = e;
  }
  const groups: Group[] = [];
  for (const run of runs) {
    const keys = new Set(run.cells.map(([r, c]) => key(r, c)));
    const hit = groups.filter(g => g.kind === run.kind && g.cells.some(([r, c]) => keys.has(key(r, c))));
    if (!hit.length) { groups.push({ cells: [...run.cells], kind: run.kind, runs: [run] }); continue; }
    const into = hit[0];
    for (const g of hit.slice(1)) { into.cells.push(...g.cells); into.runs.push(...g.runs); groups.splice(groups.indexOf(g), 1); }
    into.cells.push(...run.cells); into.runs.push(run);
    const seen = new Set<number>(); into.cells = into.cells.filter(([r, c]) => { const k = key(r, c); if (seen.has(k)) return false; seen.add(k); return true; });
  }
  return groups;
}

const swapIn = (b: Board, a: Cell, z: Cell) => { const t = b[a[0]][a[1]]; b[a[0]][a[1]] = b[z[0]][z[1]]; b[z[0]][z[1]] = t; };
export const adjacent = (a: Cell, z: Cell) => Math.abs(a[0] - z[0]) + Math.abs(a[1] - z[1]) === 1;
/** A swap counts when it makes a line, or when a Bom Cuan is moved. A tagihan cannot be moved. */
export function validSwap(b: Board, a: Cell, z: Cell) {
  const ta = at(b, ...a), tz = at(b, ...z);
  if (!adjacent(a, z) || !ta || !tz || isBill(ta) || isBill(tz)) return false;
  if (ta.kind === BOMB || tz.kind === BOMB) return true;
  const t = copy(b); swapIn(t, a, z); return findGroups(t).length > 0;
}
export function hasMove(b: Board) { return findMove(b) !== null; }
/** A move that works (for the hint after a few quiet seconds). */
export function findMove(b: Board): [Cell, Cell] | null {
  for (let r = 0; r < b.length; r++) for (let c = 0; c < b[0].length; c++) {
    if (c + 1 < b[0].length && validSwap(b, [r, c], [r, c + 1])) return [[r, c], [r, c + 1]];
    if (r + 1 < b.length && validSwap(b, [r, c], [r + 1, c])) return [[r, c], [r + 1, c]];
  }
  return null;
}

export type Step = { board: Board; cleared: Cell[]; created: { cell: Cell; tile: Tile }[]; points: number; byKind: Record<number, number>; fired: Special[]; bills: number };
/** Everything a set of cells takes with it: specials fire (a row, a column, the 3×3 around, or a whole kind). */
function spread(b: Board, start: Cell[], fired: Special[]): Set<number> {
  const out = new Set(start.map(([r, c]) => key(r, c)));
  const queue = [...start];
  while (queue.length) {
    const [r, c] = queue.pop()!, t = b[r][c]; if (!t?.special) continue;
    fired.push(t.special);
    const add: Cell[] = [];
    if (t.special === 'h') for (let x = 0; x < b[0].length; x++) add.push([r, x]);
    else if (t.special === 'v') for (let y = 0; y < b.length; y++) add.push([y, c]);
    else if (t.special === 'area') for (let y = r - 1; y <= r + 1; y++) for (let x = c - 1; x <= c + 1; x++) add.push([y, x]);
    else { const k = mostKind(b); for (let y = 0; y < b.length; y++) for (let x = 0; x < b[0].length; x++) if (b[y][x]?.kind === k) add.push([y, x]); }
    for (const [y, x] of add) if (at(b, y, x) && !out.has(key(y, x))) { out.add(key(y, x)); queue.push([y, x]); }
  }
  return out;
}
const mostKind = (b: Board) => { const n: Record<number, number> = {}; for (const row of b) for (const t of row) if (t && t.kind >= 0) n[t.kind] = (n[t.kind] || 0) + 1; return Number(Object.entries(n).sort((a, z) => z[1] - a[1])[0]?.[0] ?? 0); };

/** Clears cells (and what they set off); a tagihan next to anything that goes is paid off too. */
function blast(b: Board, start: Cell[], chain: number, fired: Special[], created: Step['created']): Step {
  const gone = spread(b, start, fired);
  for (const k of [...gone]) {
    const r = Math.floor(k / 100), c = k % 100; if (isBill(b[r][c])) continue;
    for (const [y, x] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]] as Cell[]) if (isBill(at(b, y, x))) gone.add(key(y, x));
  }
  const byKind: Record<number, number> = {}, cleared: Cell[] = []; let bills = 0, pieces = 0;
  for (const k of gone) {
    const r = Math.floor(k / 100), c = k % 100, t = b[r][c]; if (!t) continue;
    if (t.kind >= 0) byKind[t.kind] = (byKind[t.kind] || 0) + 1;
    if (isBill(t)) bills++; else pieces++;
    cleared.push([r, c]); b[r][c] = null;
  }
  for (const { cell, tile } of created) b[cell[0]][cell[1]] = tile;
  const points = pieces * 10 * chain + bills * BILL_POINTS + created.length * 30 + (fired.includes('bomb') ? 100 : 0);
  return { board: b, cleared, created, points, byKind, fired, bills };
}

/** One clearing: the lines on the board (or what a moved Bom Cuan takes), what they set off, the specials they leave. */
export function clearOnce(board: Board, ctx: Ctx, chain: number, moved: Cell[] = []): Step | null {
  const b = copy(board), fired: Special[] = [], created: Step['created'] = [];
  let start: Cell[] = [];
  // A Bom Cuan that was moved: every piece of the other one's kind goes (two bombs: the whole board).
  const bombAt = moved.find(([r, c]) => b[r][c]?.kind === BOMB);
  if (bombAt && chain === 1) {
    const other = moved.find(m => m !== bombAt)!, ot = at(b, ...other);
    if (ot?.kind === BOMB) { for (let r = 0; r < b.length; r++) for (let c = 0; c < b[0].length; c++) start.push([r, c]); }
    else if (ot) { start.push(bombAt); for (let r = 0; r < b.length; r++) for (let c = 0; c < b[0].length; c++) if (b[r][c]?.kind === ot.kind) start.push([r, c]); }
    fired.push('bomb');
  }
  const groups = findGroups(b);
  if (!start.length && !groups.length) return null;
  for (const g of groups) {
    start.push(...g.cells);
    const longest = Math.max(...g.runs.map(r => r.cells.length)), cross = g.runs.some(r => r.dir === 'h') && g.runs.some(r => r.dir === 'v');
    const special: Special | null = longest >= 5 ? 'bomb' : cross ? 'area' : longest === 4 ? g.runs[0].dir : null;
    if (special) {
      const keys = new Set(g.cells.map(([r, c]) => key(r, c)));
      const cell = moved.find(([r, c]) => keys.has(key(r, c))) || g.runs.reduce((a, r) => r.cells.length > a.cells.length ? r : a).cells[Math.floor(longest / 2)];
      created.push({ cell, tile: newTile(ctx, special === 'bomb' ? BOMB : g.kind, special) });
    }
  }
  return blast(b, start, chain, fired, created);
}

/** The Palu: breaks one piece (a special goes off; a tagihan is paid off). */
export function hammer(board: Board, cell: Cell): Step | null {
  if (!at(board, ...cell)) return null;
  return blast(copy(board), [cell], 1, [], []);
}
/** When the moves run out: every special still on the board goes off (null when there is none). */
export function endBonus(board: Board): Step | null {
  const cells: Cell[] = [];
  for (let r = 0; r < board.length; r++) for (let c = 0; c < board[0].length; c++) if (board[r][c]?.special) cells.push([r, c]);
  return cells.length ? blast(copy(board), cells, 2, [], []) : null;
}

/** Pieces fall into the gaps; new ones drop in from the top (now and then a new tagihan). */
export function fall(board: Board, ctx: Ctx): Board {
  const b = copy(board), rows = b.length;
  let bills = countBills(b);
  for (let c = 0; c < b[0].length; c++) {
    const stack = b.map(row => row[c]).filter(Boolean) as Tile[];
    const fresh = Array.from({ length: rows - stack.length }, () => {
      if (ctx.billRate && bills < 3 && ctx.rand() < ctx.billRate) { bills++; return newTile(ctx, BILL); }
      return newTile(ctx, Math.floor(ctx.rand() * KINDS));
    });
    const col = [...fresh, ...stack];
    for (let r = 0; r < rows; r++) b[r][c] = col[r];
  }
  return b;
}

/** No move left (or the Acak helper): the pieces are mixed (specials and tagihan stay) until a move appears. */
export function shuffle(board: Board, ctx: Ctx): Board {
  for (let tries = 0; tries < 100; tries++) {
    const b = copy(board), plain: Tile[] = [];
    for (const row of b) for (const t of row) if (t && t.kind >= 0 && !t.special) plain.push(t);
    for (let i = plain.length - 1; i > 0; i--) { const j = Math.floor(ctx.rand() * (i + 1)); [plain[i].kind, plain[j].kind] = [plain[j].kind, plain[i].kind]; }
    if (!findGroups(b).length && hasMove(b)) return b;
  }
  return newBoard(ctx, board.length, board[0].length, Math.min(countBills(board), MATCH_BILLS));
}

/** A whole move, start to end (for the tests and for a quick simulation): the steps, the points, and the board after. */
export function playMove(board: Board, ctx: Ctx, a: Cell, z: Cell): { steps: Step[]; points: number; board: Board; chains: number } | null {
  if (!validSwap(board, a, z)) return null;
  let b = copy(board); swapIn(b, a, z);
  const steps: Step[] = []; let points = 0, chain = 1;
  for (let step = clearOnce(b, ctx, chain, [a, z]); step; step = clearOnce(b, ctx, ++chain)) {
    steps.push(step); points += step.points; b = fall(step.board, ctx);
    if (chain > 30) break;
  }
  if (!hasMove(b)) b = shuffle(b, ctx);
  return { steps, points, board: b, chains: steps.length };
}
export const swapCells = (b: Board, a: Cell, z: Cell) => { const t = copy(b); swapIn(t, a, z); return t; };

// ——— The pieces and the stars ———
export const PIECES = [
  { key: '1fa99', name: 'koin' }, { key: '1f4b5', name: 'uang kertas' }, { key: '1f48e', name: 'permata' },
  { key: '1f4b0', name: 'kantong uang' }, { key: '1f4b3', name: 'kartu' }, { key: '1f437', name: 'celengan' },
];
/** Stars for a score after 25 moves. */
export const matchStars = (score: number) => score >= MATCH_STAR[2] ? 3 : score >= MATCH_STAR[1] ? 2 : score >= MATCH_STAR[0] ? 1 : 0;
export const MATCH_STAR = [1800, 3000, 4200] as const;
