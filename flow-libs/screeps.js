const Job = require('../src/jobs/job');
const Civilization = require('../src/civilization');

// Globally import lodash
const lodash = require('./lodash_v3.10.x.js');
declare var _: typeof lodash;

type FindOptions = {
  filter: (object: RoomObject) => boolean;
};

type FindPathOptions = {
  ignoreCreeps?: boolean;
  ignoreDestructibleStructures?: boolean;
  ignoreRoads?: boolean;
  costCallback?: (roomName: string, matrix: CostMatrix) => void;
  ignore?: Array<RoomObject|RoomPosition>;
  avoid?: Array<RoomObject|RoomPosition>;
  maxOps?: number;
  heuristicWeight?: number;
  serialize?: boolean;
  maxRooms?: number;
};

type PathStep = {
  x: number;
  y: number;
  dx: number;
  dy: number;
  direction: number;
}
type Path = Array<PathStep>;

type CostMatrix = any;

type User = { username: string; };

type ResourceStore = { [key: ResourceType]: number };

type Look = {
  type: LookType,
  structure?: Structure,
  creep?: Creep,
  terrain?: string,
  constructionSite?: ConstructionSite,
};

type RouteOptions = {
  routeCallback?: (roomName: string, fromRoomName: string) => number;
};

declare class ScreepsMap {
  findRoute(from: string|Room, to: string|Room, opts: ?RouteOptions): Array<{ exit: number, room: string }>;
  getRoomLinearDistance(start: string, end: string, continuous: ?boolean): number;
  getTerrainAt(x: number, y: number): string;
  getTerrainAt(target: RoomObject|RoomPosition): string;
};

declare class Market {
  calcTransactionCost(amount: number, roomName1: string, roomName2: string): number;
  cancelOrder(orderId: string): number;
  changeOrderPrice(orderId: string, newPrice: number): number;
  createOrder(type: string, resourceType: ResourceType, price: number, totalAmount: number, roomName: ?string): number;
  deal(orderId: string, amount: number, yourRoomName: ?string): number;
  extendOrder(orderId: string, addAmount: number): number;
  //getAllOrders(filter: ?Predicate<MarketOrder>): Array<MarketOrder>;
  //getOrderById(id: string): ?MarketOrder;
};

declare class Room {
  controller: ?StructureController;
  energyAvailable: number;
  energyCapacityAvailable: number;
  memory: Object;
  name: string;
  storage: ?StructureStorage;

  createConstructionSite(x: number, y: number, type: StructureType): number;
  createConstructionSite(target: RoomObject|RoomPosition, type: StructureType): number;
  createFlag(x: number, y: number, name: ?string, color: ?number, secondaryCoor: ?number): number|string;
  createFlag(target: RoomObject|RoomPosition, name: ?string, color: ?number, secondaryCoor: ?number): number|string;
  find(find: number, opts: ?FindOptions): Array<RoomObject>;
  getPositionAt(x: number, y:number): RoomPosition;
  lookAt(x: number, y: number): Array<Look>;
  lookAt(target: RoomObject|RoomPosition): Array<Look>;
  lookForAt(type: LookType, x: number, y: number): Array<RoomObject>;
  lookForAt(type: LookType, target: RoomObject|RoomPosition): Array<RoomObject>;
  lookForAtArea(type: LookType, top: number, left: number, bottom: number, right: number, asArray: true): Array<RoomObject>;
  lookForAtArea(type: LookType, top: number, left: number, bottom: number, right: number, asArray: void|false): { [key: number]: { [key: number]: ?Array<RoomObject> } };

  // Monkey patches
  getHostiles(): Array<Creep>;
  lookForInRange(look: LookType, pos: RoomPosition, range: number): Array<Look>;
};

declare class RoomPosition {
  x: number;
  y: number;
  roomName: string;

