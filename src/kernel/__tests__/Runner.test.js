import Runner from "../Runner";
import { spawn, join, call, createChannel, wait, all, race } from "../effects";

const identity = x => x;

function* genIdentity(param) {
  return param;
}

function* genError(message) {
  throw new Error(message);
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
  try {
    yield call(genError, "uh oh");
  } catch (ex) {
    actual.push(`Error caught: ${ex.message}`);
  }
}

function* genChannelBasic(actual) {
  const chan = yield createChannel();
  const task = yield spawn(genChannelBasicChild, actual, chan);
  actual.push("waiting on value");
  let value = yield wait(chan);
  actual.push(`received ${value}`);
  value = yield wait(chan);
  actual.push(`received ${value}`);
}

function* genChannelBasicChild(actual, chan) {
  actual.push("Putting value");
  chan.notify(1234);
  chan.notify(5678);
}

function* genAllImmediate() {
  const chanA = yield createChannel(),
    chanB = yield createChannel();
  chanA.notify("valueA");
  chanB.notify("valueB");
  let result = yield all({ chanA: wait(chanA), chanB: wait(chanB) });
  expect(result).toEqual({ chanA: "valueA", chanB: "valueB" });
  chanA.notify("valueC");
  chanB.notify("valueD");
  result = yield all(wait(chanA), wait(chanB));
  expect(result).toEqual(["valueC", "valueD"]);
}

function* genAllDelayed() {
  const lock = yield createChannel(),
    chanA = yield createChannel(),
    chanB = yield createChannel();
  yield spawn(genAllDelayedChild, lock, chanA, chanB);
  lock.notify();
  let result = yield all({ chanA: wait(chanA), chanB: wait(chanB) });
  expect(result).toEqual({ chanA: "valueA", chanB: "valueB" });
  lock.notify();
  result = yield all(wait(chanA), wait(chanB));
  expect(result).toEqual(["valueC", "valueD"]);
}

function* genAllDelayedChild(lock, chanA, chanB) {
  yield wait(lock);
  chanA.notify("valueA");
  chanB.notify("valueB");
  yield wait(lock);
  chanA.notify("valueC");
  chanB.notify("valueD");
}

function* genAllArray() {
  const chanA = yield createChannel(),
    chanB = yield createChannel();
  chanA.notify("valueA");
  chanB.notify("valueB");
  let result = yield [wait(chanA), wait(chanB)];
  expect(result).toEqual(["valueA", "valueB"]);
}

function* genRaceImmediate() {
  const chanA = yield createChannel(),
    chanB = yield createChannel();
  chanA.notify("valueA");
  chanB.notify("valueB");
  let result = yield race({ chanA: wait(chanA), chanB: wait(chanB) });
  expect(result).toEqual({ chanA: "valueA" });
  result = yield race([wait(chanA), wait(chanB)]);
  expect(result).toEqual([void 0, "valueB"]);
}

function* genRaceDelayed() {
  const lock = yield createChannel(),
    chanA = yield createChannel(),
    chanB = yield createChannel();
  yield spawn(genRaceDelayedChild, lock, chanA, chanB);
  lock.notify();
  let result = yield race({ chanA: wait(chanA), chanB: wait(chanB) });
  expect(result).toEqual({ chanA: "valueA" });
  lock.notify();
  result = yield race(wait(chanA), wait(chanB));
  expect(result).toEqual([void 0, "valueB"]);
}

function* genRaceDelayedChild(lock, chanA, chanB) {
  yield wait(lock);
  chanA.notify("valueA");
  yield wait(lock);
  chanB.notify("valueB");
}

function* genRaceNested() {
  const result = yield all({
    foo: race(["one", "two"]),
    bar: all(["three", "four"]),
    baz: ["five", "six"],
  });
  expect(result).toEqual({
    foo: ["one"],
    bar: ["three", "four"],
    baz: ["five", "six"],
  });
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
    runner.step();
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
    expect(actual).toEqual([
      "sync identity",
      "gen identity",
      "Error caught: uh oh",
    ]);
  });

  describe("all", () => {
    it("handles immediately available values", () => {
      run(genAllImmediate());
    });
    it("handles delayed values", () => {
      run(genAllDelayed());
    });
    it("allows simple arrays", () => {
      run(genAllArray());
    });
  });

  describe("race", () => {
    it("handles immediately resolved races", () => {
      run(genRaceImmediate());
    });
    it("handles delayed races", () => {
      run(genRaceDelayed());
    });
    it("can be nested", () => {
      run(genRaceNested());
    });
  });

  describe("Channels", () => {
    it("can pass values", () => {
      const actual = [];
      run(genChannelBasic(actual));
      expect(actual).toEqual([
        "waiting on value",
        "Putting value",
        "received 1234",
        "received 5678",
      ]);
    });
  });
});
