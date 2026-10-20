// Pure game rules. `applyAction` never mutates its input; the host runs it
// and broadcasts the resulting state, so every device sees the same game.

import {
  APPLIANCES,
  APPLY_HOURS,
  CLASS_HOURS,
  CLOTHES_WEEKS,
  COURSE_BY_ID,
  EVICTION_DEBT_WEEKS,
  HOURS_PER_WEEK,
  HOUSING,
  JOB_BY_ID,
  LESSONS_PER_DEGREE,
  LOCATIONS,
  LOCATION_BY_ID,
  MAX_FOOD_NO_FRIDGE,
  MAX_FOOD_WITH_FRIDGE,
  PAWN_RATE,
  PLAYER_AVATARS,
  PLAYER_COLORS,
  RELAX_HOURS,
  SAVINGS_INTEREST,
  SHIFT_HOURS,
  SHOP,
  WALK_HOURS_PER_STEP,
  type ApplianceId,
  type ClothesLevel,
  type JobDef,
  type LocationId,
} from './data';
import type { Action, ActionResult, GameState, Goals, Player, PlayerSetup } from './types';

// ---------------------------------------------------------------- random

/** mulberry32: small, fast, and its whole state fits in one number. */
function nextRandom(state: GameState): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------- setup

export const GOAL_PRESETS: Record<string, Goals> = {
  quick: { wealth: 25, happiness: 30, education: 25, career: 30 },
  standard: { wealth: 50, happiness: 50, education: 45, career: 50 },
  long: { wealth: 80, happiness: 75, education: 75, career: 80 },
};

export function createGame(setups: PlayerSetup[], goals: Goals, seed: number): GameState {
  if (setups.length < 1 || setups.length > 4) throw new Error('A game needs 1–4 players');
  const players: Player[] = setups.map((s, i) => ({
    id: `p${i + 1}`,
    name: s.name.trim().slice(0, 16) || `Player ${i + 1}`,
    color: PLAYER_COLORS[i],
    avatar: PLAYER_AVATARS[i],
    controller: s.controller,
    owner: s.owner,
    connected: true,
    location: 'lowcost',
    hoursLeft: HOURS_PER_WEEK,
    sickHours: 0,
    cash: 200,
    savings: 0,
    shares: 0,
    happiness: 30,
    housing: 'lowcost',
    rentPrepaidWeeks: 2,
    rentDebt: 0,
    food: 0,
    ateThisWeek: false,
    relaxedThisWeek: 0,
    studiedAtHomeThisWeek: false,
    clothes: 1,
    clothesWeeks: 6,
    appliances: [],
    degrees: [],
    enrolled: null,
    lessons: 0,
    jobId: null,
    hoursWorked: 0,
    lotteryTickets: 0,
  }));
  const state: GameState = {
    version: 1,
    phase: 'playing',
    week: 1,
    current: 0,
    players,
    goals,
    stockPrice: 50,
    rng: seed | 0,
    log: [],
    lastReport: null,
    winnerIds: [],
    seq: 0,
  };
  log(state, null, `Week 1 begins. Goals: wealth ${goals.wealth}, happiness ${goals.happiness}, education ${goals.education}, career ${goals.career}.`);
  return state;
}

// ---------------------------------------------------------------- scores

export function netWorth(p: Player, stockPrice: number): number {
  return Math.round(p.cash + p.savings + p.shares * stockPrice);
}

export function scores(p: Player, stockPrice: number): Goals {
  const job = p.jobId ? JOB_BY_ID[p.jobId] : null;
  return {
    wealth: clamp(Math.floor(netWorth(p, stockPrice) / 100), 0, 100),
    happiness: clamp(Math.round(p.happiness), 0, 100),
    education: clamp(p.degrees.length * 15, 0, 100),
    career: job ? job.rank * 10 : 0,
  };
}

export function meetsGoals(p: Player, state: GameState): boolean {
  const s = scores(p, state.stockPrice);
  const g = state.goals;
  return s.wealth >= g.wealth && s.happiness >= g.happiness && s.education >= g.education && s.career >= g.career;
}

// ---------------------------------------------------------------- helpers

export function currentPlayer(state: GameState): Player {
  return state.players[state.current];
}

export function experience(p: Player): number {
  return Math.floor(p.hoursWorked / SHIFT_HOURS);
}

export function walkHours(from: LocationId, to: LocationId): number {
  const a = LOCATIONS.findIndex((l) => l.id === from);
  const b = LOCATIONS.findIndex((l) => l.id === to);
  const d = Math.abs(a - b);
  return Math.min(d, LOCATIONS.length - d) * WALK_HOURS_PER_STEP;
}

