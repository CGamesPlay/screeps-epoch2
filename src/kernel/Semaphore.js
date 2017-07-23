// @flow

import type Runner from "./Runner";

export type WaitListItem = [number, number];

const runnerSymbol = Symbol("Runner");
const valueSymbol = Symbol("Value");
const waitListSymbol = Symbol("WaitList");

export default class Semaphore {
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

export const getRunner = (s: Semaphore): Runner => (s: any)[runnerSymbol];
export const getValue = (s: Semaphore): number => (s: any)[valueSymbol];
export const getWaitList = (s: Semaphore): Array<WaitListItem> =>
  (s: any)[waitListSymbol];
export const increment = (s: Semaphore, value: number) =>
  ((s: any)[valueSymbol] += value);
export const decrement = (s: Semaphore, value: number) =>
  ((s: any)[valueSymbol] -= value);
