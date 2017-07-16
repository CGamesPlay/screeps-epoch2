import Runner from "../Runner";
import { spawn, join, call } from "../effects";

const identity = x => x;

function* genIdentity(param) {
  return param;
}

function* genNoOps() {
  yield null;
  yield 1;
}

function* genSpawnChild(actual) {
  actual.push("genSpawnChild start");
  for (var i = 1; i <= 2; i++) {
    actual.push(`genSpawnChild ${i}`);
    yield null;
  }
  actual.push("genSpawnChild finish");
  return "finish value";
}

function* genSpawn(actual) {
  actual.push("genSpawn start");
  const task = yield spawn(genSpawnChild, actual);
  actual.push("genSpawn continue");
  const result = yield join(task);
  actual.push("genSpawn joined with " + result);
}

function* genCall(actual) {
  actual.push(yield call(identity, "sync identity"));
  actual.push(yield call(genIdentity, "gen identity"));
}

const run = gen => {
  const runner = new Runner();
  var steps = 0;
  let task = runner.run(gen);
  while (runner.isActive()) {
    steps += 1;
    if (steps > 100) {
      throw new Error("Timed out after 100 steps");
    }
    if (!runner.step()) {
      throw new Error("Deadlocked");
    }
  }
  if (task.error()) {
    throw task.error();
  } else {
    return task.result();
  }
};

describe("Runner", () => {
  it("handles no-op effects", () => {
    run(genNoOps());
  });

  it("handles single spawn/join effects", () => {
    const actual = [];
    run(genSpawn(actual));
    expect(actual).toEqual([
      "genSpawn start",
      "genSpawn continue",
      "genSpawnChild start",
      "genSpawnChild 1",
      "genSpawnChild 2",
      "genSpawnChild finish",
      "genSpawn joined with finish value",
    ]);
  });

  it("handles call effects", () => {
    const actual = [];
    run(genCall(actual));
    expect(actual).toEqual(["sync identity", "gen identity"]);
  });
});
