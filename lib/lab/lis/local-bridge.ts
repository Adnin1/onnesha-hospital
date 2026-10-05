/**
 * Onnesha Hospital Management System (OHMS)
 * Laboratory Information System (LIS) — Native Local Bridge Service (Gate 9)
 * 
 * Runs on hospital lab workstation or embedded within the Tauri 2 desktop client.
 * Connects to physical hospital analyzers via TCP/IP socket or RS-232 serial COM port.
 *
 * Hardened Features:
 * - Write-Before-ACK Guarantee: synchronously spools incoming frame to durable storage before issuing hardware ACK
 * - Background queue delivery worker with exponential retry and dead-letter protection
 * - RS-232 serial COM port handler with reconnect watchdog
 * - TCP server client IP allowlisting & unauthorized connection rejection
 */

import net from "node:net";
import { EventEmitter } from "node:events";
import {
  LisBridgeConfig,
  BridgeConnectionState,
  extractProtocolFrame,
  generateHardwareResponse,
} from "./transport";
import { DurableLisSpool, SpooledRecord } from "./durable-spool";
import { LisSerialPortHandler, ISerialTransport } from "./serial-handler";

export interface BridgeTelemetry {
  framesReceived: number;
  framesForwarded: number;
  checksumErrors: number;
  pendingSpoolCount: number;
  lastTransmissionAt: string | null;
  connectionState: BridgeConnectionState;
}

export class LocalLisBridge extends EventEmitter {
  private config: LisBridgeConfig;
  private server: net.Server | null = null;
  private clientSocket: net.Socket | null = null;
  private buffer = "";
  private state: BridgeConnectionState = "DISCONNECTED";
  private isDestroyed = false;

  private spool: DurableLisSpool;
  private serialHandler: LisSerialPortHandler | null = null;

  private telemetry: BridgeTelemetry = {
    framesReceived: 0,
    framesForwarded: 0,
    checksumErrors: 0,
    pendingSpoolCount: 0,
    lastTransmissionAt: null,
    connectionState: "DISCONNECTED",
  };

  constructor(config: LisBridgeConfig, serialTransport?: ISerialTransport) {
    super();
    this.config = {
      ...config,
      maxFrameSizeBytes: config.maxFrameSizeBytes ?? 262144,
      connectionTimeoutMs: config.connectionTimeoutMs ?? 15000,
      reconnectIntervalMs: config.reconnectIntervalMs ?? 5000,
    };

    this.spool = new DurableLisSpool({
      storageDir: config.spoolDir,
      inMemoryOnly: config.inMemorySpool,
    });

    if (config.transportType === "SERIAL_RS232") {
      this.serialHandler = new LisSerialPortHandler(
        {
          portName: config.serialPort || "COM1",
          baudRate: config.baudRate || 9600,
          dataBits: config.dataBits,
          stopBits: config.stopBits,
          parity: config.parity,
          reconnectIntervalMs: config.reconnectIntervalMs,
        },
        serialTransport
      );
    }
  }

  public getState(): BridgeConnectionState {
    return this.state;
  }

  public getTelemetry(): BridgeTelemetry {
    return {
      ...this.telemetry,
      pendingSpoolCount: this.spool.getPendingCount(),
      connectionState: this.state,
    };
  }

  public getPendingSpoolCount(): number {
    return this.spool.getPendingCount();
  }

  public getDeadLetterRecords(): SpooledRecord[] {
    return this.spool.getDeadLetterRecords();
  }

  public replayDeadLetterQueue(): number {
    return this.spool.replayDeadLetterQueue();
  }

  private setState(newState: BridgeConnectionState) {
    this.state = newState;
    this.telemetry.connectionState = newState;
    this.emit("state_change", newState);
  }

  /**
   * Start local bridge listener or client
   */
  public async start(): Promise<void> {
    if (this.state === "LISTENING" || this.state === "CONNECTED") {
      return;
    }

    this.isDestroyed = false;

    if (this.config.transportType === "TCP_IP") {
      await this.startTcpListener();
    } else {
      await this.startSerialListener();
    }
  }

  /**
   * Starts TCP Server listening for inbound analyzer connections with client IP allowlist
   */
  private startTcpListener(): Promise<void> {
    return new Promise((resolve, reject) => {
      const port = this.config.port || 5100;
      const host = this.config.host || "0.0.0.0";

      this.setState("CONNECTING");

      this.server = net.createServer((socket) => {
        const remote = socket.remoteAddress ? socket.remoteAddress.replace(/^::ffff:/, "") : "";

        // Client IP Allowlist Security Check
        if (this.config.allowedIps && this.config.allowedIps.length > 0) {
          if (!this.config.allowedIps.includes(remote)) {
            this.emit("unauthorized_client_rejected", { remoteAddress: remote });
            socket.destroy();
            return;
          }
        }

        this.clientSocket = socket;
        this.setState("CONNECTED");
        this.emit("client_connected", remote);

        socket.setTimeout(this.config.connectionTimeoutMs);

        socket.on("data", (chunk: Buffer) => {
          this.handleIncomingData(chunk.toString("binary"), socket);
        });

        socket.on("timeout", () => {
          this.emit("warn", "Socket idle timeout reached");
          socket.end();
        });

        socket.on("error", (err) => {
          this.emit("socket_error", err);
        });

        socket.on("close", () => {
          this.clientSocket = null;
          this.setState("LISTENING");
          this.emit("client_disconnected");
        });
      });

      this.server.on("error", (err) => {
        this.setState("ERROR");
        this.emit("error", err);
        reject(err);
      });

      this.server.listen(port, host, () => {
        this.setState("LISTENING");
        this.emit("listening", { host, port });
        resolve();
      });
    });
  }

