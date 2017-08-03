// @flow

import { invariant } from "../kernel";

const errorCodes = {
  [0]: "OK",
  [-1]: "ERR_NOT_OWNER",
  [-2]: "ERR_NO_PATH",
  [-3]: "ERR_NAME_EXISTS",
  [-4]: "ERR_BUSY",
  [-5]: "ERR_NOT_FOUND",
  [-6]: "ERR_NOT_ENOUGH_ENERGY",
  [-6]: "ERR_NOT_ENOUGH_RESOURCES",
  [-7]: "ERR_INVALID_TARGET",
  [-8]: "ERR_FULL",
  [-9]: "ERR_NOT_IN_RANGE",
  [-10]: "ERR_INVALID_ARGS",
  [-11]: "ERR_TIRED",
  [-12]: "ERR_NO_BODYPART",
  [-6]: "ERR_NOT_ENOUGH_EXTENSIONS",
  [-14]: "ERR_RCL_NOT_ENOUGH",
  [-15]: "ERR_GCL_NOT_ENOUGH",
};

export const intentError = (message: string, code: number) => {
  invariant(code in errorCodes, `Invalid error code ${code}`);
  return new Error(`${message} (${errorCodes[code]})`);
};
