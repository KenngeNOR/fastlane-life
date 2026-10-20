// Static game content: the town map, jobs, courses and shop catalogue.
// Everything here is plain data so it can be tuned without touching rules.

export type LocationId =
  | 'lowcost'
  | 'rent'
  | 'pawn'
  | 'bargain'
  | 'burger'
  | 'threads'
  | 'gadget'
  | 'college'
  | 'employment'
  | 'factory'
  | 'bank'
  | 'market'
  | 'luxury'
  | 'park';

export interface LocationDef {
  id: LocationId;
  name: string;
  icon: string;
  blurb: string;
}

/** Locations in walking order around the ring road (clockwise). */
export const LOCATIONS: LocationDef[] = [
  { id: 'lowcost', name: 'Low-Cost Housing', icon: '🏚️', blurb: 'Cheap, cramped and a little unsafe.' },
  { id: 'rent', name: 'Rent Office', icon: '🗝️', blurb: 'Rent an apartment or pay what you owe.' },
  { id: 'pawn', name: 'Pawn Shop', icon: '💍', blurb: 'Quick cash for your belongings.' },
  { id: 'bargain', name: 'Bargain Mart', icon: '🛒', blurb: 'Discount clothes, canned food and lottery tickets.' },
  { id: 'burger', name: 'Burger Barn', icon: '🍔', blurb: 'Fast food and entry-level jobs.' },
  { id: 'threads', name: 'Threads Clothing', icon: '👔', blurb: 'Dress for the job you want.' },
  { id: 'gadget', name: 'Gadget Hub', icon: '📺', blurb: 'Appliances and electronics.' },
  { id: 'college', name: 'City College', icon: '🎓', blurb: 'Enroll in courses and earn degrees.' },
  { id: 'employment', name: 'Employment Office', icon: '📋', blurb: 'Browse every job in town and apply.' },
  { id: 'factory', name: 'Factory', icon: '🏭', blurb: 'Honest work, from janitor to executive.' },
  { id: 'bank', name: 'First City Bank', icon: '🏦', blurb: 'Savings, interest and the stock market.' },
  { id: 'market', name: 'Fresh Market', icon: '🥦', blurb: 'Groceries for the week ahead.' },
  { id: 'luxury', name: 'Skyline Towers', icon: '🏙️', blurb: 'Luxury living with a doorman.' },
  { id: 'park', name: 'City Park', icon: '🌳', blurb: 'A free place to unwind.' },
];

export const LOCATION_BY_ID = Object.fromEntries(LOCATIONS.map((l) => [l.id, l])) as Record<
  LocationId,
  LocationDef
>;

export type HousingId = 'lowcost' | 'luxury';

export interface HousingDef {
  id: HousingId;
  name: string;
  weeklyRent: number;
  /** Extra happiness gained every time you relax at home. */
  relaxBonus: number;
  /** Chance per weekend that a burglar steals an appliance. */
  burglaryChance: number;
}

export const HOUSING: Record<HousingId, HousingDef> = {
  lowcost: { id: 'lowcost', name: 'Low-Cost Housing', weeklyRent: 75, relaxBonus: 0, burglaryChance: 0.08 },
  luxury: { id: 'luxury', name: 'Skyline Towers', weeklyRent: 220, relaxBonus: 3, burglaryChance: 0 },
};

export type CourseId =
  | 'trade'
  | 'junior'
  | 'electronics'
  | 'business'
  | 'engineering'
  | 'academic'
  | 'graduate';

export interface CourseDef {
  id: CourseId;
  name: string;
  tuition: number;
  requires: CourseId[];
}

