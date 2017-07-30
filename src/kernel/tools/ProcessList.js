// @flow

import ProcessManager from "../ProcessManager";

const dump = (): string => {
  const manager = ProcessManager.current;
  let any = false;
  let result = "ID Name Tasks\n";
  _.forEach(manager.processes, p => {
    any = true;
    result += `${p.id} ${p.name} ${p.tasks.length}\n`;
  });
  if (!any) {
    result += "No active processes\n";
  }
  return result;
};

export default { dump };
