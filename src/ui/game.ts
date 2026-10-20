// The in-game screen: board, location actions, player stats and the log.

import {
  APPLIANCES,
  CLOTHES_NAMES,
  COURSES,
  COURSE_BY_ID,
  HOURS_PER_WEEK,
  HOUSING,
  JOBS,
  JOB_BY_ID,
  LESSONS_PER_DEGREE,
  LOCATIONS,
  LOCATION_BY_ID,
  PAWN_RATE,
  SHOP,
  type ApplianceId,
  type LocationId,
} from '../game/data';
import { courseBlockers, currentPlayer, experience, jobBlockers, maxFood, netWorth, scores, walkHours } from '../game/engine';
import type { Action, GameState, Player } from '../game/types';
import { HostSession, type Session } from '../net/session';
import { act, esc, money } from './html';

/** Grid cell (row, col) for each ring position on a 5×4 board, clockwise. */
const RING_CELLS: [number, number][] = [
  [1, 1], [1, 2], [1, 3], [1, 4], [1, 5],
  [2, 5], [3, 5],
  [4, 5], [4, 4], [4, 3], [4, 2], [4, 1],
  [3, 1], [2, 1],
];

export function renderGame(session: Session, dismissed: Set<string>): string {
  const state = session.state!;
  const cur = currentPlayer(state);
  const mine = session.controls(cur.id);
  return `
  <div class="game ${mine ? 'my-turn' : ''}">
    <header class="topbar">
      <button class="ghost small" ${act('leave')}>☰ Menu</button>
      <div class="week">Week ${state.week}</div>
      ${session.code ? `<div class="code-chip" title="Invite code">🔗 ${esc(session.code)}</div>` : ''}
      <div class="spacer"></div>
      ${session.status ? `<div class="net-status">${esc(session.status)}</div>` : ''}
      ${mine && state.phase === 'playing' ? `<button class="primary" ${act('do', { type: 'endTurn' })}>End week ▸</button>` : ''}
    </header>
    <div class="layout">
      <section class="board-wrap">${renderBoard(state, mine)}</section>
      <aside class="side">
        ${renderTurnPanel(session, state, cur, mine)}
        ${renderStats(cur, state)}
        ${renderScoreboard(session, state)}
        ${renderLog(state)}
      </aside>
    </div>
    ${renderModals(session, state, dismissed)}
  </div>`;
}

function renderBoard(state: GameState, mine: boolean): string {
  const cur = currentPlayer(state);
  const tiles = LOCATIONS.map((loc, i) => {
    const [r, c] = RING_CELLS[i];
    const here = state.players.filter((p) => p.location === loc.id && (p.id === cur.id || state.phase === 'over'));
    const others = state.players.filter((p) => p.id !== cur.id && homeOf(p) === loc.id && state.phase === 'playing');
    const cost = walkHours(cur.location, loc.id);
    const isHome = homeOf(cur) === loc.id;
    const job = cur.jobId && JOB_BY_ID[cur.jobId].location === loc.id;
    return `
      <button class="tile ${cur.location === loc.id ? 'current' : ''} ${mine ? '' : 'readonly'}"
        style="grid-row:${r};grid-column:${c}" ${mine ? act('do', { type: 'move', to: loc.id }) : 'tabindex="-1"'}
        title="${esc(loc.name)} — ${esc(loc.blurb)}${cost ? ` (${cost}h walk)` : ''}">
        <span class="tile-icon">${loc.icon}</span>
        <span class="tile-name">${esc(loc.name)}</span>
        ${isHome ? '<span class="badge home">HOME</span>' : ''}
        ${job ? '<span class="badge job">JOB</span>' : ''}
        ${mine && cost ? `<span class="walk">${cost}h</span>` : ''}
        <span class="tokens">
          ${others.map((p) => `<span class="token ghost" style="--c:${p.color}" title="${esc(p.name)}">${p.avatar}</span>`).join('')}
          ${here.map((p) => `<span class="token" style="--c:${p.color}" title="${esc(p.name)}">${p.avatar}</span>`).join('')}
        </span>
      </button>`;
  }).join('');
  const pct = Math.max(0, cur.hoursLeft / HOURS_PER_WEEK);
  return `
    <div class="board">
      ${tiles}
      <div class="center">
        <div class="clock" style="--pct:${pct}">
          <div class="clock-inner"><b>${cur.hoursLeft}</b><small>hours left</small></div>
        </div>
        <div class="center-info">
          <div class="who" style="--c:${cur.color}">${cur.avatar} ${esc(cur.name)}</div>
          <div class="where">at ${esc(LOCATION_BY_ID[cur.location].name)}</div>
          <div class="cash">💵 ${money(cur.cash)}</div>
        </div>
      </div>
    </div>`;
}

