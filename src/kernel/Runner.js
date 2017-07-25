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
  call,
  all,
} from "./effects";
import Semaphore, * as semaphores from "./Semaphore";
import invariant from "./invariant";
import type { CallEffect } from "./effects";

export type TaskGenerator<T = any> = Generator<any, any, T>;

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

const SEMAPHORE_DECREMENT = "d";
const SEMAPHORE_ZERO = "z";
type SemaphoreWaitMode = typeof SEMAPHORE_DECREMENT | typeof SEMAPHORE_ZERO;

type WaitHandlePre = {
  taskId?: number,
  channel?: Channel,
  semaphore?: Semaphore,
  mode?: SemaphoreWaitMode,
  result?: any,
};

type WaitHandle = WaitHandlePre & {
  key: string | number,
};

type Task = {
  id: number,
  generator: TaskGenerator<>,
  next: ?["next" | "throw", any],
  state: TaskState,
  error?: Error,
  result?: any,
  /// Semaphore used to indicate that the task has finished.
  semaphore: Semaphore,
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
const valueSymbol = Symbol("Value");
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

const prepareMultiEffect = (value: any) =>
  value && (value.type === ALL || value.type === RACE || Array.isArray(value))
    ? call(yieldEffect, value)
    : value;
const prepareMultiResults = (handles: Array<WaitHandle>, asArray: boolean) =>
  handles.reduce((result: any, handle) => {
    result[handle.key] = handle.result;
    return result;
  }, asArray ? new Array(handles.length) : {});

function* genIdentity(x: any) {
  return x;
}

function* yieldEffect(effect: any) {
  return yield effect;
}

export default class Runner {
  nextId: number;
  tasks: { [key: number]: Task };

  constructor() {
    this.nextId = 1;
    this.tasks = {};
  }

  run(generator: TaskGenerator<>) {
    while (this.tasks[this.nextId]) this.nextId += 1;
    const task: Task = {
      id: this.nextId,
      generator,
      next: taskStart,
      state: RUNNING,
      semaphore: new Semaphore(this, 1),
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
        this._applyDecrement(
          task,
          task.semaphore,
          1,
          false,
          (result, error, wait) => {
            invariant(
              result === true,
              "Internal Error: Task Semaphore not positive",
            );
          },
        );
        delete this.tasks[id];
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

  _notifyChannel(channel: Channel) {
    const id = ((channel: any)[waitListSymbol]: Array<number>).shift();
    if (!id) return;
    const target = this.tasks[id];
    invariant(
      target && target.state === WAITING && channel.buffer.length > 0,
      "Internal error: invalid channel waitList",
    );
    const handle = _.find(target.waitHandles, { channel });
    invariant(handle, "Internal error: invalid waitHandles");
    const value = channel.buffer.shift();
    this._notifyTask(target, handle, null, value);
  }

  _notifySemaphorePositive(semaphore: Semaphore) {
    const waitList = semaphores.getDecrementWaitList(semaphore);
    if (!waitList[0]) return;
    const available = semaphore.value();
    const [id, required] = waitList[0];
    if (!id || required > available) return;
    waitList.shift();
    semaphores.decrement(semaphore, required);
    const target = this.tasks[id];
    invariant(
      target && target.state === WAITING,
      "Internal error: invalid semaphore waitList",
    );
    const handle = _.find(
      target.waitHandles,
      h => h.semaphore === semaphore && h.mode === SEMAPHORE_DECREMENT,
    );
    invariant(handle, "Internal error: invalid waitHandles");
    this._notifyTask(target, handle, null, true);
  }

  _notifySemaphoreZero(semaphore: Semaphore) {
    const waitList = semaphores.getZeroWaitList(semaphore);
    waitList.forEach(id => {
      const target = this.tasks[id];
      invariant(
        target && target.state === WAITING,
        "Internal error: invalid semaphore waitList",
      );
      const handle = _.find(
        target.waitHandles,
        h => h.semaphore === semaphore && h.mode === SEMAPHORE_ZERO,
      );
      invariant(handle, "Internal error: invalid waitHandles");
      if (handle.taskId) {
        const finishedTask = this.tasks[handle.taskId];
        invariant(finishedTask, "Internal error: invalid WaitHandle taskId");
        this._notifyTask(
          target,
          handle,
          finishedTask.error,
          finishedTask.result,
        );
      } else {
        this._notifyTask(target, handle, null, true);
      }
    });
  }

  _notifyTask(task: Task, handle: WaitHandle, error: ?Error, result: any) {
    if (error) {
      taskThrow(task, error);
      if (task.waitHandles && task.waitHandles.length > 1) {
        this._cancelWaits(task, task.waitHandles);
        delete task.waitHandles;
      }
    } else if (task.waitMode === SINGLE) {
      taskNext(task, result);
      delete task.waitHandles;
    } else if (task.waitMode === ALL_ARRAY || task.waitMode === ALL_OBJECT) {
      handle.result = result;
      const handles = task.waitHandles;
      invariant(handles, "Internal error: invalid waitHandles");
      if (handles.every(h => "result" in h)) {
        taskNext(
          task,
          prepareMultiResults(handles, task.waitMode === ALL_ARRAY),
        );
      }
    } else if (task.waitMode === RACE_ARRAY || task.waitMode === RACE_OBJECT) {
      handle.result = result;
      const handles = task.waitHandles;
      invariant(handles, "Internal error: invalid waitHandles");
      this._cancelWaits(task, handles);
      delete task.waitHandles;
      taskNext(
        task,
        prepareMultiResults(handles, task.waitMode === RACE_ARRAY),
      );
    } else {
      throw new Error("Internal error: invalid waitMode");
    }
  }

  _cancelWaits(task: Task, handles: Array<WaitHandle>) {
    handles.forEach(handle => {
      if (handle.channel) {
        const waitList = ((handle.channel: any)[waitListSymbol]: Array<number>);
        _.remove(waitList, id => id === task.id);
      } else if (handle.semaphore) {
        if (handle.mode === SEMAPHORE_DECREMENT) {
          const waitList = semaphores.getDecrementWaitList(handle.semaphore);
          _.remove(waitList, x => x[0] === task.id);
        } else {
          const waitList = semaphores.getZeroWaitList(handle.semaphore);
          _.remove(waitList, x => x === task.id);
        }
      }
    });
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
    } else if (value.type === RACE) {
      this._applyRace(task, value, cb);
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
      const semaphore = target.semaphore;
      semaphores.getZeroWaitList(semaphore).push(task.id);
      return cb(null, null, {
        semaphore,
        mode: SEMAPHORE_ZERO,
        taskId: target.id,
      });
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
    // $FlowFixMe: 0.51.0 doesn't support typeof symbol
    if (typeof func === "symbol") {
      return this._applyCallBuiltin(task, func, value.context, value.args, cb);
    } else if (typeof func !== "function") {
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

  _applyCallBuiltin(
    task: Task,
    func: Symbol,
    context: any,
    args: Array<any>,
    cb: EffectResultCallback,
  ) {
    if (func === Semaphore.create) {
      return this._applyCreateSemaphore(task, args[0], cb);
    } else if (func === Semaphore.prototype.decrement) {
      return this._applyDecrement(task, context, args[0], true, cb);
    } else if (func === Semaphore.prototype.tryDecrement) {
      return this._applyDecrement(task, context, args[0], false, cb);
    } else if (func === Semaphore.prototype.waitForZero) {
      return this._applyWaitForZero(task, context, cb);
    } else {
      return cb(
        null,
        new Error(`Symbol is not a valid kernel call: ${func.toString()}`),
      );
    }
  }

  _applyCreateSemaphore(task: Task, value: number, cb: EffectResultCallback) {
    if (typeof value !== "number" || value < 0) {
      return cb(null, new Error("Value must be a nonnegative number"));
    } else {
      return cb(new Semaphore(this, value));
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

  _applyDecrement(
    task: Task,
    semaphore: Semaphore,
    value: number,
    blocking: boolean,
    cb: EffectResultCallback,
  ) {
    if (!(semaphore instanceof Semaphore)) {
      return cb(null, new Error("Invalid semaphore"));
    } else if (semaphores.getRunner(semaphore) !== this) {
      return cb(null, new Error("Semaphore is from different Runner"));
    } else if (typeof value !== "number" || value <= 0) {
      return cb(null, new Error("Value must be a positive number"));
    }
    if (semaphore.value() >= value) {
      semaphores.decrement(semaphore, value);
      return cb(true);
    } else if (blocking) {
      semaphores.getDecrementWaitList(semaphore).push([task.id, value]);
      return cb(null, null, { semaphore, mode: SEMAPHORE_DECREMENT });
    } else {
      return cb(false);
    }
  }

  _applyWaitForZero(
    task: Task,
    semaphore: Semaphore,
    cb: EffectResultCallback,
  ) {
    if (!(semaphore instanceof Semaphore)) {
      return cb(null, new Error("Invalid semaphore"));
    } else if (semaphores.getRunner(semaphore) !== this) {
      return cb(null, new Error("Semaphore is from different Runner"));
    }
    if (semaphore.value() === 0) {
      return cb(true);
    } else {
      semaphores.getZeroWaitList(semaphore).push(task.id);
      return cb(null, null, { semaphore, mode: SEMAPHORE_ZERO });
    }
  }

  _applyAll(task: Task, { values }: any, cb: EffectResultCallback) {
    let aborted = false,
      immediate = true,
      handles = [];
    const asArray = Array.isArray(values);
    _.forEach(values, (value, key) => {
      value = prepareMultiEffect(value);
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
      return !aborted;
    });
    if (aborted) {
      this._cancelWaits(task, handles);
      return;
    } else if (immediate) {
      cb(prepareMultiResults(handles, asArray));
    } else {
      taskWait(task, asArray ? ALL_ARRAY : ALL_OBJECT, handles);
    }
  }

  _applyRace(task: Task, { values }: any, cb: EffectResultCallback) {
    let aborted = false,
      resolved = false,
      handles = [];
    const asArray = Array.isArray(values);
    _.forEach(values, (value, key) => {
      value = prepareMultiEffect(value);
      this._applyEffect(task, value, (next, error, wait) => {
        if (error) {
          aborted = true;
          cb(null, error);
        } else if (wait) {
          handles.push(Object.assign(({ key }: any), wait));
        } else {
          resolved = true;
          handles.push({ key, result: next });
        }
      });
      return !aborted && !resolved;
    });
    if (resolved) {
      this._cancelWaits(task, handles);
      if (!aborted) {
        cb(prepareMultiResults(handles, asArray));
      }
    } else {
      taskWait(task, asArray ? RACE_ARRAY : RACE_OBJECT, handles);
    }
  }
}
