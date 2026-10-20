import './style.css';
import { GOAL_PRESETS } from './game/engine';
import type { Action } from './game/types';
import { ClientSession, HostSession, MAX_PLAYERS, normalizeCode, type Session } from './net/session';
import { renderGame } from './ui/game';
import { act, esc } from './ui/html';

type Screen = 'home' | 'join' | 'help';

const root = document.getElementById('app')!;
const toastEl = document.getElementById('toast')!;

let session: Session | null = null;
let screen: Screen = 'home';
let joinCode = '';
const dismissed = new Set<string>();
let unsubscribe: (() => void)[] = [];

const store = {
  get(key: string, fallback = '') {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode: the name just isn't remembered */
    }
  },
};
let myName = store.get('fll.name', '');

// ------------------------------------------------------------------ render

function render() {
  const focusedId = (document.activeElement as HTMLElement | null)?.id;
  root.innerHTML = session ? (session.state ? renderGame(session, dismissed) : renderLobby(session)) : renderMenu();
  if (focusedId) {
    const el = document.getElementById(focusedId) as HTMLInputElement | null;
    if (el) {
      el.focus();
      if (el.setSelectionRange && el.type === 'text') el.setSelectionRange(el.value.length, el.value.length);
    }
  }
}

function renderMenu(): string {
  if (screen === 'help') return renderHelp();
  const nameField = `
    <label class="field">Your name
      <input id="name" type="text" maxlength="16" autocomplete="nickname" placeholder="e.g. Alex" value="${esc(myName)}" />
    </label>`;
  if (screen === 'join') {
    return `
    <main class="menu">
      <h1 class="logo">Fast Lane <span>Life</span></h1>
      <div class="card">
        <h2>Join a game</h2>
        ${nameField}
        <label class="field">Invite code
          <input id="code" type="text" maxlength="7" autocapitalize="characters" autocomplete="off" spellcheck="false"
            placeholder="ABC123" value="${esc(joinCode)}" class="code-input" />
        </label>
        <button class="primary big" ${act('join')}>Join ▸</button>
        <button class="ghost" ${act('screen', 'home')}>Back</button>
      </div>
    </main>`;
  }
  return `
    <main class="menu">
      <h1 class="logo">Fast Lane <span>Life</span></h1>
      <p class="tagline">Work, study, shop and party your way to the good life. First to reach every goal wins.</p>
      <div class="card">
        ${nameField}
        <button class="primary big" ${act('newLocal')}>🎲 Play on this device</button>
        <small class="muted">Solo against the computer, or pass-and-play with friends.</small>
        <button class="primary big alt" ${act('newHost')}>📡 Host an online game</button>
        <small class="muted">Friends join with an invite code — same Wi-Fi or over the internet.</small>
        <button class="ghost big" ${act('screen', 'join')}>🔗 Join with a code</button>
        <button class="ghost" ${act('screen', 'help')}>How to play</button>
      </div>
      <p class="fineprint">A fan-made homage to the classic life-sim board games of the early '90s.</p>
    </main>`;
}

function renderHelp(): string {
  return `
    <main class="menu help">
      <h1 class="logo">How to play</h1>
      <div class="card">
        <p>Everyone starts broke in a small apartment. Each turn is <b>one week of 60 hours</b>.
           Tap a place on the board to walk there (1 hour per block), then pick what to do.</p>
        <h3>Win by reaching all four goals</h3>
        <ul>
          <li><b>Wealth</b> — cash + savings + shares. Every $100 is one point.</li>
          <li><b>Happiness</b> — relax at home, buy nice things, eat well, graduate, get promoted.</li>
          <li><b>Education</b> — enroll at City College and attend 8 classes per degree. 15 points per degree.</li>
          <li><b>Career</b> — your job's rank × 10. Better jobs need degrees, nicer clothes and experience.</li>
        </ul>
        <h3>Every weekend</h3>
        <ul>
          <li>You must have eaten: a meal at Burger Barn, or food stored at home. Going hungry hurts.</li>
          <li>Rent is due. Prepay at the Rent Office; fall 4 weeks behind and you're evicted.</li>
          <li>Clothes wear out. No clothes, no job.</li>
          <li>Carrying lots of cash invites muggers — use the bank.</li>
        </ul>
        <h3>Playing together</h3>
        <ul>
          <li><b>This device</b>: add players and computer opponents, then pass the phone around.</li>
          <li><b>Online</b>: one phone hosts and shows a 6-letter invite code. Others tap <i>Join with a code</i>.
            Phones talk directly to each other; on the same Wi-Fi the game stays on your local network.</li>
        </ul>
        <button class="primary" ${act('screen', 'home')}>Got it</button>
      </div>
    </main>`;
}

