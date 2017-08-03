// @flow

import type { TaskGenerator } from "../kernel";
import { defer } from "../kernel";

export default function* delay(ticks: number): TaskGenerator<true> {
  while (ticks > 0) {
    yield defer();
    --ticks;
  }
  return true;
}
