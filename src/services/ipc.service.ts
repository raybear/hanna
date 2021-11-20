import { EventEmitter } from 'events';

import {Message} from '../models/message.model';

/**
 * Interprocess communication (IPC) is a set of programming interfaces that allow a programmer to coordinate
 * activities among different Hanna processes that can run concurrently in an operating system.
 * This allows a program to handle many user requests at the same time. Since even a single user request may result
 * in multiple processes running in the operating system on the user's behalf, the processes need to communicate
 * with each other. The IPC interfaces make this possible.
 */
export class IpcService extends EventEmitter {
  constructor() { super() }

  /**
   * Start the IPC service listeners.
   * Currently this will only listen for messages from a parent process.
   */
  public start(): void {
    process.on('message', (message: Message) => {
      if (typeof message !== 'object' || !message.id) return;
      this.emit(message.id, message.data);
    })
  }

  /**
   * Send a message to connected IPC clients.
   * Currently this will only send messages if Hanna was launched as a child_process.fork()
   * from another Node.js process (such as 'hanna' service).
   */
  public sendMessage(id: number | symbol | string, data: unknown): void {
    if(process.send) process.send({id, data})
  }
}
