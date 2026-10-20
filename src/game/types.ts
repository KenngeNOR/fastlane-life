import type { ApplianceId, ClothesLevel, CourseId, HousingId, LocationId } from './data';

export interface Goals {
  wealth: number;
  happiness: number;
  education: number;
  career: number;
}

export type Controller = 'human' | 'bot';

export interface Player {
  id: string;
  name: string;
  color: string;
  avatar: string;
  controller: Controller;
  /** Device that controls this player. The host device is always 'host'. */
  owner: string;
  connected: boolean;

  location: LocationId;
  hoursLeft: number;
  /** Hours lost at the start of next week (from going hungry). */
  sickHours: number;

  cash: number;
  savings: number;
  shares: number;

  happiness: number;

  housing: HousingId | null;
  rentPrepaidWeeks: number;
  rentDebt: number;

  food: number;
  ateThisWeek: boolean;
  relaxedThisWeek: number;
  studiedAtHomeThisWeek: boolean;

  clothes: ClothesLevel;
  clothesWeeks: number;
  appliances: ApplianceId[];

  degrees: CourseId[];
  enrolled: CourseId | null;
  lessons: number;

  jobId: string | null;
  hoursWorked: number;

  lotteryTickets: number;
}

export interface LogEntry {
  week: number;
  playerId: string | null;
  text: string;
}

export interface WeekendReport {
  playerId: string;
  week: number;
  lines: string[];
}

export interface GameState {
  version: 1;
  phase: 'playing' | 'over';
  week: number;
  current: number;
  players: Player[];
  goals: Goals;
  stockPrice: number;
  rng: number;
  log: LogEntry[];
  lastReport: WeekendReport | null;
  winnerIds: string[];
  /** Incremented on every accepted action; lets clients drop stale updates. */
  seq: number;
}

export type Action =
  | { type: 'move'; to: LocationId }
  | { type: 'endTurn' }
  | { type: 'work' }
  | { type: 'apply'; jobId: string }
  | { type: 'enroll'; courseId: CourseId }
  | { type: 'attend' }
  | { type: 'study' }
  | { type: 'relax' }
  | { type: 'buy'; itemId: string }
  | { type: 'buyAppliance'; applianceId: ApplianceId }
  | { type: 'pawn'; applianceId: ApplianceId }
  | { type: 'deposit'; amount: number }
  | { type: 'withdraw'; amount: number }
  | { type: 'buyShares'; count: number }
  | { type: 'sellShares'; count: number }
  | { type: 'rent'; housing: HousingId }
  | { type: 'payRent'; weeks: number };

export interface PlayerSetup {
  name: string;
  controller: Controller;
  owner: string;
}

export interface ActionResult {
  state: GameState;
  error?: string;
}
