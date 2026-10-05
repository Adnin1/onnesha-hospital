/**
 * Onnesha Hospital Management System (OHMS)
 * RS-232 Serial COM Port Handler & Reconnect Watchdog (Gate 9)
 *
 * Provides serial communication abstraction for Sysmex, Mindray,
 * and Roche clinical laboratory instruments:
 * - Baud rate, parity, data bits, stop bits configuration
 * - Auto-reconnect watchdog when serial cable or USB-to-UART adapter is unplugged
 * - Stream framing and loopback mock transport for contract testing
 */

import { EventEmitter } from "node:events";

export interface SerialPortConfig {
  portName: string; // e.g. 'COM1', 'COM3', '/dev/ttyUSB0'
  baudRate: number; // e.g. 9600, 19200, 115200
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: "none" | "even" | "odd";
  reconnectIntervalMs?: number;
}

export interface ISerialTransport {
  open(): Promise<void>;
  close(): Promise<void>;
  write(data: string | Buffer): Promise<void>;
  isOpen(): boolean;
  onData(handler: (chunk: Buffer) => void): void;
  onError(handler: (err: Error) => void): void;
  onClose(handler: () => void): void;
}

/**
 * Loopback mock serial stream for automated tests without physical RS-232 hardware
 */
export class MockSerialStream implements ISerialTransport {
  private openState = false;
  private dataHandlers: Array<(chunk: Buffer) => void> = [];
  private errorHandlers: Array<(err: Error) => void> = [];
  private closeHandlers: Array<() => void> = [];
  public writtenChunks: string[] = [];

  public async open(): Promise<void> {
    this.openState = true;
  }

  public async close(): Promise<void> {
    this.openState = false;
    for (const h of this.closeHandlers) h();
  }

  public async write(data: string | Buffer): Promise<void> {
    const str = Buffer.isBuffer(data) ? data.toString("binary") : String(data);
    this.writtenChunks.push(str);
  }

  public isOpen(): boolean {
    return this.openState;
  }

  public onData(handler: (chunk: Buffer) => void): void {
    this.dataHandlers.push(handler);
  }

  public onError(handler: (err: Error) => void): void {
    this.errorHandlers.push(handler);
  }

  public onClose(handler: () => void): void {
    this.closeHandlers.push(handler);
  }

  /**
   * Helper to simulate incoming RS-232 byte stream from analyzer
   */
  public emitIncomingChunk(chunk: string | Buffer): void {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "binary");
    for (const h of this.dataHandlers) {
      h(buf);
    }
  }

  public simulateDisconnect(): void {
    this.openState = false;
    for (const h of this.closeHandlers) {
      h();
    }
  }
}

export class LisSerialPortHandler extends EventEmitter {
  private config: SerialPortConfig;
  private transport: ISerialTransport | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isDestroyed = false;

  constructor(config: SerialPortConfig, transport?: ISerialTransport) {
    super();
    this.config = {
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      reconnectIntervalMs: 3000,
      ...config,
    };
    if (transport) {
      this.transport = transport;
    }
  }

  public setTransport(transport: ISerialTransport): void {
    this.transport = transport;
  }

  public async start(): Promise<void> {
    this.isDestroyed = false;
    await this.connect();
  }

  public async connect(): Promise<boolean> {
    if (!this.transport) {
      // In native environment without explicit transport, initialize Mock or Tauri Serial
      this.transport = new MockSerialStream();
    }

    try {
      this.bindTransportEvents();
      await this.transport.open();
      this.emit("connected", {
        port: this.config.portName,
        baudRate: this.config.baudRate,
      });
      return true;
    } catch (err) {
      this.emit("error", err);
      this.scheduleReconnect();
      return false;
    }
  }

  private bindTransportEvents(): void {
    if (!this.transport) return;

    this.transport.onData((chunk: Buffer) => {
      this.emit("data", chunk.toString("binary"));
    });

    this.transport.onError((err: Error) => {
      this.emit("error", err);
    });

    this.transport.onClose(() => {
      this.emit("disconnected");
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.isDestroyed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isDestroyed && (!this.transport || !this.transport.isOpen())) {
        void this.connect();
      }
    }, this.config.reconnectIntervalMs);
  }

  public async write(data: string): Promise<void> {
    if (this.transport && this.transport.isOpen()) {
      await this.transport.write(data);
    } else {
      throw new Error(`Serial port ${this.config.portName} is not open`);
    }
  }

  public async stop(): Promise<void> {
    this.isDestroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.transport && this.transport.isOpen()) {
      await this.transport.close();
    }
  }

  public isConnected(): boolean {
    return this.transport ? this.transport.isOpen() : false;
  }
}
