// @flow

import invariant from "./invariant";
import ProcessManager from "./ProcessManager";

import type Runner from "./Runner";

export type WaitListItem = [number, number];

const runnerSymbol = Symbol("Runner");
const valueSymbol = Symbol("Value");
const activeSymbol = Symbol("Active");
const decrementWaitListSymbol = Symbol("DecrementWaitList");
const zeroWaitListSymbol = Symbol("ZeroWaitList");

export const destroyedMessage = "Semaphore has been destroyed";

export default class Semaphore {
  static create: Symbol;

  decrement: Symbol;
  tryDecrement: Symbol;
  waitForZero: Symbol;

  constructor(runner: Runner, initialValue: number) {
    Object.defineProperties(this, {
      [runnerSymbol]: { value: runner },
      [valueSymbol]: { value: initialValue, writable: true },
      [activeSymbol]: { value: true, writable: true },
      [decrementWaitListSymbol]: { value: [] },
      [zeroWaitListSymbol]: { value: [] },
    });
  }

  value(): number {
    invariant(getActive(this), destroyedMessage);
    return getValue(this);
  }

  active(): boolean {
    return getActive(this);
  }

  increment(value: number) {
    invariant(getActive(this), destroyedMessage);
    increment(this, value);
    getRunner(this)._notifySemaphorePositive(this);
  }

  destroy() {
    if (getActive(this)) {
      destroy(this);
      getRunner(this)._notifySemaphoreDestroyed(this);
    }
  }

  destroyOnExit() {
    const process = ProcessManager.current.currentProcess;
    invariant(process, "No current process");
    process.destroyOnExit(this);
  }
}

Semaphore.create = Symbol("SemaphoreCreate");
Semaphore.prototype.decrement = Symbol("SemaphoreDecrement");
Semaphore.prototype.tryDecrement = Symbol("SemaphoreTryDecrement");
Semaphore.prototype.waitForZero = Symbol("SemaphoreWaitForZero");

export const getRunner = (s: Semaphore): Runner => (s: any)[runnerSymbol];
export const getValue = (s: Semaphore): number => (s: any)[valueSymbol];
export const getActive = (s: Semaphore): boolean => (s: any)[activeSymbol];
export const getDecrementWaitList = (s: Semaphore): Array<WaitListItem> =>
  (s: any)[decrementWaitListSymbol];
export const getZeroWaitList = (s: Semaphore): Array<number> =>
  (s: any)[zeroWaitListSymbol];
export const increment = (s: Semaphore, value: number) =>
  ((s: any)[valueSymbol] += value);
export const decrement = (s: Semaphore, value: number) => {
  (s: any)[valueSymbol] -= value;
  if (getValue(s) == 0) {
    getRunner(s)._notifySemaphoreZero(s);
  }
};
export const destroy = (s: Semaphore) => ((s: any)[activeSymbol] = false);
