import { expect } from "chai";
import Marshal from "../Marshal";

function* genDelegation(recurse) {
  yield 1;
  if (recurse) {
    yield* genDelegation(false);
  }
  yield 2;
}

function* genReferencesInner(param) {
  param.str += " inner1";
  yield param;
  param.str += " inner2";
  yield null;
  return param;
}

function* genReferences() {
  var param = { str: "" };
  const result = yield* genReferencesInner(param);
  expect(result).to.equal(param);
  expect(param.str).to.equal(" inner1 inner2");
}

function reserialize(value) {
  var memory = { heap: {}, ref: null };
  var marshal = new Marshal(memory.heap);
  memory.ref = marshal.serialize(value);

  memory = JSON.parse(JSON.stringify(memory));
  marshal = new Marshal(memory.heap);
  const result = marshal.deserialize(memory.ref);
  return result;
}

describe("Marshal", () => {
  it("serializes simple values", () => {
    let value = "this is a test";
    expect(value).to.equal(reserialize(value));
  });

  it("serializes arrays", () => {
    let value = [1, 2, 3, 4];
    expect(value).to.deep.equal(reserialize(value));
  });

  it("serializes references", () => {
    let referenced = { foo: true };
    let value = { a: referenced, b: referenced };
    let restored = reserialize(value);
    expect(restored.a).to.equal(restored.b);
  });

  it("serializes generators", () => {
    let thread = genDelegation(true);
    thread = reserialize(thread);
    expect(thread.next()).to.deep.equal({ value: 1, done: false });
    thread = reserialize(thread);
    expect(thread.next()).to.deep.equal({ value: 1, done: false });
    thread = reserialize(thread);
    expect(thread.next()).to.deep.equal({ value: 2, done: false });
    thread = reserialize(thread);
    expect(thread.next()).to.deep.equal({ value: 2, done: false });
    thread = reserialize(thread);
    expect(thread.next()).to.deep.equal({ value: undefined, done: true });
  });

  it("shares references", () => {
    let thread = genReferences();
    for (var i = 0; i < 100; i++) {
      let obj = thread.next();
      if (obj.done) break;
      thread = reserialize(thread);
    }
  });
});
