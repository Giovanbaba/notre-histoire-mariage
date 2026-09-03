import { DurableObject } from 'cloudflare:workers';
import { ARTIST_ALIASES, CHALLENGES, SONGS, TITLE_ALIASES, fuzzyMatch, normalize } from './data';

export type AppEnv = Env & { ADMIN_PIN?: string; OPENAI_API_KEY?: string; AI_VISION_MODEL?: string; AI_TTS_MODEL?: string; AI_VOICE?: string };

type ChallengeTable = { completed: string[]; score: number; bonus: number; blocked: boolean; updatedAt: string | null };
type PuzzleSubmission = { team: string; teamKey: string; attempt: number; order: number[]; exact: number; distance: number; score: number; elapsed: number; createdAt: number };
type Player = { key: string; firstName: string; lastName: string; score: number; perfect: number; totalMs: number };
type Answer = { key: string; title: string; artist: string; year: string; elapsed: number; submittedAt: number; result?: { title: MatchResult; artist: MatchResult; year: boolean; base: number; speed: number; total: number }; scored?: boolean };
type MatchResult = { status: string; confidence: number };
type QuizState = {
  phase: 'active' | 'finished';
  players: Record<string, Player>;
  answers: Record<string, Record<string, Answer>>;
  windows: Record<string, { startedAt: number; closesAt: number; startedBy: string }>;
  reviews: Record<string, { songId: number; key: string; answer: Answer }>;
};
type SocketAttachment = { playerKey: string | null; admin: boolean };
type SocketMessage = { id?: string; type?: string; payload?: unknown };

const emptyQuiz = (): QuizState => ({ phase: 'active', players: {}, answers: {}, windows: {}, reviews: {} });

