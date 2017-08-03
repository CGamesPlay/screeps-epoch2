// @flow

import type { TaskGenerator } from "./kernel";
import { Process, defer, call } from "./kernel";
import harvestd from "./harvestd";
import { delay } from "./helpers";

const services = { harvestd };

function* watchdog(service) {
  let process: Process = (null: any);
  while (true) {
    process = yield call(Process.start, services[service]);
    yield call([process, "wait"]);
    if (process.error()) {
      console.log(`Process ${service} crashed: ${process.error().stack}`);
      yield defer();
    } else {
      break;
    }
  }
  return process.result();
}

function* main(): TaskGenerator<> {
  yield call(watchdog, "harvestd");
  yield call(delay, 10000);
}

export default main;