  constructor(x: number, y: number, roomName: string): RoomPosition;
  findClosestByRange(find: number): ?RoomObject;
  findInRange(find: number|Array<RoomPosition|RoomObject>, range: number, opts: ?FindOptions): Array<RoomObject>;
  findPathTo(x: number, y: number, opts: ?FindPathOptions): Path;
  findPathTo(target: RoomObject|RoomPosition, opts: ?FindPathOptions): Path;
  getDirectionTo(x: number, y: number): number;
  getDirectionTo(target: RoomObject|RoomPosition): number;
  getRangeTo(x: number, y: number): number;
  getRangeTo(target: RoomObject|RoomPosition): number;
  inRangeTo(x: number, y: number, range: number): boolean;
  inRangeTo(target: RoomObject|RoomPosition, range: number): boolean;
  isEqualTo(x: number, y: number): boolean;
  isEqualTo(target: RoomObject|RoomPosition): boolean;
  isNearTo(x: number, y: number): boolean;
  isNearTo(target: RoomObject|RoomPosition): boolean;

  // Monkey patches
  static deserialize(str: string): RoomPosition;

  nearbyPositions(filter: ?(p: RoomPosition) => boolean): Array<RoomPosition>;
  serialize(): string;
};

declare class RoomObject {
  id: string;
  pos: RoomPosition;
  room: Room;
  type: LookType;
};

declare class Flag extends RoomObject {
  color: number;
  memory: Object;
  name: string;
  secondaryColor: number;

  remove(): number;
  setColor(color: number, secondaryColor: number): number;
  setPosition(x: number, y: number): number;
  setPosition(target: RoomObject|RoomPosition): number;
};

declare class ConstructionSite extends RoomObject {
  my: boolean;
  owner: User;
  progress: number;
  progressTotal: number;
  structureType: StructureType;
};

declare class Mineral extends RoomObject {
};

declare class Resource extends RoomObject {
  resourceType: ResourceType;
  amount: number;
};

declare class Source extends RoomObject {
  energyCapacity: number;
  energy: number;
};

declare class Structure extends RoomObject {
  hits: number;
  hitsMax: number;
  structureType: StructureType;
};

declare class OwnedStructure extends Structure {
  my: boolean;
  owner: User;
};

declare class StructureContainer extends OwnedStructure {
  store: ResourceStore;
  storeCapacity: number;
};

declare class StructureController extends OwnedStructure {
  level: number;
  progress: number;
  progressTotal: number;
  safeMode: number;
  safeModeAvailable: number;
  safeModeCooldown: number;
  ticksToDowngrade: number;
  upgradeBlocked: number;

  activateSafeMode(): number;
  unclaim(): number;
};

declare class StructureExtension extends OwnedStructure {
  energy: number;
  energyCapacity: number;
}

declare class StructureLink extends OwnedStructure {
  cooldown: number;
  energy: number;
  energyCapacity: number;

  transferEnergy(target: StructureLink, amount: ?number): number;
}

declare class StructureRampart extends OwnedStructure {
  isPublic: boolean;
  ticksToDecay: number;

  setPublic(isPublic: boolean): number;
};

declare class StructureRoad extends Structure {
};

declare class StructureSpawn extends OwnedStructure {
  energy: number;
  energyCapacity: number;
  memory: Object;
  name: string;
  spawning: ?{ name: string, needTime: number, remainingTime: number };
}

declare class StructureStorage extends OwnedStructure {
  store: ResourceStore;
  storeCapacity: number;
};

declare class StructureTerminal extends OwnedStructure {
  store: ResourceStore;
  storeCapacity: number;
}

declare class StructureTower extends OwnedStructure {
  energy: number;
  energyCapacity: number;
}

declare var Game: {
  cpu: {
    limit: number;
    tickLimit: number;
    bucket: number;
    getUsed: () => number;
  };
  creeps: { [key: string]: Creep };
  flags: { [key: string]: Flag };
  map: ScreepsMap;
  market: Market;
  rooms: { [key: string]: Room };
  spawns: { [key: string]: StructureSpawn };
  time: number;

  getObjectById(id: string): ?RoomObject;
  notify(message: string, groupInterval: ?number): void;

  // Monkey patches
  civ: Civilization;
};

