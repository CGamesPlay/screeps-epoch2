import Runner from "../kernel/Runner";

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
