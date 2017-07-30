// @flow

import Marshal from "./Marshal";
import ProcessManager from "./ProcessManager";
import main from "../main";

export const loop = () => {
  let marshal: ?Marshal, manager: ?ProcessManager;
  try {
    Memory.heap = Memory.heap || {};
    marshal = new Marshal(Memory.heap);
    if (Memory.manager) {
      manager = marshal.deserialize(Memory.manager);
    }
  } finally {
    delete Memory.heap;
    delete Memory.manager;
  }

  if (!manager) {
    manager = new ProcessManager();
    manager.startProcess(main());
  }

  manager.runner.step();
  Memory.manager = marshal.serialize(manager);
  Memory.heap = marshal.heap;
};
