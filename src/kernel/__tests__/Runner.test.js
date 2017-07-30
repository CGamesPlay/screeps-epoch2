import Runner from "../Runner";
import Semaphore from "../Semaphore";
import Pipe from "../Pipe";
import { defer, spawn, join, call, all, race } from "../effects";

const identity = x => x;

function* genDefer() {
  expect.assertions(2);
  const start = runnerFakeTime;
  // Defer causes a step to happen
  yield defer();
  expect(runnerFakeTime).toBe(start + 1);
  // Non-blocking effects do not
  yield null;
  expect(runnerFakeTime).toBe(start + 1);
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

function* genCall(actual) {
  actual.push(yield call(identity, "sync identity"));
}

function* genAllImmediate() {
  const chanA = yield call(Pipe.create, 10),
    chanB = yield call(Pipe.create, 10);
  yield call([chanA, "write"], "valueA");
  yield call([chanB, "write"], "valueB");
  let result = yield all({
    chanA: call([chanA, "read"]),
    chanB: call([chanB, "read"]),
  });
  expect(result).toEqual({ chanA: "valueA", chanB: "valueB" });
  yield call([chanA, "write"], "valueC");
  yield call([chanB, "write"], "valueD");
  result = yield all(call([chanA, "read"]), call([chanB, "read"]));
  expect(result).toEqual(["valueC", "valueD"]);
}

function* genAllDelayed() {
  const lock = yield call(Pipe.create, 10),
    chanA = yield call(Pipe.create, 10),
    chanB = yield call(Pipe.create, 10);
  yield spawn(genAllDelayedChild, lock, chanA, chanB);
  yield call([lock, "write"]);
  let result = yield all({
    chanA: call([chanA, "read"]),
    chanB: call([chanB, "read"]),
  });
  expect(result).toEqual({ chanA: "valueA", chanB: "valueB" });
  yield call([lock, "write"]);
  result = yield all(call([chanA, "read"]), call([chanB, "read"]));
  expect(result).toEqual(["valueC", "valueD"]);
}

function* genAllDelayedChild(lock, chanA, chanB) {
  yield call([lock, "read"]);
  yield call([chanA, "write"], "valueA");
  yield call([chanB, "write"], "valueB");
  yield call([lock, "read"]);
  yield call([chanA, "write"], "valueC");
  yield call([chanB, "write"], "valueD");
}

function* genAllArray() {
  const chanA = yield call(Pipe.create),
    chanB = yield call(Pipe.create, 10);
  yield call([chanA, "write"], "valueA");
  yield call([chanB, "write"], "valueB");
  let result = yield [call([chanA, "read"]), call([chanB, "read"])];
  expect(result).toEqual(["valueA", "valueB"]);
}

function* genRaceImmediate() {
  const chanA = yield call(Pipe.create),
    chanB = yield call(Pipe.create);
  yield call([chanA, "write"], "valueA");
  yield call([chanB, "write"], "valueB");
  let result = yield race({
    chanA: call([chanA, "read"]),
    chanB: call([chanB, "read"]),
  });
  expect(result).toEqual({ chanA: "valueA" });
  result = yield race([call([chanA, "read"]), call([chanB, "read"])]);
  expect(result).toEqual([void 0, "valueB"]);
}

function* genRaceDelayed() {
  const lock = yield call(Pipe.create, 10),
    chanA = yield call(Pipe.create, 10),
    chanB = yield call(Pipe.create, 10);
  yield spawn(genRaceDelayedChild, lock, chanA, chanB);
  yield call([lock, "write"]);
  let result = yield race({
    chanA: call([chanA, "read"]),
    chanB: call([chanB, "read"]),
  });
  expect(result).toEqual({ chanA: "valueA" });
  yield call([lock, "write"]);
  result = yield race(call([chanA, "read"]), call([chanB, "read"]));
  expect(result).toEqual([void 0, "valueB"]);
}

function* genRaceDelayedChild(lock, chanA, chanB) {
  yield call([lock, "read"]);
  yield call([chanA, "write"], "valueA");
  yield call([lock, "read"]);
  yield call([chanB, "write"], "valueB");
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

function* genTaskResult() {
  const lock = yield call(Semaphore.create, 0);
  let task = yield spawn(genTaskResultChild, lock, "async result");
  lock.increment(1);
  let result = yield join(task);
  expect(result).toBe("async result");

  lock.increment(1);
  task = yield spawn(genTaskResultChild, lock, "sync result");
  yield call([lock, "waitForZero"]);
  result = yield join(task);
  expect(result).toBe("sync result");
}

function* genTaskResultChild(lock, result) {
  yield call([lock, "decrement"], 1);
  return result;
}

function* genTaskError() {
  const lock = yield call(Semaphore.create, 0);
  let task = yield spawn(genTaskErrorChild, lock, "async error");
  lock.increment(1);
  try {
    let result = yield join(task);
    expect(false).toBe(true);
  } catch (err) {
    expect(err.message).toBe("async error");
  }
  lock.increment(1);
  task = yield spawn(genTaskErrorChild, lock, "sync error");
  yield call([lock, "waitForZero"]);
  try {
    let result = yield join(task);
    expect(false).toBe(true);
  } catch (err) {
    expect(err.message).toBe("sync error");
  }
}

function* genTaskErrorChild(lock, message) {
  yield call([lock, "decrement"], 1);
  throw new Error(message);
}

function* genTaskCancel() {
  let lock = yield call(Semaphore.create, 0);
  let task = yield spawn(genTaskCancelChild, lock);
  yield call([lock, "decrement"], 1);
  task.cancel();
  lock.increment(1);
  try {
    yield join(task);
    expect(false).toBe(true);
  } catch (err) {
    expect(err.message).toBe("Task has been canceled");
  }
  expect(lock.value()).toBe(1);
}

function* genTaskCancelChild(lock) {
  yield call([lock, "increment"], 1);
  yield call(genTaskCancelChild2, lock);
}

function* genTaskCancelChild2(lock) {
  yield call([lock, "decrement"], 1);
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

function* genSemaphoreDestroy() {
  let sem = yield call(Semaphore.create, 0);
  // Sync
  sem.destroy();
  expect(() => sem.destroy()).not.toThrow();
  try {
    yield call([sem, "decrement"], 1);
    expect(false).toBe(true);
  } catch (err) {
    expect(err.message).toBe("Semaphore has been destroyed");
  }

  // Async
  sem = yield call(Semaphore.create, 0);
  yield spawn(genSemaphoreDestroyChild, sem);
  try {
    yield call([sem, "decrement"], 1);
    expect(false).toBe(true);
  } catch (err) {
    expect(err.message).toBe("Semaphore has been destroyed");
  }
}

function* genSemaphoreDestroyChild(sem) {
  sem.destroy();
}

function* genSemaphoreMarshal() {
  const sem = yield call(Semaphore.create, 0);
  expect(reserialize(sem)).toEqual(sem);
}

describe("Runner", () => {
  describe("defer", () => {
    it("pauses and resumes for one step", () => {
      runGenerator(genDefer());
    });
  });

  it("handles call effects", () => {
    const actual = [];
    runGenerator(genCall(actual));
    expect(actual).toEqual(["sync identity"]);
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

  describe("Task", () => {
    it("returns a result", () => {
      runGenerator(genTaskResult());
    });
    it("throws an error", () => {
      runGenerator(genTaskError());
    });
    it("can be canceled", () => {
      runGenerator(genTaskCancel());
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

    it("can be destroyed", () => {
      runGenerator(genSemaphoreDestroy());
    });

    it("can be marshaled", () => {
      runGenerator(genSemaphoreMarshal());
    });
  });
});
