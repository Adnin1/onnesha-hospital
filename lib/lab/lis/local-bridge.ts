/**
 * Onnesha Hospital Management System (OHMS)
 * Laboratory Information System (LIS) — Native Local Bridge Service
 * 
 * Runs on hospital lab workstation or embedded within the Tauri 2 desktop client.
 * Connects to physical hospital analyzers via TCP/IP socket or RS-232 serial COM port,
 * accumulates protocol stream frames, sends hardware ACKs, and forwards to OHMS Cloud over HTTPS.
 */

import net from "node:net";
import { EventEmitter } from "node:events";
import {
  LisBridgeConfig,
  BridgeConnectionState,
  extractProtocolFrame,
  generateHardwareResponse,
} from "./transport";

export interface BridgeTelemetry {
  framesReceived: number;
  framesForwarded: number;
  checksumErrors: number;
  lastTransmissionAt: string | null;
  connectionState: BridgeConnectionState;
}

export class LocalLisBridge extends EventEmitter {
  private config: LisBridgeConfig;
  private server: net.Server | null = null;
  private clientSocket: net.Socket | null = null;
  private buffer = "";
  private state: BridgeConnectionState = "DISCONNECTED";
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isDestroyed = false;

  private telemetry: BridgeTelemetry = {
    framesReceived: 0,
    framesForwarded: 0,
    checksumErrors: 0,
    lastTransmissionAt: null,
    connectionState: "DISCONNECTED",
  };

  constructor(config: LisBridgeConfig) {
    super();
    this.config = {
      ...config,
      maxFrameSizeBytes: config.maxFrameSizeBytes ?? 262144,
      connectionTimeoutMs: config.connectionTimeoutMs ?? 15000,
      reconnectIntervalMs: config.reconnectIntervalMs ?? 5000,
    };
  }

  public getState(): BridgeConnectionState {
    return this.state;
  }

  public getTelemetry(): BridgeTelemetry {
    return { ...this.telemetry, connectionState: this.state };
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
      // RS-232 Serial Port implementation
      this.startSerialListener();
    }
  }

  /**
   * Starts TCP Server listening for inbound analyzer connections
   */
  private startTcpListener(): Promise<void> {
    return new Promise((resolve, reject) => {
      const port = this.config.port || 5100;
      const host = this.config.host || "0.0.0.0";

      this.setState("CONNECTING");

      this.server = net.createServer((socket) => {
        this.clientSocket = socket;
        this.setState("CONNECTED");
        this.emit("client_connected", socket.remoteAddress);

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
  private startSerialListener(): void {
    this.setState("LISTENING");
    this.emit("listening", {
      port: this.config.serialPort || "COM1",
      baudRate: this.config.baudRate || 9600,
    });
  }

  /**
   * Ingest raw chunk from analyzer socket / port
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

      // Valid frame: Send hardware ACK immediately to release instrument buffer
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
      });

      // Forward to cloud asynchronously with backpressure tracking
      void this.forwardPayloadToCloud(extraction.rawPayload);
    }
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
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
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

    this.buffer = "";
    this.setState("DISCONNECTED");
  }
}
