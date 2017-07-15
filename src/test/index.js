import { expect } from "chai";
import { isAvailable } from "../Marshal";

function* spawnCreep() {
  let spawn = Game.spawns[Object.keys(Game.spawns)[0]];
  if (!spawn) {
    throw new Error("Cannot spawn creep: No spawns");
  }
  let name = spawn.createCreep([MOVE]);
  if (typeof name === "number") {
    throw new Error("Cannot spawn creep: Error " + name);
  }
  while (Game.creeps[name].spawning) {
    yield null;
  }
  return Game.creeps[name];
}

function* testRoomObjects() {
  // Get a reference to a creep
  let creep = Game.creeps[Object.keys(Game.creeps)[0]];
  if (!creep) {
    creep = yield* spawnCreep();
  }
  expect(creep).to.be.an.instanceof(Creep);
  expect(isAvailable(creep)).to.equal(true);

  yield null;
  expect(creep).to.be.an.instanceof(Creep);
  expect(isAvailable(creep)).to.equal(true);
  creep.suicide();

  yield null;
  expect(creep).to.be.an.instanceof(RoomObject);
  expect(isAvailable(creep)).to.equal(false);
  expect(() => creep.pos).to.throw(/is not available/);
}

export default function*() {
  console.log("Starting test suite");

  const tests = [testRoomObjects];
  var failures = 0;

  for (let i = 0; i < tests.length; i++) {
    try {
      yield* tests[i]();
    } catch (err) {
      console.log(err);
      failures += 1;
    }
  }

  console.log(`${tests.length} tests, ${failures} failures`);
  while (true) {
    yield null;
  }
}
