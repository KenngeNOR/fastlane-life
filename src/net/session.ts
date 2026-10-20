// Game sessions. The host device owns the authoritative GameState and runs
// the rules; other devices send actions and receive the new state.
//
// Online play is peer-to-peer over WebRTC (PeerJS). The free public PeerJS
// broker is only used to introduce the devices to each other via the invite
// code; game traffic then flows directly between phones. On the same Wi-Fi
// the connection stays inside the local network.

import Peer, { type DataConnection } from 'peerjs';
import { playBotWeek, botStep } from '../game/bot';
import { GOAL_PRESETS, applyAction, createGame, currentPlayer, setConnected, setController } from '../game/engine';
import type { Action, Controller, GameState, Goals } from '../game/types';

export const MAX_PLAYERS = 4;
const PEER_PREFIX = 'fastlanelife-v1-';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BOT_STEP_MS = 380;

/**
 * Matchmaking broker. Defaults to the free PeerJS cloud; set VITE_PEER_HOST
 * (and optionally VITE_PEER_PORT / VITE_PEER_PATH / VITE_PEER_SECURE) at build
 * time to use your own `peerjs` server instead, e.g. one on your LAN.
 */
const env = import.meta.env;
const PEER_OPTIONS = {
  debug: 0,
  ...(env.VITE_PEER_HOST
    ? {
        host: env.VITE_PEER_HOST as string,
        port: Number(env.VITE_PEER_PORT || 443),
        path: (env.VITE_PEER_PATH as string) || '/',
        secure: env.VITE_PEER_SECURE !== 'false',
      }
    : {}),
};

export interface LobbyPlayer {
  name: string;
  controller: Controller;
  owner: string;
  connected: boolean;
}

export interface Lobby {
  players: LobbyPlayer[];
  preset: keyof typeof GOAL_PRESETS;
  goals: Goals;
}

type ToHost = { t: 'join'; clientId: string; name: string } | { t: 'action'; playerId: string; action: Action };
type ToClient =
  | { t: 'lobby'; lobby: Lobby }
  | { t: 'state'; state: GameState }
  | { t: 'error'; text: string }
  | { t: 'rejected'; text: string };

export type Role = 'local' | 'host' | 'client';

export abstract class Session {
  abstract readonly role: Role;
  /** Owner id of this device: 'host' on the hosting device, else the client id. */
  abstract readonly me: string;
  code: string | null = null;
  lobby: Lobby = { players: [], preset: 'standard', goals: GOAL_PRESETS.standard };
  state: GameState | null = null;
  status = '';
  private listeners = new Set<() => void>();
  private errorListeners = new Set<(text: string) => void>();

  onChange(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  onError(cb: (text: string) => void) {
    this.errorListeners.add(cb);
    return () => this.errorListeners.delete(cb);
  }
  protected emit() {
    for (const cb of this.listeners) cb();
  }
  protected fail(text: string) {
    for (const cb of this.errorListeners) cb(text);
  }

  /** True if this device may act for the given player. */
  controls(playerId: string): boolean {
    const p = this.state?.players.find((x) => x.id === playerId);
    return !!p && p.controller === 'human' && p.owner === this.me;
  }

  abstract act(action: Action): void;
  abstract close(): void;
}

// ------------------------------------------------------------------ host

/** Runs the game on this device. With `online`, other devices can join by code. */
export class HostSession extends Session {
  readonly role: Role;
  readonly me = 'host';
  private peer: Peer | null = null;
  private conns = new Map<string, DataConnection>(); // clientId -> connection
  private botTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(online: boolean, hostName: string) {
    super();
    this.role = online ? 'host' : 'local';
    this.lobby.players.push({ name: hostName, controller: 'human', owner: 'host', connected: true });
    if (online) this.openRoom();
  }

