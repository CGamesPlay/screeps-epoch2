// @flow

import { expect } from "chai";

import type { TaskGenerator } from "../kernel";
import { defer, call, isAvailable } from "../kernel";

function* spawnCreep() {
  console.log("Spawning a creep");
  let spawn = Game.spawns[Object.keys(Game.spawns)[0]];
  if (!spawn) {
    throw new Error("Cannot spawn creep: No spawns");
  }
  let name = spawn.createCreep([MOVE]);
  if (typeof name === "number") {
    throw new Error("Cannot spawn creep: Error " + name);
  }
  let creep = Game.creeps[name];
  while (creep.spawning) {
    yield defer();
  }
  return creep;
}

function* testRoomObjects() {
  // Get a reference to a creep
  let creep = Game.creeps[Object.keys(Game.creeps)[0]];
  if (!creep) {
    creep = yield call(spawnCreep);
  }
  let name = creep.name;
  expect(creep).to.be.an.instanceof(Creep);
  expect(isAvailable(creep)).to.equal(true);

  yield defer();
  expect(creep).to.be.an.instanceof(Creep);
  expect(isAvailable(creep)).to.equal(true);
  creep.suicide();

  yield defer();
  expect(creep).to.be.an.instanceof(RoomObject);
  expect(isAvailable(creep)).to.equal(false);
  expect(() => creep.pos).to.throw(/is not available/);
  expect(creep.name).to.equal(name);
}

const tests = [testRoomObjects];

function* runTests(): TaskGenerator<> {
  console.log("Starting test suite");

  var failures = 0;

  for (let i = 0; i < tests.length; i++) {
    try {
      yield call(tests[i]);
    } catch (err) {
      console.log(err.stack);
      failures += 1;
    }
  }

  console.log(`${tests.length} tests, ${failures} failures`);
  while (true) {
    yield defer();
  }
}

export default runTests;