export const COURSES: CourseDef[] = [
  { id: 'trade', name: 'Trade School', tuition: 150, requires: [] },
  { id: 'junior', name: 'Junior College', tuition: 200, requires: [] },
  { id: 'electronics', name: 'Electronics', tuition: 300, requires: ['trade'] },
  { id: 'business', name: 'Business Administration', tuition: 400, requires: ['junior'] },
  { id: 'engineering', name: 'Engineering', tuition: 450, requires: ['electronics', 'junior'] },
  { id: 'academic', name: 'Academic Studies', tuition: 350, requires: ['junior'] },
  { id: 'graduate', name: 'Graduate School', tuition: 600, requires: ['academic', 'business'] },
];

export const COURSE_BY_ID = Object.fromEntries(COURSES.map((c) => [c.id, c])) as Record<
  CourseId,
  CourseDef
>;

/** Lessons needed to graduate from any course. */
export const LESSONS_PER_DEGREE = 8;

/** Clothing levels: 0 = rags, 1 = casual, 2 = business, 3 = executive. */
export type ClothesLevel = 0 | 1 | 2 | 3;
export const CLOTHES_NAMES = ['Rags', 'Casual', 'Business', 'Executive'] as const;

export interface JobDef {
  id: string;
  title: string;
  location: LocationId;
  wage: number;
  /** 1–10, drives the Career score. */
  rank: number;
  degrees: CourseId[];
  clothes: ClothesLevel;
  /** Shifts worked anywhere before you are considered. */
  experience: number;
}

export const JOBS: JobDef[] = [
  { id: 'burger-cook', title: 'Fry Cook', location: 'burger', wage: 5, rank: 1, degrees: [], clothes: 1, experience: 0 },
  { id: 'factory-janitor', title: 'Janitor', location: 'factory', wage: 5, rank: 1, degrees: [], clothes: 0, experience: 0 },
  { id: 'park-keeper', title: 'Groundskeeper', location: 'park', wage: 5.5, rank: 1, degrees: [], clothes: 1, experience: 0 },
  { id: 'bargain-clerk', title: 'Checkout Clerk', location: 'bargain', wage: 6, rank: 2, degrees: [], clothes: 1, experience: 4 },
  { id: 'threads-clerk', title: 'Sales Clerk', location: 'threads', wage: 6.5, rank: 2, degrees: [], clothes: 2, experience: 4 },
  { id: 'burger-manager', title: 'Shift Manager', location: 'burger', wage: 8, rank: 3, degrees: ['junior'], clothes: 1, experience: 10 },
  { id: 'factory-assembly', title: 'Assembly Worker', location: 'factory', wage: 8.5, rank: 3, degrees: ['trade'], clothes: 1, experience: 6 },
  { id: 'gadget-sales', title: 'Electronics Salesperson', location: 'gadget', wage: 9, rank: 3, degrees: ['trade'], clothes: 2, experience: 8 },
  { id: 'bank-teller', title: 'Bank Teller', location: 'bank', wage: 10, rank: 4, degrees: ['junior'], clothes: 2, experience: 10 },
  { id: 'rent-agent', title: 'Leasing Agent', location: 'rent', wage: 10, rank: 4, degrees: ['junior'], clothes: 2, experience: 12 },
  { id: 'gadget-tech', title: 'Repair Technician', location: 'gadget', wage: 13, rank: 5, degrees: ['electronics'], clothes: 1, experience: 14 },
  { id: 'threads-manager', title: 'Store Manager', location: 'threads', wage: 14, rank: 5, degrees: ['business'], clothes: 2, experience: 18 },
  { id: 'college-teacher', title: 'Teacher', location: 'college', wage: 15, rank: 6, degrees: ['academic'], clothes: 2, experience: 16 },
  { id: 'bank-loans', title: 'Loan Officer', location: 'bank', wage: 17, rank: 6, degrees: ['business'], clothes: 2, experience: 22 },
  { id: 'factory-engineer', title: 'Engineer', location: 'factory', wage: 20, rank: 7, degrees: ['engineering'], clothes: 2, experience: 24 },
  { id: 'college-professor', title: 'Professor', location: 'college', wage: 24, rank: 8, degrees: ['graduate'], clothes: 2, experience: 30 },
  { id: 'bank-manager', title: 'Branch Manager', location: 'bank', wage: 27, rank: 9, degrees: ['business', 'academic'], clothes: 3, experience: 36 },
  { id: 'factory-ceo', title: 'Chief Executive', location: 'factory', wage: 34, rank: 10, degrees: ['business', 'engineering'], clothes: 3, experience: 44 },
];

