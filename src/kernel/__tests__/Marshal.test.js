import Marshal, { isAvailable } from "../Marshal";

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

  it("garbage collects", () => {
    var rawMemory = JSON.stringify(null);
    const withMarshal = (cb, stats) => {
      let memory = JSON.parse(rawMemory);
      let marshal = new Marshal(memory);
      cb(marshal.getRoot(), marshal);
      rawMemory = JSON.stringify(marshal.serialize());
    };

    withMarshal((root, marshal) => {
      root.value = {};
      root.value.a = { a: "a", nested: { nested: [1, 2] } };
      root.value.b = { b: "b" };
      expect(marshal.stats).toEqual({ live: 1, frozen: 0 });
    });

    withMarshal((root, marshal) => {
      expect(marshal.stats).toEqual({ live: 0, frozen: 6 });
      delete root.value.b;
    });

    withMarshal((root, marshal) => {
      expect(root.value.a).toEqual({ a: "a", nested: { nested: [1, 2] } });
      expect(marshal.stats).toEqual({ live: 5, frozen: 0 });
      root.value.a.nested = root.value.a;
    });

    withMarshal((root, marshal) => {
      expect(marshal.stats).toEqual({ live: 0, frozen: 3 });
    });

    withMarshal((root, marshal) => {
      expect(root.value.a).toBe(root.value.a.nested);
      expect(marshal.stats).toEqual({ live: 3, frozen: 0 });

      delete root.value;
      root.shallow = { foo: true };
      root.unused = { deep: root.shallow };
    });

    withMarshal((root, marshal) => {
      expect(root.shallow).toEqual({ foo: true });
      expect(marshal.stats).toEqual({ live: 2, frozen: 1 });
    });

    withMarshal((root, marshal) => {
      expect(marshal.stats).toEqual({ live: 0, frozen: 3 });
      expect(root.shallow).toBe(root.unused.deep);
    });
  });

  it("creates missing object references", () => {
    let base = Object.assign(Object.create(Creep.prototype), {
      id: "1234",
    });
    let value = reserialize(base);
    expect(isAvailable(value)).toBe(false);
    expect(value).toBeInstanceOf(Creep);
  });
});
