// @flow

import Marshal from "./Marshal";
import ProcessManager from "./ProcessManager";
import invariant from "./invariant";
import * as tools from "./tools";
import main from "../main";

export const loop = () => {
  let marshal: ?Marshal, manager: ?ProcessManager, mainProcess;
  try {
    marshal = new Marshal(Memory.heap);
    ({ manager, mainProcess } = marshal.getRoot());

    if (!manager) {
      console.log("System booting");
      manager = new ProcessManager();
      mainProcess = manager.startProcess(main(), "main");
    }

    manager.runner.step();

    ProcessManager.current = manager;
    console.log(tools.ProcessList.dump());

    invariant(mainProcess, "Main process crashed");
    if (mainProcess.error) {
      console.log("Main process crashed");
      throw mainProcess.error;
    }

    Object.assign(marshal.getRoot(), { manager, mainProcess });
    Memory.heap = marshal.serialize();
  } catch (err) {
    delete Memory.heap;
    throw err;
  }
};
