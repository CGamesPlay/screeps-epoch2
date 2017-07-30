// @flow

import type { RunQueue, Task, TaskGenerator } from "./Runner";
import type Semaphore from "./Semaphore";

import Runner, { TaskHandle } from "./Runner";
import invariant from "./invariant";
import { spawn, join } from "./effects";
import Marshal from "./Marshal";

const processSymbol = Symbol("Id");
const getProcess = (handle: ProcessHandle): Process =>
  (handle: any)[processSymbol];

function* genIdentity(value) {
  return value;
}

export class ProcessHandle {
  static start(...args: Array<any>): ProcessHandle {
    let context, func;
    if (Array.isArray(args[0])) {
      [context, func] = args[0];
    } else {
      func = args[0];
    }
    args = args.slice(1);
    let result = func.apply(context, args);
    if (!result || typeof result.next !== "function") {
      result = genIdentity(result);
    }
    const process = ProcessManager.current.startProcess(result, func.name);
    return new ProcessHandle(process);
  }

  static current(): ProcessHandle {
    const process = ProcessManager.current.currentProcess;
    invariant(process, "Internal Error: no current process");
    return new ProcessHandle(process);
  }

  constructor(process: Process) {
    Object.defineProperties(this, {
      [processSymbol]: { value: process },
    });
  }

  id(): number {
    return getProcess(this).id;
  }

  name(): string {
    return getProcess(this).name;
  }

  finished(): boolean {
    return getProcess(this).finished();
  }

  result(): any {
    return getProcess(this).result;
  }

  error(): any {
    return getProcess(this).error;
  }

  *wait(): TaskGenerator<> {
    const task = getProcess(this).tasks[0];
    if (!task) return true;
    const handle = new TaskHandle(ProcessManager.current.runner, task);
    try {
      yield join(handle);
    } catch (err) {}
    return true;
  }

  cancel() {
    getProcess(this).cancelTasks();
  }
}

Marshal.registerType(
  ProcessHandle,
  (h: ProcessHandle) => ({ p: getProcess(h) }),
  data => new ProcessHandle(data.p),
);

class Process {
  id: number;
  name: string;
  result: any;
  error: ?Error;
  mainTask: Task;
  tasks: Array<Task>;
  ownedSemaphores: Array<Semaphore>;

  static serialize(p: Process) {
    return {
      i: p.id,
      n: p.name,
      r: p.result,
      e: p.error,
      m: p.mainTask,
      t: p.tasks,
      s: p.ownedSemaphores,
    };
  }

  static deserialize(data): Process {
    return Object.assign(Object.create(Process.prototype), {
      id: data.i,
      name: data.n,
      result: data.r,
      error: data.e,
      mainTask: data.m,
      tasks: data.t,
      ownedSemaphores: data.s,
    });
  }

  constructor(id: number, name: string) {
    this.id = id;
    this.name = name;
    this.result = this.error = void 0;
    this.tasks = [];
    this.ownedSemaphores = [];
  }

  addTask(task: Task) {
    if (this.tasks.length === 0) {
      this.mainTask = task;
    }
    this.tasks.push(task);
  }

  taskDidFinish(task: Task, result: any, error: ?Error) {
    if (this.mainTask === task) {
      this.error = error;
      this.result = result;
      this.cancelTasks();
    }
    _.remove(this.tasks, task);
    if (this.finished()) {
      this.ownedSemaphores.forEach(s => s.destroy());
      this.ownedSemaphores = [];
    }
  }

  finished(): boolean {
    return this.tasks.length === 0;
  }

  destroyOnExit(sem: Semaphore) {
    this.ownedSemaphores.push(sem);
  }

  cancelTasks() {
    this.tasks.forEach(t => ProcessManager.current.runner.cancel(t));
  }
}

Marshal.registerType(Process);

export default class ProcessManager implements RunQueue {
  static current: ProcessManager;

  static serialize(m: ProcessManager) {
    return {
      i: m.nextId,
      p: _.values(m.processes),
      q: m.queue,
      r: m.runner,
    };
  }

  static deserialize(data) {
    return Object.assign(Object.create(ProcessManager.prototype), {
      nextId: data.i,
      processes: data.p.reduce((list, p) => {
        list[p.id] = p;
        return list;
      }, {}),
      runner: data.r,
      queue: data.q,
      taskMap: data.p.reduce((list, p) => {
        p.tasks.forEach(t => (list[t.id] = p.id));
        return list;
      }, {}),
    });
  }

  currentProcess: ?Process;
  nextId: number;
  processes: { [key: number]: Process };
  queue: Array<Task>;
  runner: Runner;
  taskMap: { [key: number]: number };

  constructor() {
    this.nextId = 1;
    this.processes = {};
    this.runner = new Runner(this);
    this.queue = [];
    this.taskMap = {};
  }

  startProcess(generator: TaskGenerator<>, name: string): Process {
    while (this.processes[this.nextId]) this.nextId += 1;
    const parent = this.currentProcess;
    const process = (this.processes[this.nextId] = new Process(
      this.nextId,
      name,
    ));
    this._enterProcess(process);
    this.runner.run(generator);
    this._enterProcess(parent);
    return process;
  }

  schedule(task: Task) {
    this.queue.push(task);
  }

  getNext(): ?Task {
    const task = this.queue.shift();
    if (!task) return null;
    const process = this.processes[this.taskMap[task.id]];
    invariant(process, "Internal Error: task does not belong to any process");
    this._enterProcess(process);
    return task;
  }

  shouldInterrupt(task: Task): boolean {
    return false;
  }

  taskDidStart(task: Task) {
    const process = this.currentProcess;
    invariant(process, "Internal Error: no current process");
    process.addTask(task);
    this.taskMap[task.id] = process.id;
  }

  taskDidFinish(task: Task, result: any, error: ?Error) {
    const process = this.currentProcess;
    invariant(process, "Internal Error: no current process");
    delete this.taskMap[task.id];
    process.taskDidFinish(task, result, error);
    if (process.finished()) {
      delete this.processes[process.id];
    }
  }

  _enterProcess(process: ?Process) {
    ProcessManager.current = this;
    this.currentProcess = process;
  }
}

Marshal.registerType(ProcessManager);
