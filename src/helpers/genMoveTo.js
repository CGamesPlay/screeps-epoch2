// @flow

import type { TaskGenerator } from "../kernel";
import { invariant, defer, call } from "../kernel";
import delay from "./delay";
import { intentError } from "./errors";

export default function* genMoveTo(
  creep: Creep,
  pos: RoomPosition,
  opts: Object,
): TaskGenerator<true> {
  while (creep.pos.getRangeTo(pos) > 1) {
    let err = creep.moveTo(pos, opts);
    if (err === OK || err === ERR_TIRED) {
      yield defer();
    } else {
      throw intentError("Unable to harvest", err);
    }
  }
}