async function safeEqual(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

export class WeddingState extends DurableObject<AppEnv> {
  constructor(ctx: DurableObjectState, env: AppEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS challenge_tables (
          name TEXT PRIMARY KEY,
          completed TEXT NOT NULL DEFAULT '[]',
          score INTEGER NOT NULL DEFAULT 0,
          bonus INTEGER NOT NULL DEFAULT 0,
          blocked INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS puzzle_submissions (
          id TEXT PRIMARY KEY,
          team TEXT NOT NULL,
          team_key TEXT NOT NULL,
          attempt INTEGER NOT NULL,
          order_json TEXT NOT NULL,
          exact INTEGER NOT NULL,
          distance INTEGER NOT NULL,
          score INTEGER NOT NULL,
          elapsed INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS puzzle_team_idx ON puzzle_submissions(team_key, created_at);
      `);
    });
  }

  private challengeRows() {
    return this.ctx.storage.sql.exec<{ name: string; completed: string; score: number; bonus: number; blocked: number; updated_at: string | null }>(
      'SELECT name, completed, score, bonus, blocked, updated_at FROM challenge_tables',
    ).toArray().map(row => ({
      name: row.name,
      completed: JSON.parse(row.completed) as string[],
      score: row.score,
      bonus: row.bonus,
      blocked: Boolean(row.blocked),
      updatedAt: row.updated_at,
    }));
  }

  private leaderboard(rows = this.challengeRows()) {
    return rows.slice().sort((a, b) => b.score - a.score || b.completed.length - a.completed.length || a.name.localeCompare(b.name))
      .map((row, index) => ({ name: row.name, score: row.score, completed: row.completed.length, blocked: row.blocked, updatedAt: row.updatedAt, rank: index + 1 }));
  }

  private table(name: string): ChallengeTable {
    const row = this.challengeRows().find(item => item.name === name);
    return row ? { completed: row.completed, score: row.score, bonus: row.bonus, blocked: row.blocked, updatedAt: row.updatedAt } : { completed: [], score: 0, bonus: 0, blocked: false, updatedAt: null };
  }

  private saveTable(name: string, table: ChallengeTable): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO challenge_tables(name, completed, score, bonus, blocked, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET completed=excluded.completed, score=excluded.score,
       bonus=excluded.bonus, blocked=excluded.blocked, updated_at=excluded.updated_at`,
      name, JSON.stringify(table.completed), table.score, table.bonus, table.blocked ? 1 : 0, table.updatedAt,
    );
  }

  async getChallenges(tableName: string) {
    const current = tableName ? this.table(tableName) : { completed: [], score: 0, bonus: 0, blocked: false, updatedAt: null };
    return { challenges: CHALLENGES, table: tableName, completed: current.completed, score: current.score, blocked: current.blocked, leaderboard: this.leaderboard() };
  }

  async completeChallenge(tableName: string, challengeId: string) {
    const challenge = CHALLENGES.find(item => item.id === challengeId);
    if (!tableName || !challenge) throw new Error('Table ou défi invalide.');
    const current = this.table(tableName);
    if (current.blocked) throw new Error('Cette table est temporairement bloquée.');
    if (!current.completed.includes(challengeId)) {
      current.completed.push(challengeId);
      current.score += challenge.points;
      current.updatedAt = new Date().toISOString();
      this.saveTable(tableName, current);
    }
    return { completed: current.completed, score: current.score, leaderboard: this.leaderboard() };
  }

  async adminChallenges() {
    const tables = this.challengeRows().sort((a, b) => b.score - a.score);
    return { challenges: CHALLENGES, tables, leaderboard: this.leaderboard(tables) };
  }

  async adminChallengeAction(tableName: string, action: string, points: number, challengeId: string) {
    if (!tableName) throw new Error('Table invalide.');
    const current = this.table(tableName);
    if (action === 'adjust') {
      const delta = Math.max(-2000, Math.min(2000, Number(points || 0)));
      current.score = Math.max(0, current.score + delta); current.bonus += delta;
    } else if (action === 'remove-challenge') {
      const challenge = CHALLENGES.find(item => item.id === challengeId);
      if (!challenge || !current.completed.includes(challengeId)) throw new Error('Défi non trouvé.');
      current.completed = current.completed.filter(id => id !== challengeId); current.score = Math.max(0, current.score - challenge.points);
    } else if (action === 'add-challenge') {
      const challenge = CHALLENGES.find(item => item.id === challengeId);
      if (!challenge) throw new Error('Défi inconnu.');
      if (!current.completed.includes(challengeId)) { current.completed.push(challengeId); current.score += challenge.points; }
    } else if (action === 'toggle-block') current.blocked = !current.blocked;
    else if (action === 'reset') { this.saveTable(tableName, { completed: [], score: 0, bonus: 0, blocked: false, updatedAt: null }); return { table: this.table(tableName), leaderboard: this.leaderboard() }; }
    else if (action === 'delete-table') { this.ctx.storage.sql.exec('DELETE FROM challenge_tables WHERE name = ?', tableName); return { deleted: true, leaderboard: this.leaderboard() }; }
    else throw new Error('Action inconnue.');
    current.updatedAt = new Date().toISOString(); this.saveTable(tableName, current);
    return { table: current, leaderboard: this.leaderboard() };
  }

  async submitPuzzle(input: PuzzleSubmission) {
    const attempts = this.ctx.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM puzzle_submissions WHERE team_key = ?', input.teamKey).one().count;
    if (attempts >= 3) throw new Error('Vos 3 tentatives ont déjà été utilisées.');
    const attempt = attempts + 1;
    const id = crypto.randomUUID();
    this.ctx.storage.sql.exec(
      'INSERT INTO puzzle_submissions(id, team, team_key, attempt, order_json, exact, distance, score, elapsed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, input.team.slice(0, 160), input.teamKey.slice(0, 160), attempt, JSON.stringify(input.order), input.exact, input.distance, input.score, input.elapsed, Date.now(),
    );
    return { ...input, id, attempt, createdAt: Date.now() };
  }

  async puzzleResults() {
    return this.ctx.storage.sql.exec<{ team: string; team_key: string; attempt: number; order_json: string; exact: number; distance: number; score: number; elapsed: number; created_at: number }>(
      'SELECT team, team_key, attempt, order_json, exact, distance, score, elapsed, created_at FROM puzzle_submissions ORDER BY created_at DESC LIMIT 1000',
    ).toArray().map(row => ({ team: row.team, teamKey: row.team_key, attempt: row.attempt, order: JSON.parse(row.order_json) as number[], exact: row.exact, distance: row.distance, score: row.score, elapsed: row.elapsed, createdAt: row.created_at }));
  }

  async resetPuzzleResults() {
    this.ctx.storage.sql.exec('DELETE FROM puzzle_submissions');
    return { reset: true };
  }

  async resetChallengeResults() {
    this.ctx.storage.sql.exec('DELETE FROM challenge_tables');
    return { reset: true };
  }

  async getAnalysis(key: string) { return await this.ctx.storage.get<Record<string, unknown>>(`analysis:${key}`) ?? null; }
  async saveAnalysis(key: string, analysis: Record<string, unknown>) { await this.ctx.storage.put(`analysis:${key}`, analysis); return analysis; }
}

export class HitKissRoom extends DurableObject<AppEnv> {
  private async state(): Promise<QuizState> {
    const state = (await this.ctx.storage.get<QuizState>('state')) ?? emptyQuiz();
    this.reconcileScores(state);
    return state;
  }
  private async save(state: QuizState): Promise<void> { await this.ctx.storage.put('state', state); }
  private reconcileScores(state: QuizState) {
    for (const player of Object.values(state.players)) { player.score = 0; player.perfect = 0; player.totalMs = 0; }
    for (const answers of Object.values(state.answers)) for (const answer of Object.values(answers)) {
      if (!answer.result) continue;
      answer.result.speed = 0;
      answer.result.total = answer.result.base;
      if (!answer.scored || !state.players[answer.key]) continue;
      const player = state.players[answer.key];
      player.score += answer.result.base;
      player.totalMs += answer.elapsed;
      if (answer.result.base === 4) player.perfect += 1;
    }
  }
  private ranking(state: QuizState) { return Object.values(state.players).map(player => ({ ...player })).sort((a, b) => b.score - a.score || a.totalMs - b.totalMs || b.perfect - a.perfect || a.firstName.localeCompare(b.firstName)); }

  private publicState(state: QuizState, forAdmin = false, playerKey: string | null = null) {
    const now = Date.now();
    const playerAnswers = forAdmin ? Object.fromEntries(Object.keys(state.players).map(key => [key, SONGS.map((song, index) => {
      const answer = state.answers[song.id]?.[key];
      return answer ? { songId: song.id, number: index + 1, correctTitle: song.title, correctArtists: song.artists, correctYears: song.years, title: answer.title, artist: answer.artist, year: answer.year, points: answer.result?.total ?? null, titleStatus: answer.result?.title.status ?? null, artistStatus: answer.result?.artist.status ?? null, yearCorrect: answer.result?.year ?? null, elapsed: answer.elapsed } : null;
    }).filter(Boolean)])) : undefined;
    return {
      phase: state.phase, playerCount: Object.keys(state.players).length, songCount: SONGS.length,
      ranking: this.ranking(state), reviews: forAdmin ? state.reviews : {}, playerAnswers,
      songs: SONGS.map((song, index) => {
        const mine = playerKey ? state.answers[song.id]?.[playerKey] : null;
        return { id: song.id, number: index + 1, ...(forAdmin ? song : {}), window: state.windows[song.id] ? { ...state.windows[song.id], closed: now >= state.windows[song.id].closesAt } : null, answered: Boolean(mine), myAnswer: mine ? { title: mine.title, artist: mine.artist, year: mine.year } : undefined, answersCount: forAdmin ? Object.keys(state.answers[song.id] || {}).length : undefined };
      }),
    };
  }

  private send(ws: WebSocket, type: string, data: unknown, id?: string) { ws.send(JSON.stringify({ type, data, id })); }
  private broadcast(state: QuizState) {
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as SocketAttachment | null;
      if (attachment?.admin) this.send(ws, 'admin-state', this.publicState(state, true));
      else this.send(ws, 'state', this.publicState(state, false, attachment?.playerKey || null));
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket required', { status: 426 });
    const pair = new WebSocketPair();
    pair[1].serializeAttachment({ playerKey: null, admin: false } satisfies SocketAttachment);
    this.ctx.acceptWebSocket(pair[1]);
    const state = await this.state();
    this.send(pair[1], 'state', this.publicState(state));
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  private scoreAnswer(song: (typeof SONGS)[number], answer: Answer, state: QuizState) {
    const title = fuzzyMatch(answer.title, [song.title], TITLE_ALIASES[song.id]);
    const artist = fuzzyMatch(answer.artist, song.artists, ARTIST_ALIASES[song.id]);
    const year = song.years.includes(normalize(answer.year));
    const base = (title.status === 'correct' ? 1 : 0) + (artist.status === 'correct' ? 1 : 0) + (year ? 2 : 0);
    // La rapidité ne donne aucun point. Le temps cumulé sert uniquement à
    // départager les joueurs ayant exactement le même total de points.
    const speed = 0;
    answer.result = { title, artist, year, base, speed, total: base + speed };
    if (title.status === 'review' || artist.status === 'review') state.reviews[`${song.id}:${answer.key}`] = { songId: song.id, key: answer.key, answer };
    else { const player = state.players[answer.key]; player.score += base + speed; player.totalMs += answer.elapsed; if (base === 4) player.perfect += 1; answer.scored = true; }
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    let message: SocketMessage;
    try { message = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)) as SocketMessage; }
    catch { this.send(ws, 'ack', { ok: false, error: 'Message invalide.' }); return; }
    const state = await this.state();
    const attachment = (ws.deserializeAttachment() as SocketAttachment | null) ?? { playerKey: null, admin: false };
    const payload = (message.payload && typeof message.payload === 'object' ? message.payload : {}) as Record<string, unknown>;
    try {
      let result: Record<string, unknown> = { ok: true };
      if (message.type === 'join') {
        const firstName = String(payload.firstName || '').trim().slice(0, 40); const lastName = String(payload.lastName || '').trim().slice(0, 40);
        if (!firstName || !lastName) throw new Error('Prénom et nom requis.');
        const key = normalize(`${firstName} ${lastName}`).replace(/ /g, '-');
        if (!state.players[key]) state.players[key] = { key, firstName, lastName, score: 0, perfect: 0, totalMs: 0 };
        attachment.playerKey = key; ws.serializeAttachment(attachment); result = { ok: true, player: state.players[key] };
      } else if (message.type === 'admin-login') {
        if (!this.env.ADMIN_PIN || !await safeEqual(String(message.payload ?? ''), this.env.ADMIN_PIN)) throw new Error('Code incorrect.');
        attachment.admin = true; ws.serializeAttachment(attachment); result = { ok: true, state: this.publicState(state, true) };
      } else if (message.type === 'answer') {
        const songId = Number(payload.songId); const song = SONGS.find(item => item.id === songId); const key = attachment.playerKey;
        if (!key || !song || state.phase !== 'active') throw new Error('Le quiz n’est pas ouvert.');
        state.answers[song.id] ??= {}; if (state.answers[song.id][key]) throw new Error('Réponse déjà validée pour ce morceau.');
        const now = Date.now(); if (state.windows[song.id] && now >= state.windows[song.id].closesAt) throw new Error('Ce morceau est verrouillé.');
        if (!state.windows[song.id]) state.windows[song.id] = { startedAt: now, closesAt: now + 300000, startedBy: key };
        const answer: Answer = { key, title: String(payload.title || '').slice(0, 100), artist: String(payload.artist || '').slice(0, 100), year: String(payload.year || '').slice(0, 10), elapsed: Math.max(0, now - state.windows[song.id].startedAt), submittedAt: now };
        state.answers[song.id][key] = answer; this.scoreAnswer(song, answer, state); result = { ok: true, elapsed: answer.elapsed, closesAt: state.windows[song.id].closesAt };
      } else if (message.type === 'admin-action') {
        const pinOk = attachment.admin || Boolean(this.env.ADMIN_PIN && await safeEqual(String(payload.pin || ''), this.env.ADMIN_PIN)); if (!pinOk) throw new Error('Code incorrect.');
        const action = String(payload.action || ''); const songId = Number(payload.songId);
        if (action === 'start') state.phase = 'active'; else if (action === 'finish') state.phase = 'finished';
        else if (action === 'reopen' && songId) {
          for (const answer of Object.values(state.answers[songId] || {})) if (answer.scored && state.players[answer.key] && answer.result) { const player = state.players[answer.key]; player.score -= answer.result.total; player.totalMs -= answer.elapsed; if (answer.result.base === 4) player.perfect -= 1; delete state.reviews[`${songId}:${answer.key}`]; }
          state.answers[songId] = {}; delete state.windows[songId];
        } else if (action === 'reset') Object.assign(state, emptyQuiz()); else throw new Error('Action inconnue.');
      } else throw new Error('Action inconnue.');
      await this.save(state); this.send(ws, 'ack', result, message.id); this.broadcast(state);
    } catch (error) { this.send(ws, 'ack', { ok: false, error: error instanceof Error ? error.message : 'Erreur.' }, message.id); }
  }

  async webSocketClose() {}
}