function homeOf(p: Player): LocationId | null {
  return p.housing;
}

// ------------------------------------------------------------ turn panel

function renderTurnPanel(session: Session, state: GameState, cur: Player, mine: boolean): string {
  if (state.phase === 'over') return '';
  if (!mine) {
    const host = session instanceof HostSession ? session : null;
    let body = `<p class="muted">${cur.controller === 'bot' ? '🤖 The computer is playing…' : 'Waiting for their move…'}</p>`;
    if (host && cur.controller === 'bot') body += `<button class="ghost" ${act('skipBot')}>Skip to end of week ⏭</button>`;
    if (host && cur.controller === 'human' && !cur.connected) {
      body = `<p class="warn">📡 ${esc(cur.name)} has lost connection.</p>
        <button class="primary" ${act('setBot', { id: cur.id, bot: true })}>Let the computer play for them</button>`;
    }
    return `<section class="panel turn"><h2><span class="dot" style="--c:${cur.color}"></span>${esc(cur.name)}'s week</h2>${body}</section>`;
  }
  const loc = LOCATION_BY_ID[cur.location];
  return `
    <section class="panel turn">
      <h2>${loc.icon} ${esc(loc.name)}</h2>
      <p class="muted">${esc(loc.blurb)} Tap another place on the board to walk there.</p>
      <div class="actions">${locationActions(state, cur)}</div>
    </section>`;
}

function button(label: string, action: Action, opts: { note?: string; disabled?: string | false; kind?: string } = {}): string {
  const disabled = opts.disabled ? `disabled title="${esc(opts.disabled)}"` : '';
  return `<button class="action ${opts.kind ?? ''}" ${disabled} ${act('do', action)}>
      <span>${label}</span>${opts.note || opts.disabled ? `<small>${esc(opts.disabled || opts.note || '')}</small>` : ''}
    </button>`;
}