declare var RawMemory: {
  get(): string;
  set(value: string): void;
};
declare var Memory: Object;

declare class Creep extends RoomObject {
  name: string;
  body: Array<BodyPart>;
  carry: { [key: ResourceType]: number };
  carryCapacity: number;
  hits: number;
  hitsMax: number;
  memory: Object;
  ticksToLive: number;

  build(target: ConstructionSite): number;
  claimController(target: StructureController): number;
  getActiveBodyparts(type: BodyPartType): number;
  harvest(target: Source|Mineral): number;
  moveTo(target: RoomObject|RoomPosition): number;
  move(direction: number): number;
  pickup(target: Resource): number;
  rangedAttack(target: Creep|Structure): number;
  rangedMassAttack(): number;
  repair(target: Structure): number;
  say(message: string, isPublic: ?boolean): number;
  signController(target: StructureController, text: string): number;
  transfer(target: Creep|Structure, resourceType: ResourceType, amount: ?number): number;
  withdraw(target: Structure, resourceType: ResourceType, amount: ?number): number;

  // Monkey patches
  displacedByPriority: number;
  job: ?Job;
  movePriority: number;
  starvingFor: ?ResourceType;
  onlyCarries: ?ResourceType;
  blockedBy: ?Creep;

  blindMoveTo(target: RoomObject|RoomPosition, opts: ?FindPathOptions): number;
  getPartSummary(): { [key: BodyPartType]: number };
  onlyCarry(type: ?ResourceType): void;
};

type PathFinderGoal = RoomPosition|{ pos: RoomPosition, range?: number };
type PathFinderOptions = {
  roomCallback?: (roomName: string) => CostMatrix|false;
  plainCost?: number;
  swampCost?: number;
  flee?: boolean;
  maxOps?: number;
  maxRooms?: number;
  maxCost?: number;
  heuristicWeight?: number;
};
type PathFinderResult = {
  path: Array<RoomPosition>;
  ops: number;
  cost: number;
  incomplete: boolean;
};

declare class PathFinder {
  static search(origin: RoomPosition, goal: PathFinderGoal|Array<PathFinderGoal>, opts: ?PathFinderOptions): PathFinderResult;
};

type BodyPart = {
  boost: ?string;
  type: BodyPartType;
  hits: number;
};

declare var OK: 0;
declare var ERR_NOT_OWNER: -1;
declare var ERR_NO_PATH: -2;
declare var ERR_NAME_EXISTS: -3;
declare var ERR_BUSY: -4;
declare var ERR_NOT_FOUND: -5;
declare var ERR_NOT_ENOUGH_ENERGY: -6;
declare var ERR_NOT_ENOUGH_RESOURCES: -6;
declare var ERR_INVALID_TARGET: -7;
declare var ERR_FULL: -8;
declare var ERR_NOT_IN_RANGE: -9;
declare var ERR_INVALID_ARGS: -10;
declare var ERR_TIRED: -11;
declare var ERR_NO_BODYPART: -12;
declare var ERR_NOT_ENOUGH_EXTENSIONS: -6;
declare var ERR_RCL_NOT_ENOUGH: -14;
declare var ERR_GCL_NOT_ENOUGH: -15;

