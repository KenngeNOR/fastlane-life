// A simple rule-based computer opponent. It picks one action at a time; if
// it needs to be somewhere else first, it returns a move there.

import { APPLIANCES, COURSES, HOUSING, JOBS, JOB_BY_ID, SHIFT_HOURS, CLASS_HOURS, type LocationId } from './data';
import { applyAction, courseBlockers, currentPlayer, homeLocation, jobBlockers, scores, walkHours } from './engine';
import type { Action, GameState } from './types';

export function botAction(state: GameState): Action {
  const p = currentPlayer(state);
  const goals = state.goals;
  const s = scores(p, state.stockPrice);
  const job = p.jobId ? JOB_BY_ID[p.jobId] : null;

  /** Do `action` at `loc`, walking there first; skip if there's no time. */
  const goDo = (loc: LocationId, action: Action, hoursNeeded = 0): Action | null => {
    if (walkHours(p.location, loc) + hoursNeeded > p.hoursLeft) return null;
    return p.location === loc ? action : { type: 'move', to: loc };
  };
  const pick = (...options: (Action | null | false | undefined | "")[]): Action => {
    for (const o of options) if (o) return o;
    return { type: 'endTurn' };
  };

  if (p.hoursLeft < 1) return { type: 'endTurn' };

  const bestJob = JOBS.filter((j) => jobBlockers(p, j).length === 0 && j.wage > (job?.wage ?? 0)).sort(
    (a, b) => b.rank - a.rank || b.wage - a.wage,
  )[0];
  const nextCourse = COURSES.find((c) => courseBlockers(p, c.id).length === 0);
  const reserve = 120;
  const appliance = buyableAppliance(p);

  return pick(
    // Survival first.
    !p.ateThisWeek && p.food === 0 && p.cash >= 15 && goDo('burger', { type: 'buy', itemId: 'meal' }),
    !p.housing && p.cash >= HOUSING.lowcost.weeklyRent * 2 && goDo('rent', { type: 'rent', housing: 'lowcost' }),
    p.rentDebt > 0 && p.cash >= p.rentDebt + 30 && goDo('rent', { type: 'payRent', weeks: 0 }),
    p.housing && p.rentPrepaidWeeks === 0 && p.cash >= HOUSING[p.housing].weeklyRent * 2 + reserve &&
      goDo('rent', { type: 'payRent', weeks: 2 }),
    (p.clothes === 0 || p.clothesWeeks <= 1) && p.cash >= 60 && goDo('bargain', { type: 'buy', itemId: 'casual' }),

    // Career moves.
    bestJob && goDo('employment', { type: 'apply', jobId: bestJob.id }, 1),
    needsBetterClothes(p.clothes, 2) && p.cash >= 250 + reserve && p.degrees.length > 0 &&
      goDo('threads', { type: 'buy', itemId: 'business' }),
    needsBetterClothes(p.clothes, 3) && p.cash >= 600 + reserve && p.degrees.length >= 3 &&
      goDo('threads', { type: 'buy', itemId: 'executive' }),

    // Education.
    !p.enrolled && nextCourse && (s.education < goals.education || s.career < goals.career) && p.cash + p.savings >= nextCourse.tuition + reserve &&
      (p.cash >= nextCourse.tuition
        ? goDo('college', { type: 'enroll', courseId: nextCourse.id })
        : goDo('bank', { type: 'withdraw', amount: nextCourse.tuition - p.cash + 20 })),

    // Happiness.
    s.happiness < goals.happiness && p.housing && p.relaxedThisWeek < 1 && goDo(homeLocation(p), { type: 'relax' }, 6),
    s.happiness < goals.happiness && appliance &&
      (p.cash >= APPLIANCES[appliance].price
        ? goDo('gadget', { type: 'buyAppliance', applianceId: appliance })
        : goDo('bank', { type: 'withdraw', amount: APPLIANCES[appliance].price - p.cash + 20 })),
    s.happiness < goals.happiness && p.housing === 'lowcost' && p.savings > 2500 && p.rentDebt === 0 &&
      (p.cash >= HOUSING.luxury.weeklyRent * 2
        ? goDo('rent', { type: 'rent', housing: 'luxury' })
        : goDo('bank', { type: 'withdraw', amount: HOUSING.luxury.weeklyRent * 2 })),

    // Keep cash safe and growing.
    p.cash > 500 && goDo('bank', { type: 'deposit', amount: p.cash - 200 }),
    p.cash < 40 && p.savings > 0 && goDo('bank', { type: 'withdraw', amount: Math.min(p.savings, 150) }),

    // Daily grind: alternate study and work.
    p.enrolled && (p.cash > 150 || !job) && goDo('college', { type: 'attend' }, CLASS_HOURS),
    job && goDo(job.location, { type: 'work' }, Math.min(SHIFT_HOURS, 2)),
    !p.ateThisWeek && p.food === 0 && p.cash >= 15 && goDo('burger', { type: 'buy', itemId: 'meal' }),
    p.housing && p.relaxedThisWeek < 3 && goDo(homeLocation(p), { type: 'relax' }, 6),
  );
}

function needsBetterClothes(current: number, level: number) {
  return current < level;
}

function buyableAppliance(p: GameState['players'][number]) {
  return (['tv', 'stereo', 'fridge', 'computer'] as const).find(
    (id) => !p.appliances.includes(id) && p.cash + p.savings > APPLIANCES[id].price + 800,
  );
}

/** Applies one bot decision; any rejected decision ends the bot's week instead. */
export function botStep(state: GameState): GameState {
  const p = currentPlayer(state);
  const result = applyAction(state, p.id, botAction(state));
  return result.error ? applyAction(state, p.id, { type: 'endTurn' }).state : result.state;
}

/** Plays the current bot's whole week (bounded, so a confused bot can't hang the game). */
export function playBotWeek(state: GameState): GameState {
  const id = currentPlayer(state).id;
  for (let i = 0; i < 80 && state.phase === 'playing' && currentPlayer(state).id === id; i++) state = botStep(state);
  if (state.phase === 'playing' && currentPlayer(state).id === id) state = applyAction(state, id, { type: 'endTurn' }).state;
  return state;
}
