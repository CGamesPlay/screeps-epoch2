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
  expect(result).toBe(param);
  expect(param.str).toBe(" inner1 inner2");
}

describe("Marshal", () => {
  it("serializes simple values", () => {
    let value = "this is a test";
    expect(value).toBe(reserialize(value));
  });

  it("serializes arrays", () => {
    let value = [1, 2, 3, 4];
    expect(value).toEqual(reserialize(value));
  });

  it("serializes references", () => {
    let referenced = { foo: true };
    let value = { a: referenced, b: referenced };
    let restored = reserialize(value);
    expect(restored.a).toBe(restored.b);
  });

  it("serializes Errors", () => {
    let value = new Error("Test error");
    let restored = reserialize(value);
    expect(restored).toEqual(value);
    expect(restored.stack).toEqual(value.stack);
  });

  it("serializes generators", () => {
    let thread = genDelegation(true);
    thread = reserialize(thread);
    expect(thread.next()).toEqual({ value: 1, done: false });
    thread = reserialize(thread);
    expect(thread.next()).toEqual({ value: 1, done: false });
    thread = reserialize(thread);
    expect(thread.next()).toEqual({ value: 2, done: false });
    thread = reserialize(thread);
    expect(thread.next()).toEqual({ value: 2, done: false });
    thread = reserialize(thread);
    expect(thread.next()).toEqual({ value: undefined, done: true });
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
