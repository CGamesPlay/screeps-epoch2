// @flow

const findCreepFromSpawn = (spawn: StructureSpawn): ?Creep => {
  const candidates = spawn.room.find(FIND_CREEPS, {
    filter: (c: Creep) =>
      c.memory.spawn === spawn.id &&
      c.getActiveBodyparts(WORK) > 0 &&
      c.getActiveBodyparts(MOVE) > 0 &&
      c.getActiveBodyparts(CARRY) > 0,
  });
  const creep: Creep = (candidates[0]: any);
  if (creep) {
    creep.memory.spawn = spawn.id;
  }
  return creep;
};

const findSource = (room: Room): ?Source => {
  const candidates = room.find(FIND_SOURCES);
  return (candidates[0]: any);
};

function* spawnCreep(spawn: StructureSpawn) {
  let name = spawn.createCreep([MOVE, WORK, CARRY]);
  if (typeof name === "number") {
    throw new Error("Cannot spawn creep: Error " + name);
  }
  while (Game.creeps[name].spawning) {
    yield null;
  }
  return Game.creeps[name];
}

function* moveTo(creep: Creep, target: RoomPosition, options: ?Object) {
  const range = (options && options.range) || 1;
  while (creep.pos.getRangeTo(target) > range) {
    let err = creep.moveTo(target, options);
    if (err != OK && err != ERR_TIRED) {
      throw new Error("Cannot move");
    }
    yield null;
  }
}

function* harvest(creep: Creep, source: Source) {
  while (_.sum(creep.carry) < creep.carryCapacity) {
    let err = creep.harvest(source);
    if (err != OK) {
      throw new Error("Unable to harvest");
    }
    yield null;
  }
}

function* fillStructure(creep: Creep, spawn: StructureSpawn) {
  let err = creep.transfer(spawn, RESOURCE_ENERGY);
  if (err != OK && err != ERR_FULL) {
    throw new Error("Unable to fillStructure");
  }
  yield null;
}

function* runSpawn(spawn: Spawn) {
  let source = findSource(spawn.room);
  if (!source) {
    throw new Error("No source in the room");
  }
  let creep = findCreepFromSpawn(spawn);
  if (!creep) {
    creep = yield* spawnCreep(spawn);
  }
  console.log(`Watch ${creep.name} in ${spawn.room.name}`);
  while (true) {
    if (_.sum(creep.carry) < creep.carryCapacity) {
      yield* moveTo(creep, source.pos, { visualizePathStyle: {} });
      yield* harvest(creep, source);
    } else {
      yield* moveTo(creep, spawn.pos, { visualizePathStyle: {} });
      while (spawn.energy == spawn.energyCapacity) {
        yield null;
      }
      yield* fillStructure(creep, spawn);
    }
  }
}

export default function*() {
  let spawn = Game.spawn[Object.keys(Game.spawns)[0]];
  yield* runSpawn(spawn);
}