function locationActions(state: GameState, p: Player): string {
  const out: string[] = [];
  const here = p.location;
  const job = p.jobId ? JOB_BY_ID[p.jobId] : null;

  if (job && job.location === here) {
    out.push(button(`💼 Work a shift`, { type: 'work' }, { kind: 'primary', note: `${job.title} · ${money(job.wage)}/h · up to 6h` }));
  }

  if (p.housing === here) {
    const h = HOUSING[p.housing];
    out.push(button('🛋️ Relax at home', { type: 'relax' }, { note: `6h · +happiness${p.relaxedThisWeek >= 2 ? ' (less fun, you’ve rested a lot)' : ''}` }));
    if (p.enrolled && p.appliances.includes('computer')) {
      out.push(button('💻 Study at home', { type: 'study' }, { note: '6h · +1 lesson (once a week)', disabled: p.studiedAtHomeThisWeek && 'Already studied this week' }));
    }
    out.push(`<p class="info">🏠 ${esc(h.name)} · ${money(h.weeklyRent)}/week · prepaid ${p.rentPrepaidWeeks} wk${p.rentDebt ? ` · <b class="bad">owes ${money(p.rentDebt)}</b>` : ''} · food stored: ${p.food}/${maxFood(p)}</p>`);
  } else if (here === 'lowcost' || here === 'luxury') {
    out.push(`<p class="info">You don't live here. Rent it at the Rent Office.</p>`);
  }

  switch (here) {
    case 'rent': {
      for (const h of Object.values(HOUSING)) {
        if (p.housing === h.id) continue;
        out.push(button(`🗝️ Move into ${h.name}`, { type: 'rent', housing: h.id }, { note: `${money(h.weeklyRent * 2)} now (2 weeks) · ${money(h.weeklyRent)}/week`, disabled: p.rentDebt > 0 && 'Pay your debt first' }));
      }
      if (p.housing) {
        const w = HOUSING[p.housing].weeklyRent;
        if (p.rentDebt) out.push(button(`💸 Pay rent debt`, { type: 'payRent', weeks: 0 }, { kind: 'primary', note: money(p.rentDebt) }));
        out.push(button(`📅 Prepay 1 week`, { type: 'payRent', weeks: 1 }, { note: money(w + p.rentDebt) }));
        out.push(button(`📅 Prepay 4 weeks`, { type: 'payRent', weeks: 4 }, { note: money(w * 4 + p.rentDebt) }));
      }
      break;
    }
    case 'pawn':
      if (!p.appliances.length) out.push(`<p class="info">You have nothing worth pawning.</p>`);
      for (const id of p.appliances) {
        const a = APPLIANCES[id];
        out.push(button(`${a.icon} Sell ${a.name}`, { type: 'pawn', applianceId: id }, { note: `Get ${money(a.price * PAWN_RATE)}` }));
      }
      break;
    case 'gadget':
      for (const a of Object.values(APPLIANCES)) {
        out.push(button(`${a.icon} ${a.name}`, { type: 'buyAppliance', applianceId: a.id as ApplianceId }, { note: `${money(a.price)} · ${a.note}`, disabled: p.appliances.includes(a.id) && 'Owned' }));
      }
      break;
    case 'college': {
      if (p.enrolled) {
        out.push(button(`📚 Attend class`, { type: 'attend' }, { kind: 'primary', note: `6h · ${COURSE_BY_ID[p.enrolled].name} ${p.lessons}/${LESSONS_PER_DEGREE}` }));
      }
      for (const c of COURSES) {
        if (p.degrees.includes(c.id) || p.enrolled === c.id) continue;
        const blockers = courseBlockers(p, c.id);
        out.push(button(`🎓 Enroll: ${c.name}`, { type: 'enroll', courseId: c.id }, {
          note: `${money(c.tuition)} tuition`,
          disabled: (p.enrolled && 'Finish your current course first') || (blockers.length > 0 && blockers.join('; ')),
        }));
      }
      break;
    }
    case 'bank': {
      const all = Math.floor(p.cash);
      out.push(`<p class="info">💵 Cash ${money(p.cash)} · 🏦 Savings ${money(p.savings)} (1% interest/week)</p>`);
      out.push(`<div class="row">
        ${button('Deposit $100', { type: 'deposit', amount: 100 }, { disabled: p.cash < 100 && 'Not enough cash' })}
        ${button(`Deposit all`, { type: 'deposit', amount: all }, { disabled: all < 1 && 'No cash' })}
        ${button('Withdraw $100', { type: 'withdraw', amount: 100 }, { disabled: p.savings < 100 && 'Not enough savings' })}
        ${button('Withdraw $500', { type: 'withdraw', amount: 500 }, { disabled: p.savings < 500 && 'Not enough savings' })}
      </div>`);
      out.push(`<p class="info">📈 Stock index: <b>$${state.stockPrice.toFixed(2)}</b>/share · you own ${p.shares}</p>`);
      out.push(`<div class="row">
        ${button('Buy 1', { type: 'buyShares', count: 1 })}
        ${button('Buy 10', { type: 'buyShares', count: 10 })}
        ${button('Sell 1', { type: 'sellShares', count: 1 }, { disabled: p.shares < 1 && 'No shares' })}
        ${button('Sell all', { type: 'sellShares', count: p.shares }, { disabled: p.shares < 1 && 'No shares' })}
      </div>`);
      break;
    }
    case 'employment':
      out.push(`<p class="info">Every job in town. You have ${experience(p)} shifts of experience and ${CLOTHES_NAMES[p.clothes].toLowerCase()} clothes.</p>`);
      for (const j of JOBS) out.push(jobButton(p, j.id));
      break;
    case 'park':
      out.push(button('🌳 Take a stroll', { type: 'relax' }, { note: '4h · +2 happiness · free' }));
      break;
  }

  for (const item of SHOP[here] ?? []) {
    out.push(button(`🛍️ ${item.name}`, { type: 'buy', itemId: item.id }, { note: `${money(item.price)} · ${item.note}` }));
  }

  if (here !== 'employment') {
    for (const j of JOBS.filter((j) => j.location === here && j.id !== p.jobId)) out.push(jobButton(p, j.id));
  }

  if (!out.length) out.push(`<p class="info">Nothing to do here right now.</p>`);
  return out.join('');
}

