// @flow

import Marshal from "./Marshal";
import ProcessManager from "./ProcessManager";
import invariant from "./invariant";
import * as tools from "./tools";
import main from "../main";

let loadedAt = Game.time;
(function() {
  let now = Game.cpu.getUsed();
  console.log(`[${Game.time}] Script reload took ${Math.round(now)} ms.`);
  Memory;
  let parseTime = Game.cpu.getUsed() - now;
  console.log(
    `[${Game.time}] Parsing ${Math.round(
      RawMemory.get().length / 1024,
    )} KiB took ${Math.round(parseTime)} ms.`,
  );
})();

export const loop = () => {
  let marshal: ?Marshal, manager: ?ProcessManager, mainProcess;
  try {
    marshal = new Marshal(Memory.heap);
    ({ manager, mainProcess } = marshal.getRoot());

    if (!manager || (mainProcess && mainProcess.finished())) {
      console.log(`[${Game.time}] {bold}System booting.{/}`);
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
    let now = Game.cpu.getUsed();
    Memory.heap = marshal.serialize();
    console.log(
      `[${Game.time}] Serialization took ${Math.round(
        Game.cpu.getUsed() - now,
      )} ms (${JSON.stringify(marshal.stats)}).`,
    );
  } catch (err) {
    delete Memory.heap;
    throw err;
  }
};
