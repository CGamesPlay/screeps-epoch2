import Marshal from "./Marshal";
import main from "../main";

export const loop = () => {
  var marshal, thread;
  try {
    Memory.heap = Memory.heap || {};
    marshal = new Marshal(Memory.heap);
    if (Memory.thread) {
      thread = marshal.deserialize(Memory.thread);
    }
  } finally {
    delete Memory.heap;
    delete Memory.thread;
  }

  if (!thread) {
    thread = main();
  }

  let result = thread.next();
  if (!result.done) {
    Memory.thread = marshal.serialize(thread);
    Memory.heap = marshal.heap;
  }
};