function jobButton(p: Player, jobId: string): string {
  const j = JOB_BY_ID[jobId];
  if (p.jobId === j.id) return `<p class="info">✅ You work here as ${esc(j.title)}.</p>`;
  const blockers = jobBlockers(p, j);
  return button(`📝 Apply: ${j.title}`, { type: 'apply', jobId: j.id }, {
    note: `${money(j.wage)}/h · career ${j.rank * 10}${blockers.length ? ' · ' + blockers.join('; ') : ''} · 1h`,
    kind: blockers.length ? 'dim' : '',
  });
}

// ------------------------------------------------------------ stats

function renderStats(p: Player, state: GameState): string {
  const job = p.jobId ? JOB_BY_ID[p.jobId] : null;
  const rows: [string, string][] = [
    ['💵 Cash', money(p.cash)],
    ['🏦 Savings', money(p.savings)],
    ['📈 Shares', `${p.shares} (${money(p.shares * state.stockPrice)})`],
    ['💼 Job', job ? `${esc(job.title)} · ${money(job.wage)}/h` : '<span class="bad">Unemployed</span>'],
    ['🏠 Home', p.housing ? `${HOUSING[p.housing].name}${p.rentDebt ? ` · <span class="bad">owes ${money(p.rentDebt)}</span>` : ''}` : '<span class="bad">Homeless</span>'],
    ['🍽️ Food', `${p.ateThisWeek ? 'Ate this week' : '<span class="warn">Not eaten yet</span>'} · ${p.food} stored`],
    ['👕 Clothes', p.clothes ? `${CLOTHES_NAMES[p.clothes]} (${p.clothesWeeks} wk left)` : '<span class="bad">Rags</span>'],
    ['🎓 Study', p.enrolled ? `${COURSE_BY_ID[p.enrolled].name} ${p.lessons}/${LESSONS_PER_DEGREE}` : 'Not enrolled'],
    ['📜 Degrees', p.degrees.length ? p.degrees.map((d) => COURSE_BY_ID[d].name).join(', ') : 'None'],
    ['🛋️ Stuff', p.appliances.length ? p.appliances.map((a) => APPLIANCES[a].icon + ' ' + APPLIANCES[a].name).join(', ') : 'Nothing yet'],
  ];
  return `
    <section class="panel stats">
      <h2><span class="dot" style="--c:${p.color}"></span>${esc(p.name)}</h2>
      ${goalBars(p, state)}
      <dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    </section>`;
}

