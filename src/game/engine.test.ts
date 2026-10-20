import { describe, expect, it } from 'vitest';
import { playBotWeek } from './bot';
import { GOAL_PRESETS, applyAction, createGame, currentPlayer, scores, walkHours } from './engine';
import type { GameState, PlayerSetup } from './types';

const human = (name: string): PlayerSetup => ({ name, controller: 'human', owner: 'host' });
const bot = (name: string): PlayerSetup => ({ name, controller: 'bot', owner: 'host' });

function act(state: GameState, ...actions: Parameters<typeof applyAction>[2][]): GameState {
  for (const a of actions) {
    const r = applyAction(state, currentPlayer(state).id, a);
    expect(r.error, JSON.stringify(a)).toBeUndefined();
    state = r.state;
  }
  return state;
}

describe('engine', () => {
  it('walks the shorter way round the ring', () => {
    expect(walkHours('lowcost', 'rent')).toBe(1);
    expect(walkHours('lowcost', 'park')).toBe(1);
    expect(walkHours('lowcost', 'college')).toBe(7);
  });

  it('rejects moves out of turn and never mutates the input', () => {
    const g = createGame([human('A'), human('B')], GOAL_PRESETS.standard, 1);
    const before = JSON.stringify(g);
    expect(applyAction(g, 'p2', { type: 'move', to: 'bank' }).error).toMatch(/turn/);
    applyAction(g, 'p1', { type: 'move', to: 'bank' });
    expect(JSON.stringify(g)).toBe(before);
  });

  it('gets a job, works a shift and gets paid', () => {
    let g = createGame([human('A')], GOAL_PRESETS.standard, 1);
    g = act(g, { type: 'move', to: 'burger' }, { type: 'apply', jobId: 'burger-cook' }, { type: 'work' });
    const p = g.players[0];
    expect(p.jobId).toBe('burger-cook');
    expect(p.cash).toBe(200 + 30);
    expect(p.hoursLeft).toBe(60 - 4 - 1 - 6);
  });

  it('turns down under-qualified applicants', () => {
    let g = createGame([human('A')], GOAL_PRESETS.standard, 1);
    g = act(g, { type: 'move', to: 'employment' }, { type: 'apply', jobId: 'factory-ceo' });
    expect(g.players[0].jobId).toBeNull();
    expect(g.log.at(-1)?.text).toMatch(/turned down/);
  });

  it('graduates after enough lessons', () => {
    let g = createGame([human('A')], GOAL_PRESETS.standard, 1);
    g = act(g, { type: 'move', to: 'college' }, { type: 'enroll', courseId: 'trade' });
    for (let i = 0; i < 8; i++) {
      if (g.players[0].hoursLeft < 6) g = act(g, { type: 'endTurn' }, { type: 'move', to: 'college' });
      g = act(g, { type: 'attend' });
    }
    expect(g.players[0].degrees).toEqual(['trade']);
    expect(scores(g.players[0], g.stockPrice).education).toBe(15);
  });

  it('weekend: hunger costs happiness and next-week hours', () => {
    let g = createGame([human('A')], GOAL_PRESETS.standard, 1);
    g = act(g, { type: 'endTurn' });
    expect(g.week).toBe(2);
    expect(g.players[0].hoursLeft).toBe(50);
    expect(g.lastReport?.lines.join(' ')).toMatch(/hungry/);
  });

  it('evicts players who never pay rent', () => {
    let g = createGame([human('A')], GOAL_PRESETS.standard, 3);
    for (let i = 0; i < 6; i++) g = act(g, { type: 'endTurn' });
    expect(g.players[0].housing).toBeNull();
    expect(g.players[0].location).toBe('rent');
  });
});

describe('bots', () => {
  for (const [preset, maxWeeks] of [['quick', 80], ['standard', 60], ['long', 90]] as const) {
    it(`four bots finish a ${preset} game`, () => {
      for (const seed of [1, 2, 3]) {
        let g = createGame([bot('A'), bot('B'), bot('C'), bot('D')], GOAL_PRESETS[preset], seed);
        while (g.phase === 'playing' && g.week <= maxWeeks) g = playBotWeek(g);
        expect(g.phase, `seed ${seed} week ${g.week} ${JSON.stringify(g.players.map((p) => scores(p, g.stockPrice)))}`).toBe('over');
      }
    });
  }
});
