// @flow

import type { TaskHandle as Task } from "./Runner";
import type Semaphore from "./Semaphore";

export const DEFER = Symbol("Defer");
export const SPAWN = Symbol("Spawn");
export const JOIN = Symbol("Join");
export const CALL = Symbol("Call");
export const ALL = Symbol("All");
export const RACE = Symbol("Race");

export type Effect = {
  type: typeof SPAWN | typeof JOIN | typeof CALL | typeof ALL | typeof RACE,
};

export type MultiEffect = Array<Effect | { [key: string]: Effect }>;

export type CallEffect = Effect & {
  context?: any,
  func: Function | string,
  args: Array<any>,
};

const createCallEffect = (args: Array<any>, type: any): CallEffect => {
  let context, func;
  if (Array.isArray(args[0])) {
    [context, func] = args[0];
  } else {
    func = args[0];
  }
  args = args.slice(1);
  return { type, context, func, args };
};

const createMultiEffect = (args: MultiEffect, type: any) => {
  if (
    args.length == 1 &&
    (Array.isArray(args[0]) || typeof args[0] === "object")
  ) {
    return { type, values: args[0] };
  } else {
    return { type, values: args };
  }
};

export const defer = (): Effect => ({ type: DEFER });
export const spawn = (...args: Array<any>): Effect =>
  createCallEffect(args, SPAWN);
export const join = (task: Task): Effect => ({ type: JOIN, task });
export const call = (...args: Array<any>): Effect =>
  createCallEffect(args, CALL);
export const all = (...args: MultiEffect): Effect =>
  createMultiEffect(args, ALL);
export const race = (...args: MultiEffect): Effect =>
  createMultiEffect(args, RACE);