  private openRoom(attempt = 0) {
    const code = randomCode();
    this.status = 'Creating room…';
    const peer = new Peer(PEER_PREFIX + code, PEER_OPTIONS);
    this.peer = peer;
    peer.on('open', () => {
      this.code = code;
      this.status = '';
      this.emit();
    });
    peer.on('connection', (conn) => this.accept(conn));
    peer.on('disconnected', () => {
      // Lost the broker only; existing game connections keep working.
      if (!peer.destroyed) setTimeout(() => !peer.destroyed && peer.reconnect(), 2000);
    });
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id' && attempt < 5) {
        peer.destroy();
        this.openRoom(attempt + 1);
      } else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
        this.status = 'Offline: cannot reach the matchmaking service. Check your internet connection.';
        this.emit();
      } else {
        this.fail(err.message);
      }
    });
  }

  private accept(conn: DataConnection) {
    let clientId: string | null = null;
    conn.on('data', (raw) => {
      const msg = raw as ToHost;
      if (msg.t === 'join') {
        clientId = String(msg.clientId).slice(0, 40);
        this.join(conn, clientId, String(msg.name ?? ''));
      } else if (msg.t === 'action' && clientId) {
        const p = this.state?.players.find((x) => x.id === msg.playerId);
        if (!p || p.owner !== clientId || p.controller !== 'human') return send(conn, { t: 'error', text: "That isn't your player." });
        const err = this.apply(msg.playerId, msg.action);
        if (err) send(conn, { t: 'error', text: err });
      }
    });
    conn.on('close', () => {
      if (clientId && this.conns.get(clientId) === conn) {
        this.conns.delete(clientId);
        this.setOnline(clientId, false);
      }
    });
  }

  private join(conn: DataConnection, clientId: string, name: string) {
    const old = this.conns.get(clientId);
    if (old && old !== conn) old.close();
    if (this.state) {
      if (!this.state.players.some((p) => p.owner === clientId)) {
        return send(conn, { t: 'rejected', text: 'That game has already started.' });
      }
      this.conns.set(clientId, conn);
      this.setOnline(clientId, true);
      return send(conn, { t: 'state', state: this.state });
    }
    if (!this.lobby.players.some((p) => p.owner === clientId)) {
      if (this.lobby.players.length >= MAX_PLAYERS) return send(conn, { t: 'rejected', text: 'That game is full.' });
      this.lobby.players.push({ name: name.trim().slice(0, 16) || 'Guest', controller: 'human', owner: clientId, connected: true });
    }
    this.conns.set(clientId, conn);
    this.setOnline(clientId, true);
  }

  private setOnline(clientId: string, online: boolean) {
    for (const p of this.lobby.players) if (p.owner === clientId) p.connected = online;
    if (this.state) this.state = setConnected(this.state, clientId, online);
    this.changed();
  }

  // -- lobby (host only)

  addPlayer(controller: Controller, name: string) {
    if (this.lobby.players.length >= MAX_PLAYERS || this.state) return;
    this.lobby.players.push({ name, controller, owner: 'host', connected: true });
    this.changed();
  }

  removePlayer(index: number) {
    const p = this.lobby.players[index];
    if (!p || index === 0 || this.state) return;
    this.lobby.players.splice(index, 1);
    const conn = this.conns.get(p.owner);
    if (conn) {
      send(conn, { t: 'rejected', text: 'The host removed you from the game.' });
      this.conns.delete(p.owner);
      setTimeout(() => conn.close(), 300);
    }
    this.changed();
  }

  renamePlayer(index: number, name: string) {
    const p = this.lobby.players[index];
    if (!p || p.owner !== 'host' || this.state) return;
    p.name = name.slice(0, 16);
    this.changed();
  }

  setPreset(preset: keyof typeof GOAL_PRESETS) {
    this.lobby.preset = preset;
    this.lobby.goals = GOAL_PRESETS[preset];
    this.changed();
  }

  start() {
    if (this.state) return;
    const seed = (Math.random() * 2 ** 31) | 0;
    this.state = createGame(this.lobby.players, this.lobby.goals, seed);
    for (const lp of this.lobby.players) if (!lp.connected) this.state = setConnected(this.state, lp.owner, false);
    this.changed();
  }

  /** Lets the computer finish a disconnected player's game (or hands it back). */
  setBot(playerId: string, bot: boolean) {
    if (!this.state) return;
    this.state = setController(this.state, playerId, bot ? 'bot' : 'human');
    this.changed();
  }

  // -- game

  act(action: Action) {
    if (!this.state) return;
    const p = currentPlayer(this.state);
    if (!this.controls(p.id)) return this.fail("It's not your turn.");
    const err = this.apply(p.id, action);
    if (err) this.fail(err);
  }

  private apply(playerId: string, action: Action): string | undefined {
    if (!this.state) return 'The game has not started.';
    const r = applyAction(this.state, playerId, action);
    if (r.error) return r.error;
    this.state = r.state;
    this.changed();
    return undefined;
  }

  private changed() {
    const msg: ToClient = this.state ? { t: 'state', state: this.state } : { t: 'lobby', lobby: this.lobby };
    for (const conn of this.conns.values()) send(conn, msg);
    this.emit();
    this.scheduleBot();
  }

  private scheduleBot() {
    if (this.botTimer || !this.state || this.state.phase !== 'playing') return;
    if (currentPlayer(this.state).controller !== 'bot') return;
    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      if (!this.state || this.state.phase !== 'playing' || currentPlayer(this.state).controller !== 'bot') return;
      this.state = botStep(this.state);
      this.changed();
    }, BOT_STEP_MS);
  }

  /** Instantly plays the current bot's remaining week (the "skip" button). */
  fastForwardBot() {
    if (!this.state || currentPlayer(this.state).controller !== 'bot') return;
    this.state = playBotWeek(this.state);
    this.changed();
  }

  close() {
    if (this.botTimer) clearTimeout(this.botTimer);
    for (const c of this.conns.values()) c.close();
    this.peer?.destroy();
  }
}

