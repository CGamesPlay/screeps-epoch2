// @flow

import _ from "lodash";

import {
  SPAWN,
  JOIN,
  CALL,
  CREATE_CHANNEL,
  WAIT,
  RACE,
  ALL,
  all,
} from "./effects";
import type { CallEffect } from "./effects";

type Saga = Generator<any, void, any>;

const RUNNING = "r";
const WAITING = "w";
const CANCELING = "c";
const DONE = "d";
type TaskState =
  | typeof RUNNING
  | typeof WAITING
  | typeof CANCELING
  | typeof DONE;

const SINGLE = "s";
const ALL_ARRAY = "aa";
const ALL_OBJECT = "ao";
const RACE_ARRAY = "ra";
const RACE_OBJECT = "ro";
type WaitMode =
  | typeof SINGLE
  | typeof ALL_ARRAY
  | typeof ALL_OBJECT
  | typeof RACE_ARRAY
  | typeof RACE_OBJECT;

type WaitHandlePre = {
  taskId?: number,
  channel?: Channel,
  result?: any,
};

type WaitHandle = WaitHandlePre & {
  key: string | number,
};

type Task = {
  id: number,
  generator: Saga,
  next: ?["next" | "throw", any],
  state: TaskState,
  error?: Error,
  result?: any,
  /// The IDs of all tasks that are currently joining this one.
  joinedIds: Array<number>,
  waitHandles?: Array<WaitHandle>,
  waitMode?: WaitMode,
};

type EffectResultCallback = (
  next: any,
  error: ?Error,
  wait: ?WaitHandlePre,
) => void;

const taskStart = ["next", void 0];
const runnerSymbol = Symbol("Runner");
const taskSymbol = Symbol("Task");
const waitListSymbol = Symbol("WaitList");

class TaskHandle {
  constructor(runner: Runner, task: Task) {
    Object.defineProperties(this, {
      [runnerSymbol]: { value: runner },
      [taskSymbol]: { value: task },
    });
  }

  error(): ?Error {
    return ((this: any)[taskSymbol]: Task).error;
  }

  result(): any {
    return ((this: any)[taskSymbol]: Task).result;
  }
}

export { TaskHandle as Task };

export class Channel {
  buffer: Array<any>;

  constructor(runner: Runner) {
    Object.defineProperties(this, {
      [runnerSymbol]: { value: runner },
      [waitListSymbol]: { value: [] },
    });
    this.buffer = [];
  }

  notify(value: any) {
    this.buffer.push(value);
    ((this: any)[runnerSymbol]: Runner)._notifyChannel(this);
  }
}

const taskNext = (task: Task, value: any) =>
  Object.assign(task, { state: RUNNING, next: ["next", value] });
const taskThrow = (task: Task, error: Error) =>
  Object.assign(task, { state: RUNNING, next: ["throw", error] });
const taskWait = (
  task: Task,
  waitMode: WaitMode,
  waitHandles: Array<WaitHandle>,
) => Object.assign(task, { state: WAITING, waitHandles, waitMode });

function* genIdentity(x: any) {
  return x;
}

const notifyTask = (
  task: Task,
  handle: WaitHandle,
  error: ?Error,
  result: any,
) => {
  if (error) {
    taskThrow(task, error);
    if (task.waitHandles && task.waitHandles.length > 1) {
      throw new Error("Clear all other joins");
    }
  } else if (task.waitMode === SINGLE) {
    taskNext(task, result);
  } else if (task.waitMode === ALL_ARRAY || task.waitMode === ALL_OBJECT) {
    handle.result = result;
    const handles = task.waitHandles;
    if (!handles) {
      throw new Error("Invalid waitHandles");
    } else if (handles.every(h => "result" in h)) {
      result = handles.reduce((result: any, h) => {
        result[h.key] = h.result;
        return result;
      }, task.waitMode === ALL_ARRAY ? [] : {});
      taskNext(task, result);
    }
  } else {
    throw new Error("Invalid waitMode");
  }
};

export default class Runner {
  nextId: number;
  tasks: { [key: number]: Task };

  constructor() {
    this.nextId = 1;
    this.tasks = {};
  }

  run(generator: Saga) {
    while (this.tasks[this.nextId]) this.nextId += 1;
    const task: Task = {
      id: this.nextId,
      generator,
      next: taskStart,
      state: RUNNING,
      joinedIds: [],
    };
    this.nextId += 1;
    this.tasks[task.id] = task;
    return this._getTaskHandle(task);
  }

  isActive() {
    return _.any(this.tasks);
  }

  step() {
    var progressed = false;
    _.forOwn(this.tasks, (task: Task, id: number) => {
      if (this._stepTask(task)) {
        progressed = true;
      }
      if (task.state === DONE) {
        delete this.tasks[id];
        this._notifyJoin(task);
      }
    });
    return progressed;
  }

  _getTaskHandle(task: Task): TaskHandle {
    return new TaskHandle(this, task);
  }

  _stepTask(task: Task): boolean {
    var progressed = false;
    while (true) {
      let done,
        value,
        next = task.next;
      if (!next || task.state !== RUNNING) break;
      progressed = true;
      try {
        let [method, param] = next;
        task.next = void 0;
        ({ done, value } = (task.generator: any)[method](param));
      } catch (err) {
        Object.assign(task, { state: DONE, error: err });
      }
      if (done) {
        Object.assign(task, { state: DONE, result: value });
      } else {
        this._applyEffect(task, value, (next, error, wait) => {
          if (error) {
            taskThrow(task, error);
          } else if (wait) {
            taskWait(task, SINGLE, [(wait: any)]);
          } else {
            taskNext(task, next);
          }
        });
      }
    }
    return progressed;
  }

