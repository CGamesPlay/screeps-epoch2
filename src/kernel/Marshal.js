// @flow

import invariant from "./invariant";

const HEAP_REF_SYMBOL = "@@mhr";
const IS_UNLOADED_REF = Symbol("IsUnloadedRef");
const CONSTRUCTOR_SYMBOL = "@@mc";
const MISSING_OBJECT_SYMBOL = Symbol("IsMissingObject");

const Generator = (function*() {})().constructor;

const extendError = (err, message) => {
  return Object.assign(new Error(), err, {
    message: `${err.message}\n  ${message}`,
    stack: err.stack.replace(/\n/, `\n  ${message}\n`),
  });
};

type KnownConstructor = {
  ctor: Class<any>,
  serialize?: (x: any) => any,
  deserialize?: (x: any) => any,
};

type Heap = {
  refs: Map<Object, number>,
  data: Object,
  nextId: number,
};

const emptyHeap = {
  version: 1,
  [0]: {},
};

const makeLazyLoader = (ctor: Class<any>, deserialize: () => any) => {
  invariant(ctor, "No constructor specified");
  let reentrant = false,
    loaded = false,
    underlying = {};
  const ensureDeserialized = () => {
    if (loaded) return;
    invariant(!reentrant, "Deserialization triggered infinite loop");
    try {
      reentrant = true;
      underlying = deserialize();
      loaded = true;
    } finally {
      reentrant = false;
    }
  };
  const handler = {};
  Reflect.ownKeys(Reflect).forEach(
    method =>
      (handler[method] = (a, b, c, d) => {
        if (method === "get" && b === IS_UNLOADED_REF) return !loaded;
        ensureDeserialized();
        return (Reflect: any)[method](underlying, b, c, d);
      }),
  );
  return new Proxy(underlying, handler);
};

export default class Marshal {
  static knownConstructors: { [key: string]: KnownConstructor };

  static registerType<T: any>(
    ctor: Class<T>,
    serialize: ?(x: T) => any,
    deserialize: ?(x: any) => T,
    name: ?string,
  ) {
    invariant(typeof ctor === "function", "Constructor must be provided");
    serialize = serialize || ctor.serialize;
    deserialize = deserialize || ctor.deserialize;
    name = name || ctor.name;
    invariant(
      typeof serialize === "function",
      "Serialize function must be provided",
    );
    invariant(
      typeof deserialize === "function",
      "Deserialize function must be provided",
    );
    invariant(
      !(name in Marshal.knownConstructors),
      `Duplicate constructors registered for ${JSON.stringify(name)}`,
    );
    Marshal.knownConstructors[name] = { ctor, serialize, deserialize };
  }

  heap: Object;
  liveHeap: Object;
  refs: Map<Object, number>;
  stats: { live: number, frozen: number };
  root: any;

  constructor(heap: ?Object) {
    if (!heap) heap = emptyHeap;
    invariant(heap.version === 1, "Heap has invalid version");

    this.heap = Object.freeze(heap);
    this.liveHeap = {};
    this.refs = new Map();
    this.stats = {
      frozen: Reflect.ownKeys(heap).reduce(
        (n, k) => n + (k === "version" ? 0 : 1),
        0,
      ),
      live: 0,
    };
  }

  getRoot() {
    if (!this.root) {
      this.root = this.deserializeValue({ [HEAP_REF_SYMBOL]: 0 });
    }
    return this.root;
  }

  serialize() {
    let heap: Heap = { refs: new Map(), data: { version: 1 }, nextId: 0 };
    let ref = this.serializeValue(this.getRoot(), heap);
    invariant(ref[HEAP_REF_SYMBOL] === 0, "Root object is not ref 0");
    return heap.data;
  }

