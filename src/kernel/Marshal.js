// @flow

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

function createProxy(ctor, name, id, data) {
  var target = Object.assign(
    Object.create(ctor.prototype),
    { inspect: void 0, toString: () => `[${name} ${id} (missing)]` },
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
const deserializeRoomObject = data => {
  let found = Game.getObjectById(data.id);
  if (found) {
    return found;
  } else {
    return createProxy(RoomObject, "RoomObject", data.id, data);
  }
};

const serializeRoom = room => ({ name: room.name });
const deserializeRoom = data => {
  let found = Game.rooms[data.name];
  if (found) {
    return found;
  } else {
    return createProxy(Room, "Room", data.name, data);
  }
};

const serializeRoomPosition = pos => ({
  pos: pos.roomName + _.padLeft(pos.x, 2, "0") + _.padLeft(pos.y, 2, "0"),
});
const deserializeRoomPosition = data => {
  let room = data.pos.slice(0, -4),
    x = data.pos.slice(-4, -2),
    y = data.pos.slice(-2);
  return new RoomPosition(x, y, room);
};

export default class Marshal {
  heapCounter: number;
  heap: Object;
  liveHeap: Object;
  knownConstructors: { [key: string]: KnownConstructor };

  constructor(heap: Object) {
    this.heapCounter = 0;
    this.heap = heap;
    if (heap.version && heap.version != 1) {
      throw new Error("Heap has invalid version");
    }
    heap.version = 1;

    this.liveHeap = {};
    this.knownConstructors = {};
    this._registerStandardTypes();
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

  registerType(
    ctor: Class<any>,
    name: string,
    serialize: (x: any) => any,
    deserialize: (x: any) => any,
  ) {
    if (name in this.knownConstructors) {
      throw new Error(
        `Duplicate constructors registered for ${JSON.stringify(name)}`,
      );
    }
    this.knownConstructors[name] = { ctor, serialize, deserialize };
  }

  _registerStandardTypes() {
    this.registerType(
      Generator,
      "@gen",
      regeneratorRuntime.serializeGenerator,
      regeneratorRuntime.deserializeGenerator,
    );

    this.registerType(
      RoomObject,
      "@o",
      serializeRoomObject,
      deserializeRoomObject,
    );

    this.registerType(Room, "@r", serializeRoom, deserializeRoom);

    this.registerType(
      RoomPosition,
      "@p",
      serializeRoomPosition,
      deserializeRoomPosition,
    );
  }

  serializeReference(object: Object): any {
    let heapTag = object[HEAP_TAG_SYMBOL];
    if (heapTag) {
      if (this.liveHeap[heapTag] !== object) {
        throw new Error("Object has been serialized to another heap");
      }
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
      this.heap[heapTag] = this.serializeObject(object);
    }
    return { [HEAP_REF_SYMBOL]: heapTag };
  }

  deserializeReference(ref: any): any {
    var pointer = ref[HEAP_REF_SYMBOL];
    if (typeof pointer !== "number") {
      throw new Error(`Invalid reference: ${JSON.stringify(ref)}`);
    }
    var object = this.liveHeap[pointer];
    if (object) return object;
    var data = this.heap[pointer];
    delete this.heap[pointer];
    if (!data) throw new Error("Invalid heap ref " + pointer);
    return (this.liveHeap[pointer] = this.deserializeObject(data));
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
        for (let k in this.knownConstructors) {
          if (
            object instanceof this.knownConstructors[k].ctor &&
            (!ctor || this.knownConstructors[k].prototype instanceof ctor.ctor)
          ) {
            name = k;
            ctor = this.knownConstructors[name];
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

  deserializeObject(data: any): any {
    if (Array.isArray(data)) {
      return this.deserializeArray(data);
    } else {
      var name = data[CONSTRUCTOR_SYMBOL],
        ctor: any = Object;
      if (name) {
        ctor = this.knownConstructors[name];
        if (!ctor) {
          throw new Error(
            `Invalid object constructor: ${JSON.stringify(name)}`,
          );
        }
        data = Object.assign({}, data);
        delete data[CONSTRUCTOR_SYMBOL];
      }

      try {
        var result = {};
        for (var k in data) {
          result[k] = this.deserialize(data[k]);
        }
        if (ctor.deserialize) {
          return ctor.deserialize(result);
        } else {
          return result;
        }
      } catch (err) {
        if (name) {
          throw extendError(err, `(while serializing ${name})`);
        } else {
          throw err;
        }
      }
    }
  }

  serializeArray(arr: Array<any>) {
    return arr.map(v => this.serialize(v));
  }

  deserializeArray(arr: Array<any>) {
    return arr.map(v => this.deserialize(v));
  }
}

if (typeof RoomObject !== "undefined") {
}
