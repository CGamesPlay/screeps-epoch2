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
  const runner = new Runner();
  var steps = 0;
  let task = runner.run(gen);
  while (runner.isActive()) {
    steps += 1;
    if (steps > 100) {
      throw new Error("Timed out after 100 steps");
    }
    runner.step();
  }
  if (task.error()) {
    throw task.error();
  } else {
    return task.result();
  }
};

global.runGenerator = runGenerator;
