// @flow

import type { Task } from "./Runner";

export const SPAWN = Symbol("Spawn");
export const JOIN = Symbol("Join");
export const CALL = Symbol("Call");

export type CallEffect = {
  type: any,
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

export const spawn = (...args: Array<any>) => createCallEffect(args, SPAWN);
export const join = (task: Task) => ({ type: JOIN, task });
export const call = (...args: Array<any>) => createCallEffect(args, CALL);