export function homeLocation(p: Player): LocationId {
  return p.housing ?? 'rent';
}

export function maxFood(p: Player): number {
  return p.appliances.includes('fridge') ? MAX_FOOD_WITH_FRIDGE : MAX_FOOD_NO_FRIDGE;
}

/** Reasons the player can't take this job, or an empty list if they can. */
export function jobBlockers(p: Player, job: JobDef): string[] {
  const out: string[] = [];
  const missing = job.degrees.filter((d) => !p.degrees.includes(d));
  if (missing.length) out.push(`Needs ${missing.map((d) => COURSE_BY_ID[d].name).join(' + ')}`);
  if (p.clothes < job.clothes) out.push(`Needs ${['', 'casual', 'business', 'executive'][job.clothes]} clothes`);
  if (experience(p) < job.experience) out.push(`Needs ${job.experience} shifts of experience`);
  return out;
}

export function courseBlockers(p: Player, courseId: keyof typeof COURSE_BY_ID): string[] {
  const c = COURSE_BY_ID[courseId];
  if (p.degrees.includes(c.id)) return ['Already graduated'];
  const missing = c.requires.filter((d) => !p.degrees.includes(d));
  return missing.length ? [`Needs ${missing.map((d) => COURSE_BY_ID[d].name).join(' + ')}`] : [];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

function log(state: GameState, playerId: string | null, text: string) {
  state.log.push({ week: state.week, playerId, text });
  if (state.log.length > 80) state.log.splice(0, state.log.length - 80);
}

function addHappiness(p: Player, n: number) {
  p.happiness = clamp(p.happiness + n, 0, 100);
}

function spendTime(p: Player, hours: number): string | undefined {
  if (p.hoursLeft < hours) return `Not enough time left this week (${hours}h needed).`;
  p.hoursLeft -= hours;
  return undefined;
}

function pay(p: Player, amount: number): string | undefined {
  if (p.cash < amount) return `You need ${money(amount)} in cash.`;
  p.cash -= amount;
  return undefined;
}

function startWeek(p: Player) {
  p.hoursLeft = Math.max(0, HOURS_PER_WEEK - p.sickHours);
  p.sickHours = 0;
  p.location = homeLocation(p);
  p.ateThisWeek = false;
  p.relaxedThisWeek = 0;
  p.studiedAtHomeThisWeek = false;
}

// ---------------------------------------------------------------- actions

export function applyAction(input: GameState, playerId: string, action: Action): ActionResult {
  if (input.phase !== 'playing') return { state: input, error: 'The game is over.' };
  if (currentPlayer(input).id !== playerId) return { state: input, error: "It's not your turn." };
  const state: GameState = structuredClone(input);
  const p = currentPlayer(state);
  const error = run(state, p, action);
  if (error) return { state: input, error };
  state.seq++;
  return { state };
}

function run(state: GameState, p: Player, a: Action): string | undefined {
  const here = p.location;
  const at = (loc: LocationId) => (here === loc ? undefined : `Go to ${LOCATION_BY_ID[loc].name} first.`);

  switch (a.type) {
    case 'move': {
      if (!LOCATION_BY_ID[a.to]) return 'Unknown place.';
      if (a.to === here) return undefined;
      const err = spendTime(p, walkHours(here, a.to));
      if (err) return err;
      p.location = a.to;
      return undefined;
    }

    case 'endTurn':
      endTurn(state, p);
      return undefined;

    case 'work': {
      const job = p.jobId ? JOB_BY_ID[p.jobId] : null;
      if (!job) return "You don't have a job.";
      const e = at(job.location);
      if (e) return e;
      if (p.clothes < job.clothes) {
        p.jobId = null;
        addHappiness(p, -5);
        log(state, p.id, `${p.name} was fired from ${job.title} for not meeting the dress code.`);
        return undefined;
      }
      const hours = Math.min(SHIFT_HOURS, p.hoursLeft);
      if (hours < 1) return 'Not enough time left this week.';
      p.hoursLeft -= hours;
      p.hoursWorked += hours;
      let earned = Math.round(job.wage * hours);
      if (p.rentDebt > 0) {
        const garnish = Math.min(p.rentDebt, Math.ceil(earned / 2));
        p.rentDebt -= garnish;
        earned -= garnish;
        log(state, p.id, `${money(garnish)} of ${p.name}'s wages went to the landlord.`);
      }
      p.cash += earned;
      return undefined;
    }

    case 'apply': {
      const job = JOB_BY_ID[a.jobId];
      if (!job) return 'Unknown job.';
      if (here !== job.location && here !== 'employment') return `Apply at ${LOCATION_BY_ID[job.location].name} or the Employment Office.`;
      if (p.jobId === job.id) return 'You already work here.';
      const err = spendTime(p, APPLY_HOURS);
      if (err) return err;
      const blockers = jobBlockers(p, job);
      if (blockers.length) {
        log(state, p.id, `${p.name} was turned down for ${job.title}. ${blockers.join('; ')}.`);
        return undefined;
      }
      const old = p.jobId ? JOB_BY_ID[p.jobId] : null;
      p.jobId = job.id;
      if (!old || job.rank > old.rank) addHappiness(p, 3);
      log(state, p.id, `${p.name} was hired as ${job.title} (${money(job.wage)}/h).`);
      return undefined;
    }

    case 'enroll': {
      const e = at('college');
      if (e) return e;
      const course = COURSE_BY_ID[a.courseId];
      if (!course) return 'Unknown course.';
      if (p.enrolled) return `You're already enrolled in ${COURSE_BY_ID[p.enrolled].name}.`;
      const blockers = courseBlockers(p, course.id);
      if (blockers.length) return blockers.join('; ');
      const err = pay(p, course.tuition);
      if (err) return err;
      p.enrolled = course.id;
      p.lessons = 0;
      log(state, p.id, `${p.name} enrolled in ${course.name}.`);
      return undefined;
    }

    case 'attend':
    case 'study': {
      if (!p.enrolled) return "You aren't enrolled in a course.";
      if (a.type === 'attend') {
        const e = at('college');
        if (e) return e;
      } else {
        if (here !== p.housing) return 'You can only study at home.';
        if (!p.appliances.includes('computer')) return 'You need a computer to study at home.';
        if (p.studiedAtHomeThisWeek) return 'You already studied at home this week.';
        p.studiedAtHomeThisWeek = true;
      }
      const err = spendTime(p, CLASS_HOURS);
      if (err) return err;
      p.lessons++;
      if (p.lessons >= LESSONS_PER_DEGREE) {
        const course = COURSE_BY_ID[p.enrolled];
        p.degrees.push(course.id);
        p.enrolled = null;
        p.lessons = 0;
        addHappiness(p, 6);
        log(state, p.id, `🎓 ${p.name} graduated from ${course.name}!`);
      }
      return undefined;
    }

    case 'relax': {
      let gain: number;
      let hours = RELAX_HOURS;
      if (here === 'park') {
        gain = 2;
        hours = 4;
      } else if (p.housing && here === p.housing) {
        gain = 3 + HOUSING[p.housing].relaxBonus + p.appliances.reduce((s, id) => s + APPLIANCES[id].relaxBonus, 0);
      } else {
        return 'You can relax at home or in the park.';
      }
      const err = spendTime(p, hours);
      if (err) return err;
      if (p.relaxedThisWeek >= 2) gain = Math.ceil(gain / 2);
      p.relaxedThisWeek++;
      addHappiness(p, gain);
      return undefined;
    }

    case 'buy': {
      const item = SHOP[here]?.find((i) => i.id === a.itemId);
      if (!item) return "That isn't sold here.";
      const clothesLevel: Record<string, ClothesLevel> = { casual: 1, 'casual-nice': 1, business: 2, executive: 3 };
      const level = clothesLevel[item.id];
      if (level !== undefined && p.clothesWeeks > 0 && p.clothes > level) return 'You already own better clothes.';
      if ((item.id === 'groceries' || item.id === 'canned') && p.food >= maxFood(p)) {
        return p.appliances.includes('fridge') ? 'Your fridge is full.' : 'Without a fridge you can only store one week of food.';
      }
      const err = pay(p, item.price);
      if (err) return err;
      if (level !== undefined) {
        p.clothes = level;
        p.clothesWeeks = CLOTHES_WEEKS;
        if (item.id === 'casual-nice') addHappiness(p, 1);
        if (item.id === 'executive') addHappiness(p, 2);
        return undefined;
      }
      switch (item.id) {
        case 'meal':
          if (!p.ateThisWeek) addHappiness(p, 1);
          p.ateThisWeek = true;
          break;
        case 'groceries':
        case 'canned':
          p.food++;
          break;
        case 'treat':
          addHappiness(p, 3);
          break;
        case 'lottery':
          p.lotteryTickets++;
          break;
      }
      return undefined;
    }

    case 'buyAppliance': {
      const e = at('gadget');
      if (e) return e;
      const item = APPLIANCES[a.applianceId];
      if (!item) return 'Unknown item.';
      if (p.appliances.includes(item.id)) return `You already own a ${item.name.toLowerCase()}.`;
      const err = pay(p, item.price);
      if (err) return err;
      p.appliances.push(item.id);
      addHappiness(p, item.happiness);
      log(state, p.id, `${p.name} bought a ${item.name.toLowerCase()}.`);
      return undefined;
    }

    case 'pawn': {
      const e = at('pawn');
      if (e) return e;
      if (!p.appliances.includes(a.applianceId)) return "You don't own that.";
      removeAppliance(p, a.applianceId);
      p.cash += Math.round(APPLIANCES[a.applianceId].price * PAWN_RATE);
      addHappiness(p, -2);
      return undefined;
    }

    case 'deposit':
    case 'withdraw': {
      const e = at('bank');
      if (e) return e;
      const amount = Math.floor(a.amount);
      if (!(amount > 0)) return 'Enter an amount.';
      if (a.type === 'deposit') {
        if (amount > p.cash) return "You don't have that much cash.";
        p.cash -= amount;
        p.savings += amount;
      } else {
        if (amount > p.savings) return "You don't have that much saved.";
        p.savings -= amount;
        p.cash += amount;
      }
      return undefined;
    }

    case 'buyShares':
    case 'sellShares': {
      const e = at('bank');
      if (e) return e;
      const n = Math.floor(a.count);
      if (!(n > 0)) return 'Enter a number of shares.';
      const value = Math.round(n * state.stockPrice);
      if (a.type === 'buyShares') {
        const err = pay(p, value);
        if (err) return err;
        p.shares += n;
      } else {
        if (n > p.shares) return "You don't own that many shares.";
        p.shares -= n;
        p.cash += value;
      }
      return undefined;
    }

    case 'rent': {
      const e = at('rent');
      if (e) return e;
      const h = HOUSING[a.housing];
      if (!h) return 'Unknown apartment.';
      if (p.housing === h.id) return 'You already live there.';
      if (p.rentDebt > 0) return `Pay your ${money(p.rentDebt)} rent debt first.`;
      const err = pay(p, h.weeklyRent * 2);
      if (err) return err;
      p.housing = h.id;
      p.rentPrepaidWeeks = 2;
      if (h.id === 'luxury') addHappiness(p, 6);
      log(state, p.id, `${p.name} moved into ${h.name}.`);
      return undefined;
    }

    case 'payRent': {
      const e = at('rent');
      if (e) return e;
      if (!p.housing) return "You don't rent anywhere.";
      const weeks = Math.floor(a.weeks);
      const cost = p.rentDebt + Math.max(0, weeks) * HOUSING[p.housing].weeklyRent;
      if (cost <= 0) return 'Nothing to pay.';
      if (p.rentPrepaidWeeks + weeks > 8) return 'You can prepay at most 8 weeks.';
      const err = pay(p, cost);
      if (err) return err;
      p.rentDebt = 0;
      p.rentPrepaidWeeks += Math.max(0, weeks);
      return undefined;
    }
  }
}

function removeAppliance(p: Player, id: ApplianceId) {
  p.appliances = p.appliances.filter((a) => a !== id);
  if (id === 'fridge') p.food = Math.min(p.food, MAX_FOOD_NO_FRIDGE);
}

// ---------------------------------------------------------------- weekend

function endTurn(state: GameState, p: Player) {
  const lines: string[] = [];
  const rnd = () => nextRandom(state);

  // Food
  if (p.ateThisWeek) {
    lines.push('🍔 You ate well this week.');
  } else if (p.food > 0) {
    p.food--;
    lines.push('🥫 You ate from your food at home.');
  } else {
    addHappiness(p, -8);
    p.sickHours = 10;
    lines.push('😵 You went hungry! −8 happiness and you start next week 10 hours behind.');
  }

  // Rent
  if (p.housing) {
    const h = HOUSING[p.housing];
    if (p.rentPrepaidWeeks > 0) {
      p.rentPrepaidWeeks--;
    } else {
      p.rentDebt += h.weeklyRent;
      addHappiness(p, -2);
      lines.push(`🗝️ Rent is overdue. You owe ${money(p.rentDebt)}.`);
      if (p.rentDebt >= h.weeklyRent * EVICTION_DEBT_WEEKS) {
        p.housing = null;
        p.rentDebt = 0;
        addHappiness(p, -10);
        lines.push('🚪 You were evicted! Visit the Rent Office to find a new home.');
        log(state, p.id, `${p.name} was evicted.`);
      }
    }
  } else {
    addHappiness(p, -4);
    lines.push('🌧️ Sleeping rough is miserable. −4 happiness.');
  }

  // Clothes
  if (p.clothesWeeks > 0) {
    p.clothesWeeks--;
    if (p.clothesWeeks === 0 && p.clothes > 0) {
      p.clothes = 0;
      lines.push('🧥 Your clothes are worn out. Buy new ones before work!');
    } else if (p.clothesWeeks <= 2 && p.clothes > 0) {
      lines.push(`🧥 Your clothes will wear out in ${p.clothesWeeks} week(s).`);
    }
  }

  // Bank interest
  const interest = Math.floor(p.savings * SAVINGS_INTEREST);
  if (interest > 0) {
    p.savings += interest;
    lines.push(`🏦 Your savings earned ${money(interest)} interest.`);
  }

  // Lottery
  if (p.lotteryTickets > 0) {
    let won = 0;
    for (let i = 0; i < p.lotteryTickets; i++) if (rnd() < 1 / 60) won += 1000;
    p.lotteryTickets = 0;
    if (won) {
      p.cash += won;
      addHappiness(p, 5);
      lines.push(`🎟️ JACKPOT! You won ${money(won)} in the lottery!`);
      log(state, p.id, `${p.name} won ${money(won)} in the lottery!`);
    } else {
      lines.push('🎟️ No luck in the lottery this week.');
    }
  }

  // Mood
  if (!p.jobId) {
    addHappiness(p, -2);
    lines.push('📋 Being out of work gets you down. −2 happiness.');
  }
  if (p.relaxedThisWeek === 0) {
    addHappiness(p, -1);
    lines.push('😩 All work and no play. −1 happiness.');
  }

  // One random event
  const r = rnd();
  if (p.cash > 250 && r < 0.12) {
    const lost = Math.round(p.cash * 0.4);
    p.cash -= lost;
    addHappiness(p, -4);
    lines.push(`🦹 A mugger took ${money(lost)} of your cash! Banks are safer.`);
    log(state, p.id, `${p.name} was mugged and lost ${money(lost)}.`);
  } else if (p.housing && p.appliances.length && r < 0.12 + HOUSING[p.housing].burglaryChance) {
    const stolen = p.appliances[Math.floor(rnd() * p.appliances.length)];
    removeAppliance(p, stolen);
    addHappiness(p, -4);
    lines.push(`🔓 Burglars stole your ${APPLIANCES[stolen].name.toLowerCase()}! Nicer neighbourhoods are safer.`);
  } else if (r > 0.94) {
    p.cash += 50;
    lines.push('🍀 You found $50 in an old coat pocket.');
  } else if (r > 0.88) {
    addHappiness(p, 3);
    lines.push('🎉 A great weekend with friends. +3 happiness.');
  } else if (p.jobId && r > 0.84) {
    const bonus = JOB_BY_ID[p.jobId].rank * 20;
    p.cash += bonus;
    lines.push(`💼 Your boss gave you a ${money(bonus)} bonus!`);
  }

  state.lastReport = { playerId: p.id, week: state.week, lines };

  if (meetsGoals(p, state)) {
    state.phase = 'over';
    state.winnerIds = [p.id];
    log(state, p.id, `🏆 ${p.name} reached every goal and wins the game!`);
    return;
  }

  // Next player; a new week starts when everyone has played.
  state.current = (state.current + 1) % state.players.length;
  if (state.current === 0) {
    state.week++;
    const change = rnd() * 0.16 - 0.065;
    state.stockPrice = Math.max(5, Math.round(state.stockPrice * (1 + change) * 100) / 100);
    log(state, null, `Week ${state.week} begins. Stock price: $${state.stockPrice.toFixed(2)}.`);
  }
  startWeek(currentPlayer(state));
}

/** Hands a player to the computer (e.g. their device disconnected) or back to a device. */
export function setController(input: GameState, playerId: string, controller: Player['controller'], owner?: string): GameState {
  const state = structuredClone(input);
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return input;
  p.controller = controller;
  if (owner !== undefined) p.owner = owner;
  state.seq++;
  return state;
}

export function setConnected(input: GameState, owner: string, connected: boolean): GameState {
  if (!input.players.some((p) => p.owner === owner && p.connected !== connected)) return input;
  const state = structuredClone(input);
  for (const p of state.players) if (p.owner === owner) p.connected = connected;
  state.seq++;
  return state;
}