  serializeValue(value: any, heap: Heap): any {
    if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      typeof value === "string" ||
      typeof value === "undefined" ||
      value === null
    ) {
      return value;
    } else if (typeof value === "object") {
      return this.serializeReference(value, heap);
    } else {
      throw new Error("Unable to serialize " + typeof value);
    }
  }

  deserializeValue(value: any): any {
    if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      typeof value === "string" ||
      typeof value === "undefined" ||
      value === null
    ) {
      return value;
    } else if (typeof value === "object") {
      return this.deserializeReference(value);
    } else {
      throw new Error("Unable to deserialize " + typeof value);
    }
  }

  serializeReference(object: Object, heap: Heap): any {
    let heapTag: ?number = this.refs.get(object);
    if (heap.refs.has(object)) {
      return { [HEAP_REF_SYMBOL]: heap.refs.get(object) };
    } else if (object[IS_UNLOADED_REF] && typeof heapTag === "number") {
      // heapTag is a reachable but unloaded reference, so transfer this entire
      // graph to the new heap. References in the unloaded graph may point to
      // loaded objects, so watch out for that.
      var queue = [heapTag];
      while (queue.length > 0) {
        let targetTag = queue.shift();
        if (targetTag in this.liveHeap && targetTag !== heapTag) {
          this.serializeReference(this.liveHeap[targetTag], heap);
        } else if (!(targetTag in heap.data)) {
          let target = (heap.data[targetTag] = this.heap[targetTag]);
          for (let k of Reflect.ownKeys(target)) {
            if (typeof target[k] === "object" && target[k] !== null) {
              invariant(target[k][HEAP_REF_SYMBOL], "Unexpected heap value");
              queue.push(target[k][HEAP_REF_SYMBOL]);
            }
          }
        }
      }
      return { [HEAP_REF_SYMBOL]: heapTag };
    } else {
      if (typeof heapTag !== "number") {
        while (heap.nextId in this.heap || heap.nextId in heap.data) {
          heap.nextId += 1;
        }
        heapTag = heap.nextId;
      }
      heap.refs.set(object, heapTag);
      heap.data[heapTag] = null;
      heap.data[heapTag] = this.serializeObject(object, heap);
      return { [HEAP_REF_SYMBOL]: heapTag };
    }
  }

  deserializeReference(ref: any): any {
    var heapTag = ref[HEAP_REF_SYMBOL];
    invariant(
      typeof heapTag === "number",
      `Invalid reference: ${JSON.stringify(ref)}`,
    );
    if (!(heapTag in this.liveHeap)) {
      let object = this.deserializeObject(heapTag);
      this.refs.set(object, heapTag);
      this.liveHeap[heapTag] = object;
    }
    return this.liveHeap[heapTag];
  }

  serializeObject(object: Object, heap: Heap) {
    if (Array.isArray(object)) {
      return this.serializeArray(object, heap);
    } else {
      let name, ctor, serialized;
      if (
        Object.getPrototypeOf(object) === null ||
        Object.getPrototypeOf(object).constructor.name === "Object"
      ) {
        // Due to the nature of Screeps operating in multiple VM contexts, we
        // can't compare Object.getPrototypeOf(object) === Object.prototype.
        // We don't need a constructor symbol in this case.
      } else {
        // Find the most specific registered constructor to serialize as.
        for (let k in Marshal.knownConstructors) {
          if (
            object instanceof Marshal.knownConstructors[k].ctor &&
            (!ctor ||
              Marshal.knownConstructors[k].prototype instanceof ctor.ctor)
          ) {
            name = k;
            ctor = Marshal.knownConstructors[name];
          }
        }
        invariant(
          ctor,
          `Constructor ${object.constructor.name} is not registered`,
        );
      }

      let failedKey = null;
      try {
        if (ctor && ctor.serialize) {
          object = ctor.serialize(object);
        }
        serialized = {};
        Object.getOwnPropertyNames(object).forEach(k => {
          failedKey = k;
          serialized[k] = this.serializeValue(object[k], heap);
          failedKey = null;
        });
      } catch (err) {
        if (failedKey) {
          throw extendError(
            err,
            `(while serializing ${name || "Object"}'s ${failedKey})`,
          );
        } else {
          throw extendError(err, `(while serializing ${name || "Object"})`);
        }
      }

      // Constructor may be overridden, for example by the missing object
      // serializer.
      return Object.assign({ [CONSTRUCTOR_SYMBOL]: name }, serialized);
    }
  }

  deserializeObject(heapTag: number): any {
    var data = this.heap[heapTag];
    invariant(data, `Invalid heap ref ${heapTag}`);
    if (Array.isArray(data)) {
      return this.deserializeArray(data);
    } else {
      var name = data[CONSTRUCTOR_SYMBOL],
        ctor: any = {};
      if (name) {
        ctor = Marshal.knownConstructors[name];
        invariant(ctor, `Invalid object constructor: ${JSON.stringify(name)}`);
        data = Object.assign({}, data);
        delete data[CONSTRUCTOR_SYMBOL];
      }

      return makeLazyLoader(ctor.ctor || Object, () => {
        this.stats.frozen -= 1;
        this.stats.live += 1;
        let failedKey = null;
        try {
          var result = {};
          for (var k in data) {
            result[k] = this.deserializeValue(data[k]);
          }
          if (ctor.deserialize) {
            result = ctor.deserialize(result);
          }
          return result;
        } catch (err) {
          if (failedKey) {
            throw extendError(
              err,
              `(while deserializing ${name || "Object"}'s ${failedKey})`,
            );
          } else {
            throw extendError(err, `(while deserializing ${name || "Object"})`);
          }
        }
      });
    }
  }

  serializeArray(arr: Array<any>, heap: Heap) {
    return arr.map(v => this.serializeValue(v, heap));
  }

  deserializeArray(arr: Array<any>) {
    this.stats.frozen -= 1;
    this.stats.live += 1;
    return arr.map(v => this.deserializeValue(v));
  }
}

