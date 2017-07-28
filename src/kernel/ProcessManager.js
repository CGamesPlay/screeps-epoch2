// @flow

import type { RunQueue, Task, TaskGenerator } from "./Runner";

import Runner from "./Runner";
import invariant from "./invariant";
import { spawn, join } from "./effects";

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
    const process = ProcessManager.current.startProcess(result);
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
    try {
      yield join(task);
    } catch (err) {}
    return true;
  }
}

class Process {
  id: number;
  result: any;
  error: ?Error;
  tasks: Array<Task>;

  constructor(id: number) {
    this.id = id;
    this.tasks = [];
  }

  addTask(task: Task) {
    this.tasks.push(task);
  }

  taskDidFinish(task: Task, result: any, error: ?Error) {
    if (this.tasks[0] === task) {
      this.error = error;
      this.result = result;
      this._cancelTasks();
    }
    _.remove(this.tasks, task);
  }

  finished(): boolean {
    return this.tasks.length === 0;
  }

  _cancelTasks() {
    this.tasks.forEach(t => ProcessManager.current.runner.cancel(t));
  }
}

export default class ProcessManager implements RunQueue {
  static current: ProcessManager;

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

  startProcess(generator: TaskGenerator<>): Process {
    while (this.processes[this.nextId]) this.nextId += 1;
    const parent = this.currentProcess;
    const process = (this.processes[this.nextId] = new Process(this.nextId));
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
    process.taskDidFinish(task, result, error);
    if (process.finished()) {
      // Clean up anything needed
      delete this.processes[process.id];
    }
  }

  _enterProcess(process: ?Process) {
    ProcessManager.current = this;
    this.currentProcess = process;
  }
}