declare var FIND_EXIT_TOP: 1;
declare var FIND_EXIT_RIGHT: 3;
declare var FIND_EXIT_BOTTOM: 5;
declare var FIND_EXIT_LEFT: 7;
declare var FIND_EXIT: 10;
declare var FIND_CREEPS: 101;
declare var FIND_MY_CREEPS: 102;
declare var FIND_HOSTILE_CREEPS: 103;
declare var FIND_SOURCES_ACTIVE: 104;
declare var FIND_SOURCES: 105;
declare var FIND_DROPPED_ENERGY: 106;
declare var FIND_DROPPED_RESOURCES: 106;
declare var FIND_STRUCTURES: 107;
declare var FIND_MY_STRUCTURES: 108;
declare var FIND_HOSTILE_STRUCTURES: 109;
declare var FIND_FLAGS: 110;
declare var FIND_CONSTRUCTION_SITES: 111;
declare var FIND_MY_SPAWNS: 112;
declare var FIND_HOSTILE_SPAWNS: 113;
declare var FIND_MY_CONSTRUCTION_SITES: 114;
declare var FIND_HOSTILE_CONSTRUCTION_SITES: 115;
declare var FIND_MINERALS: 116;
declare var FIND_NUKES: 117;

declare var TOP: 1;
declare var TOP_RIGHT: 2;
declare var RIGHT: 3;
declare var BOTTOM_RIGHT: 4;
declare var BOTTOM: 5;
declare var BOTTOM_LEFT: 6;
declare var LEFT: 7;
declare var TOP_LEFT: 8;

declare var COLOR_RED: 1;
declare var COLOR_PURPLE: 2;
declare var COLOR_BLUE: 3;
declare var COLOR_CYAN: 4;
declare var COLOR_GREEN: 5;
declare var COLOR_YELLOW: 6;
declare var COLOR_ORANGE: 7;
declare var COLOR_BROWN: 8;
declare var COLOR_GREY: 9;
declare var COLOR_WHITE: 10;

declare var LOOK_CREEPS: "creep";
declare var LOOK_ENERGY: "energy";
declare var LOOK_RESOURCES: "resource";
declare var LOOK_SOURCES: "source";
declare var LOOK_MINERALS: "mineral";
declare var LOOK_STRUCTURES: "structure";
declare var LOOK_FLAGS: "flag";
declare var LOOK_CONSTRUCTION_SITES: "constructionSite";
declare var LOOK_NUKES: "nuke";
declare var LOOK_TERRAIN: "terrain";

type LookType = "creep"|"energy"|"resource"|"source"|"mineral"|"structure"|"flag"|"constructionSite"|"nuke"|"terrain";

declare var OBSTACLE_OBJECT_TYPES: ["spawn", "creep", "wall", "source", "constructedWall", "extension", "link", "storage", "tower", "observer", "powerSpawn", "powerBank", "lab", "terminal","nuker"];

declare var MOVE: "move";
declare var WORK: "work";
declare var CARRY: "carry";
declare var ATTACK: "attack";
declare var RANGED_ATTACK: "ranged_attack";
declare var TOUGH: "tough";
declare var HEAL: "heal";
declare var CLAIM: "claim";

declare var BODYPART_COST: {
  "move": 50,
  "work": 100,
  "attack": 80,
  "carry": 50,
  "heal": 250,
  "ranged_attack": 150,
  "tough": 10,
  "claim": 600
};
type BodyPartType = $Keys<typeof BODYPART_COST>;