function goalBars(p: Player, state: GameState): string {
  const s = scores(p, state.stockPrice);
  const g = state.goals;
  const bar = (label: string, v: number, goal: number, hint: string) => `
    <div class="goal ${v >= goal ? 'done' : ''}" title="${esc(hint)}">
      <span>${label}</span>
      <div class="bar"><i style="width:${Math.min(100, (v / goal) * 100)}%"></i></div>
      <b>${v}/${goal}</b>
    </div>`;
  return `<div class="goals">
    ${bar('Wealth', s.wealth, g.wealth, `Net worth ${money(netWorth(p, state.stockPrice))}. $100 = 1 point.`)}
    ${bar('Happiness', s.happiness, g.happiness, 'Relax, eat well, buy nice things.')}
    ${bar('Education', s.education, g.education, 'Each degree = 15 points.')}
    ${bar('Career', s.career, g.career, 'Your job rank × 10.')}
  </div>`;
}

function renderScoreboard(session: Session, state: GameState): string {
  if (state.players.length < 2) return '';
  const host = session instanceof HostSession;
  return `
    <section class="panel scoreboard">
      <h2>Players</h2>
      ${state.players.map((p, i) => `
        <div class="sb-row ${i === state.current ? 'active' : ''}">
          <div class="sb-name"><span class="dot" style="--c:${p.color}"></span>${p.avatar} ${esc(p.name)}
            ${p.controller === 'bot' ? '<small>🤖</small>' : ''}
            ${p.owner === session.me && p.controller === 'human' ? '<small>(you)</small>' : ''}
            ${!p.connected ? '<small class="warn">offline</small>' : ''}
            ${host && p.owner !== 'host' && p.controller === 'bot' && p.connected ? `<button class="ghost small" ${act('setBot', { id: p.id, bot: false })}>Hand back</button>` : ''}
          </div>
          ${goalBars(p, state)}
        </div>`).join('')}
    </section>`;
}

function renderLog(state: GameState): string {
  const color = (id: string | null) => state.players.find((p) => p.id === id)?.color ?? 'var(--muted)';
  return `
    <section class="panel log">
      <h2>News</h2>
      <ul>${state.log.slice(-12).reverse().map((e) => `<li style="--c:${color(e.playerId)}"><small>W${e.week}</small> ${esc(e.text)}</li>`).join('')}</ul>
    </section>`;
}

// ------------------------------------------------------------ modals

export function reportKey(state: GameState): string | null {
  return state.lastReport ? `${state.lastReport.playerId}:${state.lastReport.week}` : null;
}

function renderModals(session: Session, state: GameState, dismissed: Set<string>): string {
  if (state.phase === 'over') {
    const winner = state.players.find((p) => p.id === state.winnerIds[0]);
    return `
      <div class="modal-bg"><div class="modal">
        <div class="big">🏆</div>
        <h2>${winner ? `${esc(winner.name)} wins!` : 'Game over'}</h2>
        <p>Reached every goal in week ${state.week}.</p>
        ${state.players.map((p) => `<div class="sb-row"><div class="sb-name"><span class="dot" style="--c:${p.color}"></span>${esc(p.name)}</div>${goalBars(p, state)}</div>`).join('')}
        <button class="primary" ${act('leave', { confirm: false })}>Back to menu</button>
      </div></div>`;
  }
  const key = reportKey(state);
  const r = state.lastReport;
  if (!r || !key || dismissed.has(key)) return '';
  const p = state.players.find((x) => x.id === r.playerId)!;
  if (!(p.owner === session.me && p.controller === 'human')) return '';
  const next = currentPlayer(state);
  const handoff = next.id !== p.id && session.controls(next.id);
  return `
    <div class="modal-bg"><div class="modal">
      <h2>🌙 Weekend ${r.week} — ${esc(p.name)}</h2>
      <ul class="report">${r.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      ${goalBars(p, state)}
      ${handoff ? `<p class="handoff">Pass the device to <b style="color:${next.color}">${esc(next.name)}</b>.</p>` : ''}
      <button class="primary" ${act('dismiss', { key })}>${handoff ? `Start ${esc(next.name)}'s week` : 'Continue'}</button>
    </div></div>`;
}
