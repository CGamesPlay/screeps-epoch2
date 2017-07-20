// @flow

import _ from "lodash";

import { SPAWN, JOIN, CALL, CREATE_CHANNEL, WAIT } from "./effects";
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

const SINGLE = "single";
const ALL = "all";
const RACE = "race";
type WaitMode = typeof SINGLE | typeof ALL | typeof RACE;

type WaitHandle = {
  taskId?: number,
  channel?: Channel,
  key: string | number,
  result?: any,
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
  } else {
    if (task.waitMode === SINGLE) {
      taskNext(task, result);
    } else {
      handle.result = result;
      throw new Error("Unsupported join mode");
    }
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
      var done,
        value,
        next = task.next;
      if (!next || task.state !== RUNNING) break;
      progressed = true;
      try {
        var [method, param] = next;
        task.next = void 0;
        ({ done, value } = (task.generator: any)[method](param));
      } catch (err) {
        Object.assign(task, { state: DONE, error: err });
      }
      if (done) {
        Object.assign(task, { state: DONE, result: value });
      } else if (value) {
        if (value.type == SPAWN) {
          this._applySpawn(task, value);
        } else if (value.type == JOIN) {
          this._applyJoin(task, value);
        } else if (value.type == CALL) {
          this._applyCall(task, value);
        } else if (value.type == CREATE_CHANNEL) {
          this._applyCreateChannel(task, value);
        } else if (value.type == WAIT) {
          this._applyWait(task, value);
        } else {
          taskNext(task, value);
        }
      } else {
        taskNext(task, value);
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
      const allHandles = target.waitHandles;
      const handleIndex = _.findIndex(allHandles, { taskId: joined.id });
      if (!allHandles || handleIndex === -1) {
        throw new Error("Internal error: invalid join");
      }
      const handle = allHandles[handleIndex];
      notifyTask(target, handle, joined.error, joined.result);
    });
  }

  _notifyChannel(channel: Channel) {
    const id = ((channel: any)[waitListSymbol]: Array<number>).shift();
    const target = this.tasks[id];
    if (!target || target.state !== WAITING || channel.buffer.length === 0) {
      throw new Error("Internal error: invalid channel waitList");
    }
    const allHandles = target.waitHandles;
    const handleIndex = _.findIndex(allHandles, { channel: channel });
    if (!allHandles || handleIndex === -1) {
      throw new Error("Internal error: invalid join");
    }
    const handle = allHandles[handleIndex];
    const value = channel.buffer.shift();
    notifyTask(target, handle, null, value);
  }

  _applySpawn(task: Task, value: CallEffect) {
    var func = value.func,
      result;
    if (typeof func === "string") {
      if (!value.context) {
        return taskThrow(
          task,
          new Error("String function provided with no context"),
        );
      } else {
        func = value.context[func];
      }
    }
    if (typeof func !== "function") {
      return taskThrow(task, new Error("Provided function is not callable"));
    }
    try {
      result = func.apply(value.context, value.args);
    } catch (err) {
      return taskThrow(task, err);
    }
    if (result && typeof result.next === "function") {
      result = this.run(result);
    } else {
      result = this.run(genIdentity(result));
    }
    return taskNext(task, result);
  }

  _applyJoin(task: Task, { task: target }: any) {
    if (!(target instanceof TaskHandle)) {
      return taskThrow(task, new Error("Invalid join target"));
    } else if (target[runnerSymbol] !== this) {
      return taskThrow(task, new Error("Join target is from different Runner"));
    }
    target = (target[taskSymbol]: Task);
    if (target.error) {
      return taskThrow(task, target.error);
    } else if (target.result) {
      return taskNext(task, target.result);
    } else {
      Object.assign(task, {
        state: WAITING,
        waitHandles: [{ taskId: target.id, key: 0 }],
        waitMode: SINGLE,
      });
      target.joinedIds.push(task.id);
    }
  }

  _applyCall(task: Task, value: CallEffect) {
    var func = value.func,
      result;
    if (typeof func === "string") {
      if (!value.context) {
        return taskThrow(
          task,
          new Error("String function provided with no context"),
        );
      } else {
        func = value.context[func];
      }
    }
    if (typeof func !== "function") {
      return taskThrow(task, new Error("Provided function is not callable"));
    }
    try {
      result = func.apply(value.context, value.args);
    } catch (err) {
      return taskThrow(task, err);
    }
    if (result && typeof result.next === "function") {
      result = this.run(result);
      return this._applyJoin(task, { task: result });
    } else {
      return taskNext(task, result);
    }
  }

  _applyCreateChannel(task: Task, value: void) {
    return taskNext(task, new Channel(this));
  }

  _applyWait(task: Task, { channel }: any) {
    if (!(channel instanceof Channel)) {
      return taskThrow(task, new Error("Invalid channel"));
    } else if (channel[runnerSymbol] !== this) {
      return taskThrow(task, new Error("Channel is from different Runner"));
    }
    if (channel.buffer.length > 0) {
      let result = channel.buffer.shift();
      return taskNext(task, result);
    } else {
      Object.assign(task, {
        state: WAITING,
        waitHandles: [{ channel: channel, key: 0 }],
        waitMode: SINGLE,
      });
      ((channel: any)[waitListSymbol]: Array<number>).push(task.id);
    }
  }
}