declare var RESOURCE_ENERGY: "energy";
declare var RESOURCE_POWER: "power";
declare var RESOURCE_HYDROGEN: "H";
declare var RESOURCE_OXYGEN: "O";
declare var RESOURCE_UTRIUM: "U";
declare var RESOURCE_LEMERGIUM: "L";
declare var RESOURCE_KEANIUM: "K";
declare var RESOURCE_ZYNTHIUM: "Z";
declare var RESOURCE_CATALYST: "X";
declare var RESOURCE_GHODIUM: "G";
declare var RESOURCE_HYDROXIDE: "OH";
declare var RESOURCE_ZYNTHIUM_KEANITE: "ZK";
declare var RESOURCE_UTRIUM_LEMERGITE: "UL";
declare var RESOURCE_UTRIUM_HYDRIDE: "UH";
declare var RESOURCE_UTRIUM_OXIDE: "UO";
declare var RESOURCE_KEANIUM_HYDRIDE: "KH";
declare var RESOURCE_KEANIUM_OXIDE: "KO";
declare var RESOURCE_LEMERGIUM_HYDRIDE: "LH";
declare var RESOURCE_LEMERGIUM_OXIDE: "LO";
declare var RESOURCE_ZYNTHIUM_HYDRIDE: "ZH";
declare var RESOURCE_ZYNTHIUM_OXIDE: "ZO";
declare var RESOURCE_GHODIUM_HYDRIDE: "GH";
declare var RESOURCE_GHODIUM_OXIDE: "GO";
declare var RESOURCE_UTRIUM_ACID: "UH2O";
declare var RESOURCE_UTRIUM_ALKALIDE: "UHO2";
declare var RESOURCE_KEANIUM_ACID: "KH2O";
declare var RESOURCE_KEANIUM_ALKALIDE: "KHO2";
declare var RESOURCE_LEMERGIUM_ACID: "LH2O";
declare var RESOURCE_LEMERGIUM_ALKALIDE: "LHO2";
declare var RESOURCE_ZYNTHIUM_ACID: "ZH2O";
declare var RESOURCE_ZYNTHIUM_ALKALIDE: "ZHO2";
declare var RESOURCE_GHODIUM_ACID: "GH2O";
declare var RESOURCE_GHODIUM_ALKALIDE: "GHO2";
declare var RESOURCE_CATALYZED_UTRIUM_ACID: "XUH2O";
declare var RESOURCE_CATALYZED_UTRIUM_ALKALIDE: "XUHO2";
declare var RESOURCE_CATALYZED_KEANIUM_ACID: "XKH2O";
declare var RESOURCE_CATALYZED_KEANIUM_ALKALIDE: "XKHO2";
declare var RESOURCE_CATALYZED_LEMERGIUM_ACID: "XLH2O";
declare var RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE: "XLHO2";
declare var RESOURCE_CATALYZED_ZYNTHIUM_ACID: "XZH2O";
declare var RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE: "XZHO2";
declare var RESOURCE_CATALYZED_GHODIUM_ACID: "XGH2O";
declare var RESOURCE_CATALYZED_GHODIUM_ALKALIDE: "XGHO2";

type ResourceType = "energy"|"power"|"H"|"O"|"U"|"L"|"K"|"Z"|"X"|"G"|"OH"|"ZK"|"UL"|"UH"|"UO"|"KH"|"KO"|"LH"|"LO"|"ZH"|"ZO"|"GH"|"GO"|"UH2O"|"UHO2"|"KH2O"|"KHO2"|"LH2O"|"LHO2"|"ZH2O"|"ZHO2"|"GH2O"|"GHO2"|"XUH2O"|"XUHO2"|"XKH2O"|"XKHO2"|"XLH2O"|"XLHO2"|"XZH2O"|"XZHO2"|"XGH2O"|"XGHO2";

declare var WORLD_WIDTH: 162;
declare var WORLD_HEIGHT: 162;

declare var CREEP_LIFE_TIME: 1500;
declare var CREEP_CLAIM_LIFE_TIME: 500;
declare var CREEP_CORPSE_RATE: 0.2;

declare var CARRY_CAPACITY: 50;
declare var HARVEST_POWER: 2;
declare var HARVEST_MINERAL_POWER: 1;
declare var REPAIR_POWER: 100;
declare var DISMANTLE_POWER: 50;
declare var BUILD_POWER: 5;
declare var ATTACK_POWER: 30;
declare var UPGRADE_CONTROLLER_POWER: 1;
declare var RANGED_ATTACK_POWER: 10;
declare var HEAL_POWER: 12;
declare var RANGED_HEAL_POWER: 4;
declare var REPAIR_COST: 0.01;
declare var DISMANTLE_COST: 0.005;

