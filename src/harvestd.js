// @flow

import type { TaskGenerator } from "./kernel";
import {
  Process,
  invariant,
  defer,
  spawn,
  join,
  call,
  all,
  race,
} from "./kernel";
import { intentError, delay, genCreateCreep, genMoveTo } from "./helpers";

function* spawnCreep() {}

function* getCreep(options) {
  const start = Game.time;
  const spawn: ?StructureSpawn = options.pos.findClosestByRange(FIND_MY_SPAWNS);
  invariant(spawn, "No spawn in the room");
  const creep = yield call(genCreateCreep, spawn, [MOVE, WORK, WORK]);
  yield call(genMoveTo, creep, options.pos);
  return { creep, timeTaken: Game.time - start };
}

function* harvestToDeath(creep: Creep, source: Source) {
  while (true) {
    let err = creep.harvest(source);
    if (err === OK) {
      yield defer();
    } else if (err === ERR_NOT_IN_RANGE) {
      yield call(genMoveTo, creep, source.pos);
    } else if (err === ERR_NOT_ENOUGH_RESOURCES) {
      yield call(delay, 1);
    } else {
      throw intentError("Unable to harvest", err);
    }
  }
}

function* harvestSource(source: Source) {
  try {
    while (true) {
      let { creep, timeTaken } = yield call(getCreep, { pos: source.pos });
      let harvestTask = yield spawn(harvestToDeath, creep, source);
      yield race({
        harvest: join(harvestTask),
        preSpawnTimer: call(delay, creep.ticksToLive - timeTaken),
      });
    }
  } catch (err) {
    console.log("Bailing on", source, err.stack);
  }
}

function* harvestd(): TaskGenerator<> {
  console.log("Harvestd starting");
  let sources = _.filter(
    Game.rooms,
    r => r.controller && r.controller.my,
  ).reduce(
    (sources: Array<Source>, room: Room) =>
      sources.concat(room.find(FIND_SOURCES)),
    [],
  );
  console.log(`Harvesting from ${sources.length} sources`);
  let tasks = yield all(sources.map(s => spawn(harvestSource, s)));
  yield all(tasks.map(t => join(t)));
}

export default harvestd;