  _notifyJoin(joined: Task) {
    joined.joinedIds.forEach((id: number) => {
      const target = this.tasks[id];
      if (!target || target.state !== WAITING) {
        throw new Error("Internal error: invalid joinedIds");
      }
      const handle = _.find(target.waitHandles, { taskId: joined.id });
      if (!handle) {
        throw new Error("Internal error: invalid join");
      }
      notifyTask(target, handle, joined.error, joined.result);
    });
  }

  _notifyChannel(channel: Channel) {
    const id = ((channel: any)[waitListSymbol]: Array<number>).shift();
    if (!id) return;
    const target = this.tasks[id];
    if (!target || target.state !== WAITING || channel.buffer.length === 0) {
      throw new Error("Internal error: invalid channel waitList");
    }
    const handle = _.find(target.waitHandles, { channel: channel });
    if (!handle) {
      throw new Error("Internal error: invalid wait");
    }
    const value = channel.buffer.shift();
    notifyTask(target, handle, null, value);
  }

  _applyEffect(task: Task, value: any, cb: EffectResultCallback) {
    if (Array.isArray(value)) {
      value = (all(value): any);
    }
    if (!value) {
      cb(value);
    } else if (value.type === SPAWN) {
      this._applySpawn(task, value, cb);
    } else if (value.type === JOIN) {
      this._applyJoin(task, value, cb);
    } else if (value.type === CALL) {
      this._applyCall(task, value, cb);
    } else if (value.type === CREATE_CHANNEL) {
      this._applyCreateChannel(task, value, cb);
    } else if (value.type === WAIT) {
      this._applyWait(task, value, cb);
    } else if (value.type === ALL) {
      this._applyAll(task, value, cb);
    } else {
      cb(value);
    }
  }

  _applySpawn(task: Task, value: CallEffect, cb: EffectResultCallback) {
    var func = value.func,
      result;
    if (typeof func === "string") {
      if (!value.context) {
        return cb(null, new Error("String function provided with no context"));
      } else {
        func = value.context[func];
      }
    }
    if (typeof func !== "function") {
      return cb(null, new Error("Provided function is not callable"));
    }
    try {
      result = func.apply(value.context, value.args);
    } catch (err) {
      return cb(null, err);
    }
    if (result && typeof result.next === "function") {
      result = this.run(result);
    } else {
      result = this.run(genIdentity(result));
    }
    return cb(result);
  }

  _applyJoin(task: Task, { task: target }: any, cb: EffectResultCallback) {
    if (!(target instanceof TaskHandle)) {
      return cb(null, new Error("Invalid join target"));
    } else if (target[runnerSymbol] !== this) {
      return cb(null, new Error("Join target is from different Runner"));
    }
    target = (target[taskSymbol]: Task);
    if (target.error) {
      return cb(null, target.error);
    } else if (target.result) {
      return cb(target.result);
    } else {
      target.joinedIds.push(task.id);
      return cb(null, null, { taskId: target.id });
    }
  }

  _applyCall(task: Task, value: CallEffect, cb: EffectResultCallback) {
    var func = value.func,
      result;
    if (typeof func === "string") {
      if (!value.context) {
        return cb(null, new Error("String function provided with no context"));
      } else {
        func = value.context[func];
      }
    }
    if (typeof func !== "function") {
      return cb(null, new Error("Provided function is not callable"));
    }
    try {
      result = func.apply(value.context, value.args);
    } catch (err) {
      return cb(null, err);
    }
    if (result && typeof result.next === "function") {
      result = this.run(result);
      return this._applyJoin(task, { task: result }, cb);
    } else {
      return cb(result);
    }
  }

  _applyCreateChannel(task: Task, value: void, cb: EffectResultCallback) {
    return cb(new Channel(this));
  }

  _applyWait(task: Task, { channel }: any, cb: EffectResultCallback) {
    if (!(channel instanceof Channel)) {
      return cb(null, new Error("Invalid channel"));
    } else if (channel[runnerSymbol] !== this) {
      return cb(null, new Error("Channel is from different Runner"));
    }
    if (channel.buffer.length > 0) {
      let result = channel.buffer.shift();
      return cb(result);
    } else {
      ((channel: any)[waitListSymbol]: Array<number>).push(task.id);
      return cb(null, null, { channel });
    }
  }

  _applyAll(task: Task, { values }: any, cb: EffectResultCallback) {
    let aborted = false,
      immediate = true,
      handles = [];
    const asArray = Array.isArray(values);
    _.forEach(values, (value, key) => {
      if (value && (value.type === ALL || value.type === RACE)) {
        aborted = true;
        cb(null, new Error("Cannot nest all / race"));
      } else {
        this._applyEffect(task, value, (next, error, wait) => {
          if (error) {
            aborted = true;
            cb(null, error);
          } else if (wait) {
            immediate = false;
            handles.push(Object.assign(({ key }: any), wait));
          } else {
            handles.push({ key, result: next });
          }
        });
      }
      return !aborted;
    });
    if (aborted) {
      throw new Error("Need to clean up handles");
      return;
    } else if (immediate) {
      const result = handles.reduce((result: any, handle) => {
        result[handle.key] = handle.result;
        return result;
      }, asArray ? Array(values.length) : {});
      cb(result);
    } else {
      taskWait(task, asArray ? ALL_ARRAY : ALL_OBJECT, handles);
    }
  }
}