declare var RAMPART_DECAY_AMOUNT: 300;
declare var RAMPART_DECAY_TIME: 100;
declare var RAMPART_HITS: 1;
declare var RAMPART_HITS_MAX: { [key: number]: number };

declare var ENERGY_REGEN_TIME: 300;
declare var ENERGY_DECAY: 1000;

declare var SPAWN_HITS: 5000;
declare var SPAWN_ENERGY_START: 300;
declare var SPAWN_ENERGY_CAPACITY: 300;
declare var CREEP_SPAWN_TIME: 3;
declare var SPAWN_RENEW_RATIO: 1.2;

declare var SOURCE_ENERGY_CAPACITY: 3000;
declare var SOURCE_ENERGY_NEUTRAL_CAPACITY: 1500;
declare var SOURCE_ENERGY_KEEPER_CAPACITY: 4000;

declare var WALL_HITS: 1;
declare var WALL_HITS_MAX: 300000000;

declare var EXTENSION_HITS: 1000;
declare var EXTENSION_ENERGY_CAPACITY: { [key: number]: number };

declare var ROAD_HITS: 5000;
declare var ROAD_WEAROUT: 1;
declare var ROAD_DECAY_AMOUNT: 100;
declare var ROAD_DECAY_TIME: 1000;

declare var LINK_HITS: 1000;
declare var LINK_HITS_MAX: 1000;
declare var LINK_CAPACITY: 800;
declare var LINK_COOLDOWN: 1;
declare var LINK_LOSS_RATIO: 0.03;

declare var STORAGE_CAPACITY: 1000000;
declare var STORAGE_HITS: 10000;

type StructureType = "spawn"|"extension"|"road"|"constructedWall"|"rampart"|"keeperLair"|"portal"|"controller"|"link"|"storage"|"tower"|"observer"|"powerBank"|"powerSpawn"|"extractor"|"lab"|"terminal"|"container"|"nuker";

declare var STRUCTURE_SPAWN: "spawn";
declare var STRUCTURE_EXTENSION: "extension";
declare var STRUCTURE_ROAD: "road";
declare var STRUCTURE_WALL: "constructedWall";
declare var STRUCTURE_RAMPART: "rampart";
declare var STRUCTURE_KEEPER_LAIR: "keeperLair";
declare var STRUCTURE_PORTAL: "portal";
declare var STRUCTURE_CONTROLLER: "controller";
declare var STRUCTURE_LINK: "link";
declare var STRUCTURE_STORAGE: "storage";
declare var STRUCTURE_TOWER: "tower";
declare var STRUCTURE_OBSERVER: "observer";
declare var STRUCTURE_POWER_BANK: "powerBank";
declare var STRUCTURE_POWER_SPAWN: "powerSpawn";
declare var STRUCTURE_EXTRACTOR: "extractor";
declare var STRUCTURE_LAB: "lab";
declare var STRUCTURE_TERMINAL: "terminal";
declare var STRUCTURE_CONTAINER: "container";
declare var STRUCTURE_NUKER: "nuker";

declare var CONTROLLER_STRUCTURES: { [key: StructureType]: { [key: number]: number } };
declare var CONSTRUCTION_COST: { [key: StructureType]: number };

/*
{

    CONSTRUCTION_COST_ROAD_SWAMP_RATIO: 5,

    CONTROLLER_LEVELS: {1: 200, 2: 45000, 3: 135000, 4: 405000, 5: 1215000, 6: 3645000, 7: 10935000},
    CONTROLLER_DOWNGRADE: {1: 20000, 2: 5000, 3: 10000, 4: 20000, 5: 40000, 6: 60000, 7: 100000, 8: 150000},
*/
declare var CONTROLLER_CLAIM_DOWNGRADE: 0.2;
declare var CONTROLLER_RESERVE: 1;
declare var CONTROLLER_RESERVE_MAX: 5000;
declare var CONTROLLER_MAX_UPGRADE_PER_TICK: 15;
declare var CONTROLLER_ATTACK_BLOCKED_UPGRADE: 1000;
declare var CONTROLLER_NUKE_BLOCKED_UPGRADE: 200;