// ------------------------------------------------------------------ client

export class ClientSession extends Session {
  readonly role: Role = 'client';
  readonly me: string;
  private peer: Peer;
  private conn: DataConnection | null = null;
  private closed = false;
  private retries = 0;

  constructor(code: string, private name: string) {
    super();
    this.code = normalizeCode(code);
    this.me = clientId();
    this.status = 'Connecting…';
    this.peer = new Peer(PEER_OPTIONS);
    this.peer.on('open', () => this.connect());
    this.peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') {
        if (this.state || this.retries > 0) return this.retry();
        this.status = `No game found with code ${this.code}.`;
      } else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
        this.status = 'Cannot reach the matchmaking service. Check your internet connection.';
      } else {
        this.status = err.message;
      }
      this.emit();
    });
    this.peer.on('disconnected', () => {
      if (!this.closed && !this.peer.destroyed) setTimeout(() => !this.peer.destroyed && this.peer.reconnect(), 2000);
    });
  }

  private connect() {
    if (this.closed) return;
    const conn = this.peer.connect(PEER_PREFIX + this.code, { reliable: true });
    this.conn = conn;
    const timeout = setTimeout(() => {
      if (!conn.open && this.conn === conn) {
        this.status = this.state ? 'Reconnecting…' : 'The host is not answering. Check the code and try again.';
        this.emit();
      }
    }, 12000);
    conn.on('open', () => {
      clearTimeout(timeout);
      this.retries = 0;
      this.status = '';
      conn.send({ t: 'join', clientId: this.me, name: this.name } satisfies ToHost);
      this.emit();
    });
    conn.on('data', (raw) => {
      const msg = raw as ToClient;
      if (msg.t === 'lobby') this.lobby = msg.lobby;
      else if (msg.t === 'state') {
        if (!this.state || msg.state.seq >= this.state.seq || msg.state.phase !== this.state.phase) this.state = msg.state;
      } else if (msg.t === 'error') return this.fail(msg.text);
      else if (msg.t === 'rejected') {
        this.closed = true;
        this.status = msg.text;
      }
      this.emit();
    });
    conn.on('close', () => {
      clearTimeout(timeout);
      if (this.conn === conn && !this.closed) this.retry();
    });
  }

  private retry() {
    if (this.closed) return;
    this.retries++;
    this.status = this.retries > 20 ? 'Lost connection to the host.' : 'Connection lost. Reconnecting…';
    this.emit();
    if (this.retries <= 20) setTimeout(() => this.connect(), Math.min(1000 * this.retries, 5000));
  }

  act(action: Action) {
    if (!this.state) return;
    const p = currentPlayer(this.state);
    if (!this.controls(p.id)) return this.fail("It's not your turn.");
    if (!this.conn?.open) return this.fail('Not connected to the host.');
    this.conn.send({ t: 'action', playerId: p.id, action } satisfies ToHost);
  }

  close() {
    this.closed = true;
    this.conn?.close();
    this.peer.destroy();
  }
}

// ------------------------------------------------------------------ utils

function send(conn: DataConnection, msg: ToClient) {
  if (conn.open) conn.send(msg);
}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

/** Stable id for this tab/app run, so a client can rejoin after a dropped connection. */
function clientId(): string {
  const key = 'fll.clientId';
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = 'c' + crypto.getRandomValues(new Uint32Array(2)).join('');
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return 'c' + crypto.getRandomValues(new Uint32Array(2)).join('');
  }
}
