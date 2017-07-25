// @flow

import type Runner from "./Runner";

export type WaitListItem = [number, number];

const runnerSymbol = Symbol("Runner");
const valueSymbol = Symbol("Value");
const waitListSymbol = Symbol("WaitList");

export default class Semaphore {
  static create: Symbol;

  decrement: Symbol;
  tryDecrement: Symbol;

  constructor(runner: Runner, initialValue: number) {
    Object.defineProperties(this, {
      [runnerSymbol]: { value: runner },
      [valueSymbol]: { value: initialValue, writable: true },
      [waitListSymbol]: { value: [] },
    });
  }

  value() {
    return getValue(this);
  }

  increment(value: number) {
    increment(this, value);
    getRunner(this)._notifySemaphore(this);
  }
}

Semaphore.create = Symbol("SemaphoreCreate");
Semaphore.prototype.decrement = Symbol("SemaphoreDecrement");
Semaphore.prototype.tryDecrement = Symbol("SemaphoreTryDecrement");

export const getRunner = (s: Semaphore): Runner => (s: any)[runnerSymbol];
export const getValue = (s: Semaphore): number => (s: any)[valueSymbol];
export const getWaitList = (s: Semaphore): Array<WaitListItem> =>
  (s: any)[waitListSymbol];
export const increment = (s: Semaphore, value: number) =>
  ((s: any)[valueSymbol] += value);
export const decrement = (s: Semaphore, value: number) =>
  ((s: any)[valueSymbol] -= value);