declare var SAFE_MODE_DURATION: 20000;
declare var SAFE_MODE_COOLDOWN: 50000;
declare var SAFE_MODE_COST: 1000;

declare var TOWER_HITS: 3000;
declare var TOWER_CAPACITY: 1000;
declare var TOWER_ENERGY_COST: 10;
declare var TOWER_POWER_ATTACK: 600;
declare var TOWER_POWER_HEAL: 400;
declare var TOWER_POWER_REPAIR: 800;
declare var TOWER_OPTIMAL_RANGE: 5;
declare var TOWER_FALLOFF_RANGE: 20;
declare var TOWER_FALLOFF: 0.75;

declare var OBSERVER_HITS: 500;
declare var OBSERVER_RANGE: 10;

declare var POWER_BANK_HITS: 2000000;
declare var POWER_BANK_CAPACITY_MAX: 5000;
declare var POWER_BANK_CAPACITY_MIN: 500;
declare var POWER_BANK_CAPACITY_CRIT: 0.3;
declare var POWER_BANK_DECAY: 5000;
declare var POWER_BANK_HIT_BACK: 0.5;

declare var POWER_SPAWN_HITS: 5000;
declare var POWER_SPAWN_ENERGY_CAPACITY: 5000;
declare var POWER_SPAWN_POWER_CAPACITY: 100;
declare var POWER_SPAWN_ENERGY_RATIO: 50;

declare var EXTRACTOR_HITS: 500;
declare var EXTRACTOR_COOLDOWN: 5;

declare var LAB_HITS: 500;
declare var LAB_MINERAL_CAPACITY: 3000;
declare var LAB_ENERGY_CAPACITY: 2000;
declare var LAB_BOOST_ENERGY: 20;
declare var LAB_BOOST_MINERAL: 30;
declare var LAB_COOLDOWN: 10;
declare var LAB_REACTION_AMOUNT: 5;

declare var GCL_POW: 2.4;
declare var GCL_MULTIPLY: 1000000;
declare var GCL_NOVICE: 3;

declare var MODE_SIMULATION: "simulation";
declare var MODE_SURVIVAL: "survival";
declare var MODE_WORLD: "world";
declare var MODE_ARENA: "arena";

declare var TERRAIN_MASK_WALL: 1;
declare var TERRAIN_MASK_SWAMP: 2;
declare var TERRAIN_MASK_LAVA: 4;

declare var MAX_CONSTRUCTION_SITES: 100;
declare var MAX_CREEP_SIZE: 50;

declare var MINERAL_REGEN_TIME: 50000;
/*
    MINERAL_MIN_AMOUNT: {
        "H": 35000,
        "O": 35000,
        "L": 35000,
        "K": 35000,
        "Z": 35000,
        "U": 35000,
        "X": 35000
    },
    MINERAL_RANDOM_FACTOR: 2,

    MINERAL_DENSITY: {
        1: 15000,
        2: 35000,
        3: 70000,
        4: 100000
    },
    MINERAL_DENSITY_PROBABILITY  : {
        1: 0.1,
        2: 0.5,
        3: 0.9,
        4: 1.0
    },
    MINERAL_DENSITY_CHANGE: 0.05,
*/

declare var DENSITY_LOW: 1;
declare var DENSITY_MODERATE: 2;
declare var DENSITY_HIGH: 3;
declare var DENSITY_ULTRA: 4;

declare var TERMINAL_CAPACITY: 300000;
declare var TERMINAL_HITS: 3000;
declare var TERMINAL_SEND_COST: 0.1;
declare var TERMINAL_MIN_SEND: 100;

declare var CONTAINER_HITS: 250000;
declare var CONTAINER_CAPACITY: 2000;
declare var CONTAINER_DECAY: 5000;
declare var CONTAINER_DECAY_TIME: 100;
declare var CONTAINER_DECAY_TIME_OWNED: 500;

