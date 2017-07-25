import Runner from "../Runner";
import Semaphore from "../Semaphore";
import { spawn, join, call, createChannel, wait, all, race } from "../effects";

const identity = x => x;

function* genIdentity(param) {
  return param;
}

function* genError(message) {
  throw new Error(message);
}

function* genNoOps() {
  let result = yield null;
  expect(result).toBe(null);
  result = yield 1;
  expect(result).toBe(1);
  const obj = { foo: "bar" };
  result = yield obj;
  expect(result).toBe(obj);
}

function* genSpawn() {
  const task = yield spawn(genIdentity, "result");
  const result = yield join(task);
  expect(result).toEqual("result");
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

function* genChannelBasic() {
  const chan = yield createChannel();
  const task = yield spawn(genChannelBasicChild, chan);
  let value = yield wait(chan);
  expect(value).toEqual(1234);
  value = yield wait(chan);
  expect(value).toEqual(5678);
}

function* genChannelBasicChild(chan) {
  chan.notify(1234);
  chan.notify(5678);
}

function* genSemaphoreDecrementImmediate() {
  const sem = yield call(Semaphore.create, 2);
  expect(sem.value()).toBe(2);
  yield call([sem, "decrement"], 1);
  expect(sem.value()).toBe(1);
  yield call([sem, "decrement"], 1);
  expect(sem.value()).toBe(0);
}

function* genSemaphoreDecrementAsync() {
  const sem = yield call(Semaphore.create, 0);
  yield spawn(genSemaphoreDecrementAsyncChild, sem);
  expect(sem.value()).toBe(0);
  yield call([sem, "decrement"], 1);
  expect(sem.value()).toBe(0);
}

function* genSemaphoreDecrementAsyncChild(sem) {
  sem.increment(1);
}

function* genSemaphoreTryDecrement() {
  const sem = yield call(Semaphore.create, 1);
  let result = yield call([sem, "tryDecrement"], 1);
  expect(result).toBe(true);
  expect(sem.value()).toBe(0);
  result = yield call([sem, "tryDecrement"], 1);
  expect(result).toBe(false);
  expect(sem.value()).toBe(0);
}

function* genSemaphoreWaitForZero() {
  const lock = yield call(Semaphore.create, 0);
  const sem = yield call(Semaphore.create, 1);
  const log = [];
  const tasks = yield all(
    spawn(genSemaphoreWaitForZeroConsumer, lock, sem),
    spawn(genSemaphoreWaitForZeroMonitor, log, lock, sem),
    spawn(genSemaphoreWaitForZeroMonitor, log, lock, sem),
  );
  yield all(tasks.map(t => join(t)));
  // Test sync waiting for zero
  yield call([sem, "waitForZero"]);
  expect(log).toEqual(["got zero", "got zero"]);
}

function* genSemaphoreWaitForZeroConsumer(lock, sem) {
  yield call([lock, "decrement"], 2);
  yield call([sem, "decrement"], 1);
}

function* genSemaphoreWaitForZeroMonitor(log, lock, sem) {
  lock.increment(1);
  yield call([sem, "waitForZero"]);
  log.push("got zero");
}

describe("Runner", () => {
  it("handles no-op effects", () => {
    runGenerator(genNoOps());
  });

  it("handles single spawn/join effects", () => {
    runGenerator(genSpawn());
  });

  it("handles call effects", () => {
    const actual = [];
    runGenerator(genCall(actual));
    expect(actual).toEqual([
      "sync identity",
      "gen identity",
      "Error caught: uh oh",
    ]);
  });

  describe("all", () => {
    it("handles immediately available values", () => {
      runGenerator(genAllImmediate());
    });
    it("handles delayed values", () => {
      runGenerator(genAllDelayed());
    });
    it("allows simple arrays", () => {
      runGenerator(genAllArray());
    });
  });

  describe("race", () => {
    it("handles immediately resolved races", () => {
      runGenerator(genRaceImmediate());
    });
    it("handles delayed races", () => {
      runGenerator(genRaceDelayed());
    });
    it("can be nested", () => {
      runGenerator(genRaceNested());
    });
  });

  describe("Channel", () => {
    it("passes values", () => {
      runGenerator(genChannelBasic());
    });
  });

  describe("Semaphore", () => {
    it("decrements immediately", () => {
      runGenerator(genSemaphoreDecrementImmediate());
    });

    it("decrements asynchronously", () => {
      runGenerator(genSemaphoreDecrementAsync());
    });

    it("decrements without blocking", () => {
      runGenerator(genSemaphoreTryDecrement());
    });

    it("waits for zero", () => {
      runGenerator(genSemaphoreWaitForZero());
    });
  });
});
