import ProcessManager, { ProcessHandle as Process } from "../ProcessManager";
import Semaphore from "../Semaphore";
import { defer, spawn, join, call, all } from "../effects";
import invariant from "../invariant";

function* genNaming() {
  expect(Process.current().name()).toBe("genNaming");
}

function* genTaskTracking() {
  expect(Process.current().id()).toBe(1);
  let process = yield call(Process.start, genTaskTrackingChild, 2);
  yield defer();
  expect(Process.current().id()).toBe(1);
  expect(process.id()).toBe(2);
  yield call(genTaskTrackingChild, 1);
}

function* genTaskTrackingChild(pid) {
  expect(Process.current().id()).toBe(pid);
}

function* genWaiting() {
  const lock = yield call(Semaphore.create, 1);
  let childA = yield call(Process.start, genWaitingChild, lock, false);
  let childB = yield call(Process.start, genWaitingChild, lock, true);
  yield call([lock, "waitForZero"]);
  for (let i = 0; i < 3; i++) {
    lock.increment(1);
  }
  let [_, resultA, resultB] = yield all(
    call([lock, "waitForZero"]),
    call([childA, "wait"]),
    call([childB, "wait"]),
  );
  expect(resultA).toBe(true);
  expect(childA.finished()).toBe(true);
  expect(childA.result()).toBe("result");
  expect(childA.error()).toBeUndefined();

  expect(resultB).toBe(true);
  expect(childB.finished()).toBe(true);
  expect(childB.result()).toBeUndefined();
  expect(childB.error().message).toBe("error");
}

function* genWaitingChild(lock, error) {
  for (let i = 0; i < 2; i++) {
    yield call([lock, "decrement"], 1);
  }
  if (error) {
    throw new Error("error");
  } else {
    return "result";
  }
}

const runGenerator = gen => {
  const manager = new ProcessManager();
  const process = manager.startProcess(gen(), gen.name);
  let steps = 0;
  while (manager.runner.isActive()) {
    steps += 1;
    if (steps > 100) {
      throw new Error("Timed out after 100 steps");
    }
    manager.runner.step();
  }
  invariant(process.finished(), "Process did not finish");
  if (process.error) {
    throw process.error;
  } else {
    return process.result;
  }
};

describe("ProcessManager", () => {
  it("records the name", () => {
    runGenerator(genNaming);
  });

  it("tracks the process ID of tasks", () => {
    runGenerator(genTaskTracking);
  });

  it("allows waiting on processes", () => {
    runGenerator(genWaiting);
  });

  it("can be serialized", () => {
    expect.assertions(5);
    let manager = new ProcessManager();
    manager.startProcess(genTaskTracking(), genTaskTracking.name);
    manager.runner.step();
    manager = reserialize(manager);
    manager.runner.step();
  });
});
