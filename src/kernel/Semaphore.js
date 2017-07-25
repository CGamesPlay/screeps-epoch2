// @flow

import type Runner from "./Runner";

export type WaitListItem = [number, number];

const runnerSymbol = Symbol("Runner");
const valueSymbol = Symbol("Value");
const decrementWaitListSymbol = Symbol("DecrementWaitList");
const zeroWaitListSymbol = Symbol("ZeroWaitList");

export default class Semaphore {
  static create: Symbol;

  decrement: Symbol;
  tryDecrement: Symbol;
  waitForZero: Symbol;

  constructor(runner: Runner, initialValue: number) {
    Object.defineProperties(this, {
      [runnerSymbol]: { value: runner },
      [valueSymbol]: { value: initialValue, writable: true },
      [decrementWaitListSymbol]: { value: [] },
      [zeroWaitListSymbol]: { value: [] },
    });
  }

  value() {
    return getValue(this);
  }

  increment(value: number) {
    increment(this, value);
    getRunner(this)._notifySemaphorePositive(this);
  }
}

Semaphore.create = Symbol("SemaphoreCreate");
Semaphore.prototype.decrement = Symbol("SemaphoreDecrement");
Semaphore.prototype.tryDecrement = Symbol("SemaphoreTryDecrement");
Semaphore.prototype.waitForZero = Symbol("SemaphoreWaitForZero");

export const getRunner = (s: Semaphore): Runner => (s: any)[runnerSymbol];
export const getValue = (s: Semaphore): number => (s: any)[valueSymbol];
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
