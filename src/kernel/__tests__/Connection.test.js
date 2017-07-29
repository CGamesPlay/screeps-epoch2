import ProcessManager, { ProcessHandle as Process } from "../ProcessManager";
import Connection from "../Connection";
import Semaphore from "../Semaphore";
import { call, all, race } from "../effects";
import invariant from "../invariant";

function* genBasic() {
  const lock = yield call(Semaphore.create, 0);
  let server = yield call(Process.start, genBasicServer, lock);
  let client = yield call(Process.start, genBasicClient, lock);
  yield race(call([server, "wait"]), call([client, "wait"]));
  if (server.error()) {
    throw server.error();
  } else if (client.error()) {
    throw client.error();
  }
}

function* genBasicServer(lock) {
  let socket = yield call(Connection.listen, "/endpoint");
  lock.increment(1);
  let conn = yield call([socket, "accept"]);
  let input = yield call([conn, "read"]);
  yield call([conn, "write"], input + 1);
  conn.close();
  expect(conn.open()).toBe(false);
}

function* genBasicClient(lock) {
  yield call([lock, "decrement"], 1);
  let conn = yield call(Connection.connect, "/endpoint");
  yield call([conn, "write"], 3);
  let result = yield call([conn, "read"]);
  expect(result).toBe(4);
  conn.close();
}

function* genReuseAddress() {
  let process = yield call(Process.start, genReuseAddressServer);
  let second = yield call(Process.start, genReuseAddressServer);
  yield call([second, "wait"]);
  expect(() => {
    throw second.error();
  }).toThrow("Address already in use");
  process.cancel();
  const lock = yield call(Semaphore.create, 0);
  process = yield call(Process.start, genReuseAddressServer, lock);
  yield call([lock, "decrement"], 1);
  let conn = yield call(Connection.connect, "/reuse");
  yield call([process, "wait"]);
  expect(process.result()).toBe(true);
}

function* genReuseAddressServer(lock) {
  let socket = yield call(Connection.listen, "/reuse");
  if (lock) {
    lock.increment(1);
  }
  let conn = yield call([socket, "accept"]);
  conn.close();
  socket.close();
  return true;
}

const runGenerator = gen => {
  const manager = new ProcessManager();
  const runner = manager.runner;
  const process = manager.startProcess(gen);
  let steps = 0;
  while (runner.isActive() && !process.finished()) {
    steps += 1;
    if (steps > 100) {
      throw new Error("Timed out after 100 steps");
    }
    runner.step();
  }
  invariant(process.finished(), "Process did not finish");
  if (process.error) {
    throw process.error;
  } else {
    return process.result;
  }
};

describe("Connection", () => {
  it("can connect and communicate", () => {
    runGenerator(genBasic());
  });

  it("can reuse addresses", () => {
    runGenerator(genReuseAddress());
  });
});
