// @flow

import invariant from "./invariant";

const HEAP_TAG_SYMBOL = Symbol("MarshalHeapTag");
const HEAP_REF_SYMBOL = "@@mhr";
const CONSTRUCTOR_SYMBOL = "@@mc";
const MISSING_OBJECT_SYMBOL = Symbol("IsMissingObject");

const Generator = (function*() {})().constructor;

const extendError = (err, message) => {
  return Object.assign(new Error(), err, {
    message: `${err.message}\n  ${message}`,
    stack: err.stack,
  });
};

type KnownConstructor = {
  ctor: Class<any>,
  serialize?: (x: any) => any,
  deserialize?: (x: any) => any,
};

function makeHeapRef(ctor: Class<any>, deserialize: () => any) {
  invariant(ctor, "No constructor specified");
  let reentrant = false,
    done = false,
    underlying = Object.create(ctor.prototype);
  const ensureDeserialized = () => {
    if (done) return;
    invariant(!reentrant, "Deserialization triggered infinite loop");
    reentrant = true;
    const result = deserialize();
    if (Object.getPrototypeOf(result) !== ctor.prototype) {
      Object.setPrototypeOf(underlying, Object.getPrototypeOf(result));
    }
    Object.getOwnPropertyNames(result)
      .concat(Object.getOwnPropertySymbols(result))
      .forEach(prop => {
        Object.defineProperty(
          underlying,
          prop,
          Object.getOwnPropertyDescriptor(result, prop),
        );
      });
    done = true;
    reentrant = false;
  };
  const handler = {};
  Reflect.ownKeys(Reflect).forEach(
    method =>
      (handler[method] = (a, b, c, d) => {
        ensureDeserialized();
        return (Reflect: any)[method](a, b, c, d);
      }),
  );
  return new Proxy(underlying, handler);
}

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
    if (name in Marshal.knownConstructors) {
      throw new Error(
        `Duplicate constructors registered for ${JSON.stringify(name)}`,
      );
    }
    Marshal.knownConstructors[name] = { ctor, serialize, deserialize };
  }

  heapCounter: number;
  heap: Object;
  liveHeap: Object;

  constructor(heap: Object) {
    this.heapCounter = 0;
    this.heap = heap;
    if (heap.version && heap.version != 1) {
      throw new Error("Heap has invalid version");
    }
    heap.version = 1;

    this.liveHeap = {};
  }

  serialize(value: any): any {
    if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      typeof value === "string" ||
      typeof value === "undefined" ||
      value === null
    ) {
      return value;
    } else if (typeof value === "object") {
      return this.serializeReference(value);
    } else if (typeof value === "function") {
      return void 0;
    } else {
      throw new Error("Unable to serialize " + typeof value);
    }
  }

  deserialize(value: any): any {
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

  serializeReference(object: Object): any {
    let heapTag = object[HEAP_TAG_SYMBOL];
    if ((HEAP_TAG_SYMBOL: any) in object) {
      invariant(
        !(heapTag in this.liveHeap) || this.liveHeap[heapTag] === object,
        "Object has been serialized to another heap",
      );
    } else {
      while (this.liveHeap[this.heapCounter] || this.heap[this.heapCounter]) {
        this.heapCounter += 1;
      }
      heapTag = this.heapCounter;
      this.heapCounter += 1;
      Object.defineProperty(object, HEAP_TAG_SYMBOL, {
        value: heapTag,
        enumerable: false,
      });
      this.liveHeap[heapTag] = object;
    }
    if (!this.heap[heapTag]) {
      // Assign a placeholder so that recursive objects don't blow the stack
      this.heap[heapTag] = {};
      this.heap[heapTag] = this.serializeObject(object);
    }
    return { [HEAP_REF_SYMBOL]: heapTag };
  }

  deserializeReference(ref: any): any {
    var heapTag = ref[HEAP_REF_SYMBOL];
    if (typeof heapTag !== "number") {
      throw new Error(`Invalid reference: ${JSON.stringify(ref)}`);
    }
    var object = this.liveHeap[heapTag];
    if (!object) {
      var data = this.heap[heapTag];
      delete this.heap[heapTag];
      if (!data) throw new Error("Invalid heap ref " + heapTag);
      object = this.liveHeap[heapTag] = this.deserializeObject(heapTag, data);
    }
    return object;
  }

  serializeObject(object: Object) {
    if (Array.isArray(object)) {
      return this.serializeArray(object);
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
        if (!ctor) {
          throw new Error(
            `Constructor ${object.constructor.name} is not registered`,
          );
        }
      }

      try {
        if (ctor && ctor.serialize) {
          object = ctor.serialize(object);
        }
        serialized = {};
        Object.getOwnPropertyNames(object).forEach(k => {
          serialized[k] = this.serialize(object[k]);
        });
      } catch (err) {
        if (name) {
          throw extendError(err, `(while serializing ${name})`);
        } else {
          throw err;
        }
      }

      // Constructor may be overridden, for example by the missing object
      // serializer.
      return Object.assign({ [CONSTRUCTOR_SYMBOL]: name }, serialized);
    }
  }

  deserializeObject(tag: number, data: any): any {
    if (Array.isArray(data)) {
      return this.deserializeArray(data);
    } else {
      var name = data[CONSTRUCTOR_SYMBOL],
        ctor: any = {};
      if (name) {
        ctor = Marshal.knownConstructors[name];
        if (!ctor) {
          throw new Error(
            `Invalid object constructor: ${JSON.stringify(name)}`,
          );
        }
        data = Object.assign({}, data);
        delete data[CONSTRUCTOR_SYMBOL];
      }

      return makeHeapRef(ctor.ctor || Object, () => {
        try {
          var result = {};
          for (var k in data) {
            result[k] = this.deserialize(data[k]);
          }
          if (ctor.deserialize) {
            result = ctor.deserialize(result);
          }
          Object.defineProperty(result, HEAP_TAG_SYMBOL, {
            value: tag,
            enumerable: false,
          });
          return result;
        } catch (err) {
          if (name) {
            throw extendError(err, `(while deserializing ${name})`);
          } else {
            throw err;
          }
        }
      });
    }
  }

  serializeArray(arr: Array<any>) {
    return arr.map(v => this.serialize(v));
  }

  deserializeArray(arr: Array<any>) {
    return arr.map(v => this.deserialize(v));
  }
}

Marshal.knownConstructors = {};

Marshal.registerType(
  Generator,
  regeneratorRuntime.serializeGenerator,
  regeneratorRuntime.deserializeGenerator,
  "@gen",
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
        throw new Error(`${name} ${id} is not available (${prop})`);
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
