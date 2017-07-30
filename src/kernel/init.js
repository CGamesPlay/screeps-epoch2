// @flow

import Marshal from "./Marshal";
import ProcessManager from "./ProcessManager";
import invariant from "./invariant";
import * as tools from "./tools";
import main from "../main";

export const loop = () => {
  let marshal: ?Marshal, manager: ?ProcessManager, mainProcess;
  try {
    Memory.heap = Memory.heap || {};
    marshal = new Marshal(Memory.heap);
    if (Memory.manager) {
      manager = marshal.deserialize(Memory.manager);
      mainProcess = marshal.deserialize(Memory.mainProcess);
    }

    if (!manager) {
      console.log("System booting");
      manager = new ProcessManager();
      mainProcess = manager.startProcess(main(), "main");
      Memory.heap = {};
      marshal = new Marshal(Memory.heap);
    }

    manager.runner.step();
    ProcessManager.current = manager;
    console.log(tools.ProcessList.dump());

    invariant(mainProcess, "Main process crashed");
    if (mainProcess.error) {
      console.log("Main process crashed");
      throw mainProcess.error;
    }

    Memory.mainProcess = marshal.serialize(mainProcess);
    Memory.manager = marshal.serialize(manager);
    Memory.heap = marshal.heap;
  } catch (err) {
    delete Memory.mainProcess;
    delete Memory.manager;
    delete Memory.heap;
    throw err;
  }
};