/*

    NUKER_HITS: 1000,
    NUKER_COOLDOWN: 100000,
    NUKER_ENERGY_CAPACITY: 300000,
    NUKER_GHODIUM_CAPACITY: 5000,
    NUKE_LAND_TIME: 50000,
    NUKE_RANGE: 10,
    NUKE_DAMAGE: {
        0: 10000000,
        2: 5000000
    },

    PORTAL_DECAY: 30000,

    ORDER_SELL: "sell",
    ORDER_BUY: "buy",

    MARKET_FEE: 0.05,

    FLAGS_LIMIT: 10000,

    SUBSCRIPTION_TOKEN: "token",

    REACTIONS: {
        H: {
            O: "OH",
            L: "LH",
            K: "KH",
            U: "UH",
            Z: "ZH",
            G: "GH"
        },
        O: {
            H: "OH",
            L: "LO",
            K: "KO",
            U: "UO",
            Z: "ZO",
            G: "GO"
        },
        Z: {
            K: "ZK",
            H: "ZH",
            O: "ZO"
        },
        L: {
            U: "UL",
            H: "LH",
            O: "LO"
        },
        K: {
            Z: "ZK",
            H: "KH",
            O: "KO"
        },
        G: {
            H: "GH",
            O: "GO"
        },
        U: {
            L: "UL",
            H: "UH",
            O: "UO"
        },
        OH: {
            UH: "UH2O",
            UO: "UHO2",
            ZH: "ZH2O",
            ZO: "ZHO2",
            KH: "KH2O",
            KO: "KHO2",
            LH: "LH2O",
            LO: "LHO2",
            GH: "GH2O",
            GO: "GHO2"
        },
        X: {
            UH2O: "XUH2O",
            UHO2: "XUHO2",
            LH2O: "XLH2O",
            LHO2: "XLHO2",
            KH2O: "XKH2O",
            KHO2: "XKHO2",
            ZH2O: "XZH2O",
            ZHO2: "XZHO2",
            GH2O: "XGH2O",
            GHO2: "XGHO2"
        },
        ZK: {
            UL: "G"
        },
        UL: {
            ZK: "G"
        },
        LH: {
            OH: "LH2O"
        },
        ZH: {
            OH: "ZH2O"
        },
        GH: {
            OH: "GH2O"
        },
        KH: {
            OH: "KH2O"
        },
        UH: {
            OH: "UH2O"
        },
        LO: {
            OH: "LHO2"
        },
        ZO: {
            OH: "ZHO2"
        },
        KO: {
            OH: "KHO2"
        },
        UO: {
            OH: "UHO2"
        },
        GO: {
            OH: "GHO2"
        },
        LH2O: {
            X: "XLH2O"
        },
        KH2O: {
            X: "XKH2O"
        },
        ZH2O: {
            X: "XZH2O"
        },
        UH2O: {
            X: "XUH2O"
        },
        GH2O: {
            X: "XGH2O"
        },
        LHO2: {
            X: "XLHO2"
        },
        UHO2: {
            X: "XUHO2"
        },
        KHO2: {
            X: "XKHO2"
        },
        ZHO2: {
            X: "XZHO2"
        },
        GHO2: {
            X: "XGHO2"
        }
    },
*/


declare var PORTAL_UNSTABLE: number;
declare var PORTAL_MIN_TIMEOUT: number;
declare var PORTAL_MAX_TIMEOUT: number;

declare var POWER_BANK_RESPAWN_TIME: 50000;

declare var INVADERS_ENERGY_GOAL: 10000;

declare var BOOSTS: { [key: BodyPartType]: { [key: string]: { [key: string]: number } } };
declare var BODYPARTS_ALL: Array<BodyPartType>;
declare var RESOURCES_ALL: Array<string>;
declare var COLORS_ALL: Array<number>;
