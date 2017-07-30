// @flow

import _ from "lodash";

import { DEFER, SPAWN, JOIN, CALL, RACE, ALL, call, all } from "./effects";
import Semaphore, * as semaphores from "./Semaphore";
import invariant from "./invariant";
import type { Effect, CallEffect } from "./effects";
import Marshal from "./Marshal";

export type TaskGenerator<T = any> = Generator<Effect, any, T>;

const RUNNING = "r";
const WAITING = "w";
const DONE = "d";
type TaskState = typeof RUNNING | typeof WAITING | typeof DONE;

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
  defer?: boolean,
  taskId?: number,
  semaphore?: Semaphore,
  mode?: SemaphoreWaitMode,
  /// Indicates that canceling this wait should additionally cancel the
  /// underlying task.
  cancelTask?: boolean,
  result?: any,
};

type WaitHandle = WaitHandlePre & {
  key: string | number,
};

export type Task = {
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

export class TaskHandle {
  constructor(runner: Runner, task: Task) {
    Object.defineProperties(this, {
      [runnerSymbol]: { value: runner },
      [taskSymbol]: { value: task },
    });
  }

  cancel() {
    const task = ((this: any)[taskSymbol]: Task);
    return ((this: any)[runnerSymbol]: Runner).cancel(task);
  }

  error(): ?Error {
    return ((this: any)[taskSymbol]: Task).error;
  }

  result(): any {
    return ((this: any)[taskSymbol]: Task).result;
  }
}

Marshal.registerType(
  TaskHandle,
  (h: any) => ({ r: h[runnerSymbol], t: h[taskSymbol] }),
  data => new TaskHandle(data.r, data.t),
);

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

export interface RunQueue {
  schedule(t: Task): void,
  getNext(): ?Task,
  shouldInterrupt(t: Task): boolean,
  taskDidStart(t: Task): void,
  taskDidFinish(t: Task, r: any, e: ?Error): void,
}

class BasicRunQueue {
  queue: Array<Task>;

  static serialize(q: BasicRunQueue) {
    return { q: q.queue };
  }

  static deserialize(data) {
    return Object.assign(Object.create(BasicRunQueue.prototype), {
      queue: data.q,
    });
  }

  constructor() {
    this.queue = [];
  }

  schedule(task: Task) {
    this.queue.push(task);
  }

  getNext(): ?Task {
    return this.queue.shift();
  }

  shouldInterrupt(task: Task): boolean {
    return false;
  }

  taskDidStart(task: Task) {}
  taskDidFinish(task: Task, result: any, error: ?Error) {}
}

Marshal.registerType(BasicRunQueue);

function* genIdentity(x: any) {
  return x;
}

function* yieldEffect(effect: any) {
  return yield effect;
}

export default class Runner {
  static serialize(r: Runner) {
    return { i: r.nextId, t: r.tasks, q: r.queue, d: r.deferred };
  }

  static deserialize(data: any): Runner {
    return Object.assign(Object.create(Runner.prototype), {
      nextId: data.i,
      tasks: data.t,
      queue: data.q,
      deferred: data.d,
    });
  }

  nextId: number;
  queue: RunQueue;
  deferred: Array<number>;
  tasks: { [key: number]: Task };

  constructor(queue: ?RunQueue) {
    this.nextId = 1;
    this.queue = queue || new BasicRunQueue();
    this.deferred = [];
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
    this.queue.taskDidStart(task);
    this.queue.schedule(task);
    return this._getTaskHandle(task);
  }

  cancel(task: Task) {
    if (task.state === DONE) return;
    const schedule = task.state !== RUNNING;
    const error = new Error("Task has been canceled");
    taskThrow(task, error);
    if (task.waitHandles) {
      this._cancelWaits(task, task.waitHandles);
      delete task.waitHandles;
    }
    if (schedule) {
      this.queue.schedule(task);
    }
  }

  isActive() {
    return _.any(this.tasks);
  }

  step() {
    _.forEach(this.deferred, id => this._notifyDeferred(this.tasks[id]));
    this.deferred = [];
    var task;
    while ((task = this.queue.getNext())) {
      invariant(
        task.state === RUNNING,
        "Internal error: task should not be scheduled",
      );
      this._stepTask(task);
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
        delete this.tasks[task.id];
      }
    }
  }

  _getTaskHandle(task: Task): TaskHandle {
    return new TaskHandle(this, task);
  }

  _stepTask(task: Task): boolean {
    var progressed = false;
    while (!this.queue.shouldInterrupt(task)) {
      let done,
        value,
        next = task.next;
      if (!next || task.state !== RUNNING) break;
      progressed = true;
      try {
        let [method, param] = next;
        task.next = void 0;
        ({ done, value } = (task.generator: any)[method](param));
      } catch (error) {
        Object.assign(task, { state: DONE, error });
        this.queue.taskDidFinish(task, void 0, error);
        break;
      }
      if (done) {
        Object.assign(task, { state: DONE, result: value });
        this.queue.taskDidFinish(task, value);
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
    if (task.state === RUNNING) {
      this.queue.schedule(task);
    }
    return progressed;
  }

  _notifyDeferred(task: Task) {
    const handle = _.find(task.waitHandles, h => h.defer);
    invariant(handle, "Internal error: invalid waitHandles");
    this._notifyTask(task, handle, null, true);
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
    waitList.splice(0, waitList.length);
  }

  _notifySemaphoreDestroyed(semaphore: Semaphore) {
    const waitList = semaphores
      .getZeroWaitList(semaphore)
      .concat(semaphores.getDecrementWaitList(semaphore).map(x => x[0]));
    waitList.forEach(id => {
      const target = this.tasks[id];
      invariant(
        target && target.state === WAITING,
        "Internal error: invalid semaphore waitList",
      );
      const handle = _.find(target.waitHandles, h => h.semaphore === semaphore);
      invariant(handle, "Internal error: invalid waitHandles");
      this._notifyTask(
        target,
        handle,
        new Error(semaphores.destroyedMessage),
        null,
      );
    });
  }

  _notifyTask(task: Task, handle: WaitHandle, error: ?Error, result: any) {
    if (error) {
      taskThrow(task, error);
      if (task.waitHandles) {
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
    if (task.state === RUNNING) {
      this.queue.schedule(task);
    }
  }

  _cancelWaits(task: Task, handles: Array<WaitHandle>) {
    handles.forEach(handle => {
      if (handle.semaphore) {
        if (handle.mode === SEMAPHORE_DECREMENT) {
          const waitList = semaphores.getDecrementWaitList(handle.semaphore);
          _.remove(waitList, x => x[0] === task.id);
        } else {
          const waitList = semaphores.getZeroWaitList(handle.semaphore);
          _.remove(waitList, x => x === task.id);
        }
      }
      if (handle.taskId && handle.cancelTask) {
        const dependent = this.tasks[handle.taskId];
        invariant(dependent, "Internal error: invalid WaitHandle taskId");
        if (dependent.state !== DONE) {
          this.cancel(dependent);
        }
      }
      if (handle.defer) {
        _.remove(this.deferred, x => x === task.id);
      }
    });
  }

  _applyEffect(task: Task, value: any, cb: EffectResultCallback) {
    if (Array.isArray(value)) {
      value = (all(value): any);
    }
    if (!value) {
      cb(value);
    } else if (value.type === DEFER) {
      this._applyDefer(task, cb);
    } else if (value.type === SPAWN) {
      this._applySpawn(task, value, cb);
    } else if (value.type === JOIN) {
      this._applyJoin(task, value, null, cb);
    } else if (value.type === CALL) {
      this._applyCall(task, value, cb);
    } else if (value.type === ALL) {
      this._applyAll(task, value, cb);
    } else if (value.type === RACE) {
      this._applyRace(task, value, cb);
    } else {
      cb(value);
    }
  }

  _applyDefer(task: Task, cb: EffectResultCallback) {
    this.deferred.push(task.id);
    cb(null, null, { defer: true });
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
    } else {
      result = this.run(genIdentity(result));
    }
    return cb(result);
  }

  _applyJoin(
    task: Task,
    { task: target }: any,
    waitExtra: ?Object,
    cb: EffectResultCallback,
  ) {
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
      return cb(
        null,
        null,
        Object.assign(
          { semaphore, mode: SEMAPHORE_ZERO, taskId: target.id },
          waitExtra,
        ),
      );
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
      return this._applyJoin(task, { task: result }, { cancelTask: true }, cb);
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
    if (!semaphore.active()) {
      return cb(null, new Error(semaphores.destroyedMessage));
    } else if (semaphore.value() >= value) {
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

Marshal.registerType(Runner);
