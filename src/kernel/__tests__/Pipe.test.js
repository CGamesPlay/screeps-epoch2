import Pipe, { KEEP_NEWEST, KEEP_OLDEST } from "../Pipe";
import { spawn, join, call, all, race } from "../effects";

function* genBlocking() {
  let log = [];
  let pipe = yield call(Pipe.create);
  let child = yield spawn(genBlockingChild, log, pipe);
  yield call([pipe, "write"], "one");
  yield call([pipe, "write"], "two");
  log.push("finished writing");
  yield join(child);
  expect(log).toEqual(["read one", "finished writing", "read two"]);
}

function* genBlockingChild(log, pipe) {
  let result = yield call([pipe, "read"]);
  log.push(`read ${result}`);
  result = yield call([pipe, "read"]);
  log.push(`read ${result}`);
}

function* genNewest() {
  let pipe = yield call(Pipe.create, 1, KEEP_NEWEST);
  yield call([pipe, "write"], "one");
  yield call([pipe, "write"], "two");
  let result = yield call([pipe, "read"]);
  expect(result).toBe("two");
}

function* genOldest() {
  let pipe = yield call(Pipe.create, 1, KEEP_OLDEST);
  yield call([pipe, "write"], "one");
  yield call([pipe, "write"], "two");
  let result = yield call([pipe, "read"]);
  expect(result).toBe("one");
}

function* genHasData() {
  let pipe = yield call(Pipe.create);
  expect(pipe.hasData()).toBe(false);
  yield call([pipe, "write"], "one");
  expect(pipe.hasData()).toBe(true);
}

function* genClose() {
  let pipe = yield call(Pipe.create, 2);
  expect(pipe.open()).toBe(true);
  yield call([pipe, "write"], "one");
  yield call([pipe, "write"], "two");
  pipe.close();
  expect(pipe.open()).toBe(false);
  // After closing, writes will fail.
  try {
    yield call([pipe, "write"], "three");
    expect(false).toBe(true);
  } catch (err) {
    expect(err.message).toBe("Pipe has been closed");
  }
  // Reads still succeed while there is buffered data.
  let result = yield call([pipe, "read"]);
  expect(result).toBe("one");
  result = yield call([pipe, "read"]);
  expect(result).toBe("two");
  // Reads fail once buffer is depleted.
  try {
    yield call([pipe, "read"]);
    expect(false).toBe(true);
  } catch (err) {
    expect(err.message).toBe("Pipe has been closed");
  }

  // Both ends are closed immediately when no data is pending.
  pipe = yield call(Pipe.create);
  pipe.close();
  try {
    yield call([pipe, "read"]);
    expect(false).toBe(true);
  } catch (err) {
    expect(err.message).toBe("Pipe has been closed");
  }
}

describe("Pipe", () => {
  it("blocks writes on overflow", () => {
    runGenerator(genBlocking());
  });

  it("discards new items on overflow", () => {
    runGenerator(genNewest());
  });

  it("discards old items on overflow", () => {
    runGenerator(genOldest());
  });

  it("can query available data", () => {
    runGenerator(genHasData());
  });

  it("can be closed", () => {
    runGenerator(genClose());
  });
});