Marshal.knownConstructors = {};

Marshal.registerType(
  Generator,
  regeneratorRuntime.serializeGenerator,
  regeneratorRuntime.deserializeGenerator,
  "@gen",
);

Marshal.registerType(
  Error,
  (e: Error) => Object.assign(({ message: e.message, stack: e.stack }: any), e),
  (data): Error => Object.assign(Object.create(Error.prototype), data),
);

function createProxy(ctor, name, id, data) {
  var target = Object.assign(
    Object.create(ctor.prototype),
    ({ inspect: void 0, toString: () => `[${name} ${id} (missing)]` }: any),
    data,
  );
  return new Proxy(target, {
    get: function(target, prop) {
      if (prop === MISSING_OBJECT_SYMBOL) {
        return true;
      } else if (prop in target) {
        return target[prop];
      } else {
        throw new Error(
          `${name} ${id} is not available (cannot access ${prop})`,
        );
      }
    },
  });
}

export function isAvailable(obj: any): boolean {
  return !obj[MISSING_OBJECT_SYMBOL];
}

const serializeRoomObject = obj => ({ id: obj.id });
const deserializeRoomObject = data =>
  Game.getObjectById(data.id) ||
  createProxy(RoomObject, "RoomObject", data.id, data);
Marshal.registerType(
  RoomObject,
  serializeRoomObject,
  deserializeRoomObject,
  "@o",
);

const serializeRoom = room => ({ name: room.name });
const deserializeRoom = data =>
  Game.rooms[data.name] || createProxy(Room, "Room", data.name, data);
Marshal.registerType(Room, serializeRoom, deserializeRoom, "@r");

const serializeRoomPosition = pos => ({
  pos: pos.roomName + _.padLeft(pos.x, 2, "0") + _.padLeft(pos.y, 2, "0"),
});
const deserializeRoomPosition = data =>
  new RoomPosition(
    data.pos.slice(-4, -2),
    data.pos.slice(-2),
    data.pos.slice(0, -4),
  );
Marshal.registerType(
  RoomPosition,
  serializeRoomPosition,
  deserializeRoomPosition,
  "@p",
);
