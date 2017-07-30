// @flow

import Marshal from "../kernel/Marshal";
import Runner from "../kernel/Runner";

const reserialize = value => {
  var memory = { heap: {}, ref: null };
  var marshal = new Marshal(memory.heap);
  memory.ref = marshal.serialize(value);

  memory = JSON.parse(JSON.stringify(memory));
  marshal = new Marshal(memory.heap);
  const result = marshal.deserialize(memory.ref);
  return result;
};

global.reserialize = reserialize;

const runGenerator = gen => {
  global.runnerFakeTime = 0;
  const runner = new Runner();
  let task = runner.run(gen);
  while (runner.isActive()) {
    global.runnerFakeTime += 1;
    if (global.runnerFakeTime > 100) {
      throw new Error("Timed out after 100 steps");
    }
    runner.step();
  }
  global.runnerFakeTime = void 0;
  if (task.error()) {
    throw task.error();
  } else {
    return task.result();
  }
};

global.runGenerator = runGenerator;
