function* main() {
  let counter = 0;
  while (true) {
    console.log("Code has been running for", counter, "ticks");
    yield null;
    counter += 1;
  }
}

exports.loop = function () {
  var thread;
  if (Memory.thread) {
    try {
      thread = regeneratorRuntime.deserializeGenerator(Memory.thread);
    } finally {
      delete Memory.thread;
    }
  } else {
    thread = main();
  }
  let result = thread.next();
  if (!result.done) {
    Memory.thread = regeneratorRuntime.serializeGenerator(thread);
  }
};