export const JOB_BY_ID = Object.fromEntries(JOBS.map((j) => [j.id, j])) as Record<string, JobDef>;

export type ApplianceId = 'fridge' | 'tv' | 'stereo' | 'computer';

export interface ApplianceDef {
  id: ApplianceId;
  name: string;
  icon: string;
  price: number;
  /** One-off happiness for buying your first one. */
  happiness: number;
  /** Extra happiness every time you relax at home. */
  relaxBonus: number;
  note: string;
}

export const APPLIANCES: Record<ApplianceId, ApplianceDef> = {
  fridge: { id: 'fridge', name: 'Refrigerator', icon: '🧊', price: 450, happiness: 2, relaxBonus: 0, note: 'Store up to 6 weeks of groceries.' },
  tv: { id: 'tv', name: 'Television', icon: '📺', price: 350, happiness: 4, relaxBonus: 2, note: 'Relaxing at home is more fun.' },
  stereo: { id: 'stereo', name: 'Stereo', icon: '📻', price: 250, happiness: 3, relaxBonus: 1, note: 'Music makes home nicer.' },
  computer: { id: 'computer', name: 'Computer', icon: '💻', price: 900, happiness: 3, relaxBonus: 1, note: 'Study at home while enrolled.' },
};

export interface ShopItem {
  id: string;
  name: string;
  price: number;
  note: string;
}

/** Things for sale at each location (appliances are listed separately). */
export const SHOP: Partial<Record<LocationId, ShopItem[]>> = {
  burger: [{ id: 'meal', name: 'Value Meal', price: 15, note: 'Counts as eating this week. +1 happiness.' }],
  market: [
    { id: 'groceries', name: 'Groceries (1 week)', price: 25, note: 'Eaten at the weekend.' },
    { id: 'treat', name: 'Gourmet Treat', price: 40, note: '+3 happiness.' },
  ],
  bargain: [
    { id: 'canned', name: 'Canned Food (1 week)', price: 20, note: 'Eaten at the weekend.' },
    { id: 'casual', name: 'Casual Clothes', price: 60, note: 'Lasts 12 weeks.' },
    { id: 'lottery', name: 'Lottery Ticket', price: 10, note: 'Drawn at the weekend. 1-in-60 to win $1,000.' },
  ],
  threads: [
    { id: 'casual-nice', name: 'Casual Clothes', price: 90, note: 'Lasts 12 weeks. +1 happiness.' },
    { id: 'business', name: 'Business Suit', price: 250, note: 'Lasts 12 weeks.' },
    { id: 'executive', name: 'Executive Attire', price: 600, note: 'Lasts 12 weeks. +2 happiness.' },
  ],
};

/** Time costs, in hours. */
export const HOURS_PER_WEEK = 60;
export const WALK_HOURS_PER_STEP = 1;
export const SHIFT_HOURS = 6;
export const CLASS_HOURS = 6;
export const RELAX_HOURS = 6;
export const APPLY_HOURS = 1;

export const CLOTHES_WEEKS = 12;
export const MAX_FOOD_NO_FRIDGE = 1;
export const MAX_FOOD_WITH_FRIDGE = 6;
export const SAVINGS_INTEREST = 0.01;
export const PAWN_RATE = 0.4;
export const EVICTION_DEBT_WEEKS = 4;

export const PLAYER_COLORS = ['#ff6b6b', '#4dabf7', '#51cf66', '#fcc419'];
export const PLAYER_AVATARS = ['🧑', '👩', '🧔', '👱'];