  /**
   * Starts Serial RS-232 bridge
   */
  private async startSerialListener(): Promise<void> {
    if (!this.serialHandler) {
      this.serialHandler = new LisSerialPortHandler({
        portName: this.config.serialPort || "COM1",
        baudRate: this.config.baudRate || 9600,
        dataBits: this.config.dataBits,
        stopBits: this.config.stopBits,
        parity: this.config.parity,
      });
    }

    this.serialHandler.on("data", (chunk: string) => {
      this.handleIncomingData(chunk, {
        write: (ack: string) => {
          void this.serialHandler?.write(ack);
        },
      });
    });

    this.serialHandler.on("error", (err) => {
      this.emit("serial_error", err);
    });

    await this.serialHandler.start();
    this.setState("LISTENING");
    this.emit("listening", {
      port: this.config.serialPort || "COM1",
      baudRate: this.config.baudRate || 9600,
    });
  }

  /**
   * Ingest raw chunk from analyzer socket / port
   * WRITE-BEFORE-ACK: Synchronously spools frame to durable storage BEFORE sending ACK
   */
  public handleIncomingData(chunk: string, responder?: { write: (data: string) => void }): void {
    this.buffer += chunk;

    // Check maximum frame size limit
    if (this.buffer.length > this.config.maxFrameSizeBytes) {
      this.emit("warn", "Buffer overflow exceeded maxFrameSizeBytes. Flushing buffer.");
      this.buffer = "";
      return;
    }

    // Attempt to extract protocol frames from buffer
    while (this.buffer.length > 0) {
      const extraction = extractProtocolFrame(this.buffer, this.config.maxFrameSizeBytes);

      if (!extraction.complete) {
        break; // Incomplete frame, wait for more chunks
      }

      this.buffer = extraction.remainingBuffer;
      this.telemetry.framesReceived++;
      this.telemetry.lastTransmissionAt = new Date().toISOString();

      if (!extraction.checksumValid) {
        this.telemetry.checksumErrors++;
        this.emit("checksum_error", { rawPayload: extraction.rawPayload });

        // Send hardware NAK
        if (responder) {
          const nak = generateHardwareResponse(
            extraction.frameProtocol === "ASTM_1394" ? "ASTM_1394" : "HL7_V2",
            false
          );
          responder.write(nak);
        }
        continue;
      }

      // Step 1: Synchronously write to durable spool BEFORE issuing hardware ACK
      const spooled = this.spool.spoolSync(
        this.config.analyzerCode,
        extraction.frameProtocol === "ASTM_1394" ? "ASTM_1394" : "HL7_V2",
        extraction.rawPayload
      );

      // Step 2: Now that frame is durably saved, issue hardware ACK to release analyzer buffer
      if (responder) {
        const ack = generateHardwareResponse(
          extraction.frameProtocol === "ASTM_1394" ? "ASTM_1394" : "HL7_V2",
          true
        );
        responder.write(ack);
      }

      this.emit("frame", {
        protocol: extraction.frameProtocol,
        rawPayload: extraction.rawPayload,
        spoolId: spooled.id,
      });

      // Step 3: Trigger background spool processor to deliver to cloud
      void this.dispatchSpooledQueue();
    }
  }

  /**
   * Processes the durable spool queue by dispatching records to OHMS Cloud
   */
  public async dispatchSpooledQueue(): Promise<{ delivered: number; failed: number }> {
    return this.spool.processQueue(async (record) => {
      return this.forwardPayloadToCloud(record.rawPayload);
    });
  }

  /**
   * Forward payload over authenticated HTTPS to OHMS Cloud
   */
  public async forwardPayloadToCloud(rawPacket: string): Promise<boolean> {
    this.setState("TRANSMITTING");

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-OHMS-Org-ID": this.config.organizationId,
        "X-OHMS-Analyzer": this.config.analyzerCode,
      };

      if (this.config.apiSecretToken) {
        headers["Authorization"] = `Bearer ${this.config.apiSecretToken}`;
      }

      const response = await fetch(this.config.cloudIngestUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          analyzerCode: this.config.analyzerCode,
          rawPacket,
          isSimulation: false,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        this.emit("forward_error", { status: response.status, error: errText });
        this.setState("LISTENING");
        return false;
      }

      this.telemetry.framesForwarded++;
      this.emit("forwarded", { analyzerCode: this.config.analyzerCode });
      this.setState("LISTENING");
      return true;
    } catch (err) {
      this.emit("forward_error", {
        error: err instanceof Error ? err.message : String(err),
      });
      this.setState("LISTENING");
      return false;
    }
  }

  /**
   * Stop local bridge
   */
  public async stop(): Promise<void> {
    this.isDestroyed = true;

    if (this.serialHandler) {
      await this.serialHandler.stop();
      this.serialHandler = null;
    }

    if (this.clientSocket) {
      this.clientSocket.destroy();
      this.clientSocket = null;
    }

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }

    this.spool.destroy();
    this.buffer = "";
    this.setState("DISCONNECTED");
  }
}
