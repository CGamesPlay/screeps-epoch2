// @flow

import type { TaskGenerator } from "./Runner";
import Semaphore from "./Semaphore";
import invariant from "./invariant";
import { all, call } from "./effects";

export const BLOCK = "b";
export const KEEP_NEWEST = "n";
export const KEEP_OLDEST = "o";

type OverflowMode = typeof BLOCK | typeof KEEP_NEWEST | typeof KEEP_OLDEST;

const pipeClosedMessage = "Pipe has been closed";

export default class Pipe<T> {
  static *create(bufferSize: ?number = 1, overflowMode: OverflowMode = BLOCK) {
    let [empty, read] = yield all(
      call(Semaphore.create, bufferSize),
      call(Semaphore.create, 0),
    );
    return new Pipe(overflowMode, empty, read);
  }

  buffer: Array<T>;
  overflowMode: string;
  empty: Semaphore;
  ready: Semaphore;

  constructor(overflowMode: OverflowMode, empty: Semaphore, read: Semaphore) {
    this.overflowMode = overflowMode;
    this.buffer = [];
    this.empty = empty;
    this.ready = read;
  }

  *write(value: any): TaskGenerator<> {
    if (!this.empty.active()) {
      throw new Error(pipeClosedMessage);
    }
    let hasEmpty = yield call(
      [this.empty, this.overflowMode === BLOCK ? "decrement" : "tryDecrement"],
      1,
    );
    if (hasEmpty) {
      this.buffer.push(value);
      this.ready.increment(1);
      return true;
    } else if (this.overflowMode == KEEP_NEWEST) {
      this.buffer.shift();
      this.buffer.push(value);
      return false;
    } else {
      // Drop the value
      return false;
    }
  }

  *read(): TaskGenerator<T> {
    if (!this.ready.active()) {
      throw new Error(pipeClosedMessage);
    }
    yield call([this.ready, "decrement"], 1);
    let value = this.buffer.shift();
    if (this.open()) {
      this.empty.increment(1);
    } else if (!this.hasData()) {
      this.ready.destroy();
    }
    return value;
  }

  hasData(): boolean {
    return this.ready.active() && this.ready.value() > 0;
  }

  open(): boolean {
    return this.empty.active();
  }

  close() {
    this.empty.destroy();
    if (!this.hasData()) {
      this.ready.destroy();
    }
  }

  closeOnExit() {
    this.empty.destroyOnExit();
  }
}
