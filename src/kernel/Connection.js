// @flow

import Pipe from "./Pipe";
import ProcessManager from "./ProcessManager";
import invariant from "./invariant";
import { call } from "./effects";
import type { TaskGenerator } from "./Runner";

class ConnectionManager {
  static instance: ConnectionManager;

  endpoints: { [key: string]: Socket };

  constructor() {
    this.endpoints = {};
  }
}

ConnectionManager.instance = new ConnectionManager();

export class Socket {
  address: string;
  incoming: Pipe<Connection>;

  constructor(address: string, incoming: Pipe<Connection>) {
    this.address = address;
    this.incoming = incoming;
  }

  *accept(): TaskGenerator<Connection> {
    const connection: Connection = yield call([this.incoming, "read"]);
    connection._write.closeOnExit();
    return connection;
  }

  close() {
    const manager = ConnectionManager.instance;
    delete manager.endpoints[this.address];
    this.incoming.close();
  }
}

export default class Connection {
  static *listen(address) {
    const incoming = yield call(Pipe.create);
    const socket = new Socket(address, incoming);
    const manager = ConnectionManager.instance;
    if (
      manager.endpoints[address] &&
      manager.endpoints[address].incoming.open()
    ) {
      throw new Error("Address already in use");
    }
    manager.endpoints[address] = socket;
    incoming.closeOnExit();
    return socket;
  }

  static *connect(address) {
    const manager = ConnectionManager.instance;
    const socket = manager.endpoints[address];
    if (!socket || !socket.incoming.open()) {
      throw new Error("Connection refused");
    }
    const read = yield call(Pipe.create);
    const write = yield call(Pipe.create);
    write.closeOnExit();
    const local = new Connection(read, write);

    const remote = new Connection(write, read);
    yield call([socket.incoming, "write"], remote);

    return local;
  }

  _read: Pipe<any>;
  _write: Pipe<any>;

  constructor(read: Pipe<any>, write: Pipe<any>) {
    this._read = read;
    this._write = write;
  }

  *read(): TaskGenerator<> {
    return yield call([this._read, "read"]);
  }

  *write(value: any): TaskGenerator<> {
    yield call([this._write, "write"], value);
  }

  open(): boolean {
    return this._read.open() && this._write.open();
  }

  close() {
    this._write.close();
    this._read.close();
  }
}
