// @flow

import ProcessManager from "../ProcessManager";

const dump = (): string => {
  const manager = ProcessManager.current;
  let any = false;
  let result = "ID Name Tasks";
  _.forEach(manager.processes, p => {
    any = true;
    result += `\n${p.id} ${p.name} ${p.tasks.length}`;
  });
  if (!any) {
    result += "\nNo active processes";
  }
  return result;
};

export default { dump };