function renderLobby(s: Session): string {
  const host = s instanceof HostSession ? s : null;
  const lobby = s.lobby;
  const goals = lobby.goals;
  const players = lobby.players
    .map((p, i) => {
      const editable = host && p.owner === 'host' && p.controller === 'human';
      const name = editable
        ? `<input id="pname-${i}" type="text" maxlength="16" value="${esc(p.name)}" data-rename="${i}" />`
        : `<span>${esc(p.name)}</span>`;
      const tag = p.controller === 'bot' ? '🤖 Computer' : p.owner === 'host' ? (s.role === 'local' || i === 0 ? '📱 This device' : '📱 Host device') : p.owner === s.me ? '📱 You' : p.connected ? '📡 Online' : '📡 Disconnected';
      return `<li class="lobby-player">
        ${name}<small>${tag}</small>
        ${host && i > 0 ? `<button class="ghost small" ${act('removePlayer', i)} aria-label="Remove">✕</button>` : ''}
      </li>`;
    })
    .join('');
  const full = lobby.players.length >= MAX_PLAYERS;
  const codeBlock =
    s.role === 'local'
      ? ''
      : s.code
        ? `<div class="invite">
            <small>Invite code</small>
            <div class="code">${esc(s.code)}</div>
            ${host ? `<button class="ghost small" ${act('share')}>Share / copy</button>` : ''}
          </div>`
        : `<div class="invite"><small>${esc(s.status || 'Connecting…')}</small></div>`;
  return `
    <main class="menu lobby">
      <h1 class="logo small">${s.role === 'local' ? 'New game' : s.role === 'host' ? 'Hosting' : 'Joined game'}</h1>
      ${s.status && s.code ? `<p class="net-status">${esc(s.status)}</p>` : ''}
      <div class="card">
        ${codeBlock}
        <h2>Players (${lobby.players.length}/${MAX_PLAYERS})</h2>
        <ul class="lobby-players">${players}</ul>
        ${host && !full ? `<div class="row">
          <button class="ghost" ${act('addPlayer', 'human')}>+ Player on this device</button>
          <button class="ghost" ${act('addPlayer', 'bot')}>+ Computer</button>
        </div>` : ''}
        <h2>Game length</h2>
        <div class="row presets">
          ${(['quick', 'standard', 'long'] as const)
            .map((k) => `<button class="${lobby.preset === k ? 'primary' : 'ghost'}" ${host ? act('preset', k) : 'disabled'}>${k[0].toUpperCase() + k.slice(1)}</button>`)
            .join('')}
        </div>
        <p class="muted">Goals: 💰 ${goals.wealth} · 😊 ${goals.happiness} · 🎓 ${goals.education} · 💼 ${goals.career}</p>
        ${host ? `<button class="primary big" ${act('start')}>Start game ▸</button>` : `<p class="muted center">Waiting for the host to start…</p>`}
        <button class="ghost" ${act('leave', { confirm: false })}>Leave</button>
      </div>
    </main>`;
}

// ------------------------------------------------------------------ actions

function toast(text: string) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout((toast as unknown as { t?: number }).t);
  (toast as unknown as { t?: number }).t = window.setTimeout(() => toastEl.classList.remove('show'), 2600);
}

function setSession(s: Session | null) {
  unsubscribe.forEach((u) => u());
  unsubscribe = [];
  session?.close();
  session = s;
  dismissed.clear();
  if (s) unsubscribe = [s.onChange(render), s.onError(toast)];
  render();
}

function readName(): string {
  const input = document.getElementById('name') as HTMLInputElement | null;
  if (input) myName = input.value.trim();
  store.set('fll.name', myName);
  return myName || 'Player 1';
}

const handlers: Record<string, (arg: any) => void> = {
  screen: (s: Screen) => {
    readName();
    screen = s;
    render();
  },
  newLocal: () => {
    const host = new HostSession(false, readName());
    host.addPlayer('bot', 'Jonesy');
    setSession(host);
  },
  newHost: () => setSession(new HostSession(true, readName())),
  join: () => {
    const name = readName();
    joinCode = normalizeCode((document.getElementById('code') as HTMLInputElement).value);
    if (joinCode.length !== 6) return toast('Invite codes have 6 characters.');
    setSession(new ClientSession(joinCode, name));
  },
  addPlayer: (kind: 'human' | 'bot') => {
    const s = session as HostSession;
    const n = s.lobby.players.length + 1;
    const bots = ['Jonesy', 'Penny', 'Max', 'Lulu'];
    s.addPlayer(kind, kind === 'bot' ? bots.find((b) => !s.lobby.players.some((p) => p.name === b)) ?? `Bot ${n}` : `Player ${n}`);
  },
  removePlayer: (i: number) => (session as HostSession).removePlayer(i),
  preset: (k: keyof typeof GOAL_PRESETS) => (session as HostSession).setPreset(k),
  start: () => (session as HostSession).start(),
  share: async () => {
    const code = session?.code;
    if (!code) return;
    const text = `Join my Fast Lane Life game! Invite code: ${code}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Fast Lane Life', text });
      else {
        await navigator.clipboard.writeText(code);
        toast('Code copied');
      }
    } catch {
      /* share sheet dismissed */
    }
  },
  do: (action: Action) => session?.act(action),
  dismiss: ({ key }: { key: string }) => {
    dismissed.add(key);
    render();
  },
  skipBot: () => (session as HostSession).fastForwardBot(),
  setBot: ({ id, bot }: { id: string; bot: boolean }) => (session as HostSession).setBot(id, bot),
  leave: (arg?: { confirm?: boolean }) => {
    if (arg?.confirm !== false && session?.state?.phase === 'playing' && !confirm('Leave this game?')) return;
    screen = 'home';
    setSession(null);
  },
};

root.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!el || (el as HTMLButtonElement).disabled) return;
  const arg = el.dataset.arg ? JSON.parse(el.dataset.arg) : undefined;
  handlers[el.dataset.act!]?.(arg);
});

root.addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.id === 'name') myName = el.value;
  if (el.id === 'code') joinCode = el.value;
  if (el.dataset.rename) (session as HostSession).renamePlayer(Number(el.dataset.rename), el.value);
});

root.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.target as HTMLElement).id === 'code') handlers.join(undefined);
});

render();
