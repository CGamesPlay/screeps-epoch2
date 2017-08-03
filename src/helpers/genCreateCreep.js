// @flow

import type { TaskGenerator } from "../kernel";
import { invariant, isAvailable, defer, call } from "../kernel";
import delay from "./delay";
import { intentError } from "./errors";

export default function* genCreateCreep(
  spawn: StructureSpawn,
  body: Array<BodyPartType>,
  name: ?string,
  memory: ?Object,
): TaskGenerator<Creep> {
  while (spawn.spawning) {
    yield call(delay, Math.max(spawn.spawning.remainingTime, 1));
  }
  let err = spawn.createCreep(body, name, memory);
  if (typeof err !== "string") {
    throw intentError(`Unable to spawn from ${spawn.id}`, err);
  }
  // XXX - StructureSpawn should set this
  Object.defineProperty(spawn, "spawning", {
    value: { name: err, needTime: 1, remainingTime: 1 },
  });

  let creep = Game.creeps[err];
  yield defer();
  invariant(spawn.spawning, "Spawn isn't spawning");
  yield call(delay, spawn.spawning.remainingTime);
  return creep;
}
