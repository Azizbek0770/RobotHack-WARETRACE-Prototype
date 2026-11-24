import type {
  RealtimeConnectionStatus,
  WarehouseRealtimeClient,
  WarehouseRealtimeEvent,
  WarehouseRealtimeEventType,
} from '../data/contracts';

const ALLOWED_EVENT_TYPES = new Set<WarehouseRealtimeEventType>([
  'warehouse.inventory.changed',
  'warehouse.bin.updated',
  'warehouse.layout.changed',
]);

export interface WebSocketLike {
  readonly readyState: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onopen: ((event: any) => void) | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onmessage: ((event: any) => void) | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onerror: ((event: any) => void) | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onclose: ((event: any) => void) | null;
  close(code?: number, reason?: string): void;
}

export interface WebSocketRealtimeClientOptions {
  /** Proposed future WebSocket URL (e.g., from VITE_WAREHOUSE_WS_URL). Never defaults to a fake endpoint. */
  url?: string;
  /** Must be explicitly enabled before any socket connection is attempted */
  enabled?: boolean;
  /** Injectable WebSocket constructor/factory for deterministic unit testing */
  webSocketFactory?: (url: string) => WebSocketLike;
  /** Initial reconnect delay in milliseconds (default: 1000) */
  baseDelayMs?: number;
  /** Maximum reconnect delay cap in milliseconds (default: 30000) */
  maxDelayMs?: number;
  /** Maximum retained event IDs for duplicate suppression (default: 500) */
  maxSeenEvents?: number;
  /** Injectable PRNG [0, 1) for deterministic jitter testing */
  randomFn?: () => number;
}

export function resolveDefaultWarehouseWsUrl(): string | undefined {
  const envUrl =
    typeof import.meta !== 'undefined' &&
    typeof (import.meta as { env?: Record<string, string | undefined> }).env !== 'undefined'
      ? (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_WAREHOUSE_WS_URL
      : undefined;

  const trimmed = envUrl?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Runtime validator for the proposed WARETRACE warehouse WebSocket event schema.
 * Rejects malformed frames, unknown event types, and missing required fields.
 */
export function validateWarehouseRealtimeEvent(raw: unknown): WarehouseRealtimeEvent | null {
  if (!raw || typeof raw !== 'object') return null;

  const candidate = raw as Record<string, unknown>;

  if (typeof candidate.event_id !== 'string' || candidate.event_id.trim().length === 0) {
    return null;
  }
  if (
    typeof candidate.type !== 'string' ||
    !ALLOWED_EVENT_TYPES.has(candidate.type as WarehouseRealtimeEventType)
  ) {
    return null;
  }
  if (typeof candidate.warehouse_id !== 'string' || candidate.warehouse_id.trim().length === 0) {
    return null;
  }
  if (typeof candidate.entity_id !== 'string' || candidate.entity_id.trim().length === 0) {
    return null;
  }
  if (typeof candidate.version !== 'number' || !Number.isFinite(candidate.version) || candidate.version < 0) {
    return null;
  }
  if (typeof candidate.timestamp !== 'string' || Number.isNaN(Date.parse(candidate.timestamp))) {
    return null;
  }
  if (
    !candidate.payload ||
    typeof candidate.payload !== 'object' ||
    Array.isArray(candidate.payload)
  ) {
    return null;
  }

  return {
    event_id: candidate.event_id,
    type: candidate.type as WarehouseRealtimeEventType,
    warehouse_id: candidate.warehouse_id,
    entity_id: candidate.entity_id,
    version: candidate.version,
    timestamp: candidate.timestamp,
    payload: candidate.payload as WarehouseRealtimeEvent['payload'],
  };
}

/**
 * Compute exponential backoff delay with full/decorrelated jitter.
 */
export function computeReconnectDelayMs(
  attempt: number,
  baseDelayMs = 1000,
  maxDelayMs = 30000,
  randomFn: () => number = Math.random,
): number {
  const safeAttempt = Math.max(0, attempt);
  const exponential = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, safeAttempt));
  const jitterFactor = 0.5 + Math.min(1, Math.max(0, randomFn())) * 0.5;
  return Math.round(exponential * jitterFactor);
}

/**
 * Optional native WebSocket client adapter implementing the proposed WARETRACE realtime contract.
 *
 * Safety guarantees:
 * - Disabled by default and refuses to open a socket unless `enabled === true` AND a valid `url` is provided.
 * - Never fabricates events or treats WebSocket payloads as authoritative inventory.
 * - Enforces schema validation, active warehouse ID matching, duplicate `event_id` protection,
 *   and per-entity `version` monotonicity.
 * - Reconnects with exponential backoff + jitter and requests REST reconciliation after reconnecting.
 */
export class WebSocketWarehouseRealtimeClient implements WarehouseRealtimeClient {
  private readonly url?: string;
  private readonly enabled: boolean;
  private readonly webSocketFactory: (url: string) => WebSocketLike;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly maxSeenEvents: number;
  private readonly randomFn: () => number;

  private socket: WebSocketLike | null = null;
  private activeWarehouseId: string | null = null;
  private status: RealtimeConnectionStatus;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manualDisconnect = false;
  private hasConnectedOnce = false;

  private readonly eventListeners = new Set<(event: WarehouseRealtimeEvent) => void>();
  private readonly statusListeners = new Set<
    (status: RealtimeConnectionStatus, detail?: string) => void
  >();
  private readonly reconcileListeners = new Set<(warehouseId: string) => void>();

  private readonly seenEventIds = new Set<string>();
  private readonly seenEventQueue: string[] = [];
  private readonly entityVersions = new Map<string, number>();

  constructor(options: WebSocketRealtimeClientOptions = {}) {
    this.url = options.url?.trim() || undefined;
    this.enabled = options.enabled ?? false;
    this.baseDelayMs = options.baseDelayMs ?? 1000;
    this.maxDelayMs = options.maxDelayMs ?? 30000;
    this.maxSeenEvents = options.maxSeenEvents ?? 500;
    this.randomFn = options.randomFn ?? Math.random;
    this.webSocketFactory =
      options.webSocketFactory ?? ((targetUrl: string) => new WebSocket(targetUrl));

    if (!this.enabled) {
      this.status = 'disabled';
    } else if (!this.url) {
      this.status = 'unconfigured';
    } else {
      this.status = 'disconnected';
    }
  }

  getStatus(): RealtimeConnectionStatus {
    return this.status;
  }

  connect(warehouseId: string): void {
    if (!this.enabled) {
      this.setStatus('disabled', 'Real-time WebSocket sync is disabled.');
      return;
    }

    if (!this.url) {
      this.setStatus(
        'unconfigured',
        'Set VITE_WAREHOUSE_WS_URL to enable real-time warehouse synchronization.',
      );
      return;
    }

    // Switching warehouses: clean up prior socket and reset warehouse-scoped guards
    if (this.activeWarehouseId && this.activeWarehouseId !== warehouseId) {
      this.cleanupSocket(true);
      this.resetEventGuards();
      this.hasConnectedOnce = false;
    } else if (this.socket && this.activeWarehouseId === warehouseId) {
      // Already connecting or connected to this warehouse
      return;
    }

    this.activeWarehouseId = warehouseId;
    this.manualDisconnect = false;
    this.reconnectAttempt = 0;
    this.openSocket(warehouseId, false);
  }

  disconnect(): void {
    this.manualDisconnect = true;
    this.activeWarehouseId = null;
    this.hasConnectedOnce = false;
    this.reconnectAttempt = 0;
    this.cleanupSocket(true);
    this.resetEventGuards();

    if (!this.enabled) {
      this.setStatus('disabled');
    } else if (!this.url) {
      this.setStatus('unconfigured');
    } else {
      this.setStatus('disconnected');
    }
  }

  subscribe(callback: (event: WarehouseRealtimeEvent) => void): () => void {
    this.eventListeners.add(callback);
    return () => {
      this.eventListeners.delete(callback);
    };
  }

  onStatusChange(
    callback: (status: RealtimeConnectionStatus, detail?: string) => void,
  ): () => void {
    this.statusListeners.add(callback);
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  onReconcileNeeded(callback: (warehouseId: string) => void): () => void {
    this.reconcileListeners.add(callback);
    return () => {
      this.reconcileListeners.delete(callback);
    };
  }

  private openSocket(warehouseId: string, isReconnect: boolean): void {
    if (!this.url) return;

    this.cleanupSocket(false);
    this.setStatus(isReconnect ? 'reconnecting' : 'connecting');

    const socketUrl = this.buildWarehouseSocketUrl(this.url, warehouseId);
    let ws: WebSocketLike;

    try {
      ws = this.webSocketFactory(socketUrl);
    } catch {
      this.setStatus('error', 'Failed to initialize WebSocket connection.');
      this.scheduleReconnect(warehouseId);
      return;
    }

    this.socket = ws;

    ws.onopen = () => {
      if (this.socket !== ws || this.activeWarehouseId !== warehouseId) return;
      const wasReconnect = this.hasConnectedOnce;
      this.hasConnectedOnce = true;
      this.reconnectAttempt = 0;
      this.setStatus('connected');

      if (wasReconnect) {
        for (const listener of this.reconcileListeners) {
          listener(warehouseId);
        }
      }
    };

    ws.onmessage = (messageEvent) => {
      if (this.socket !== ws || this.activeWarehouseId !== warehouseId) return;
      this.handleRawMessage(messageEvent.data, warehouseId);
    };

    ws.onerror = () => {
      if (this.socket !== ws) return;
      this.setStatus('error', 'WebSocket transport unavailable; falling back to REST polling/manual refresh.');
    };

    ws.onclose = () => {
      if (this.socket !== ws) return;
      this.socket = null;
      if (this.manualDisconnect || this.activeWarehouseId !== warehouseId) {
        return;
      }
      this.scheduleReconnect(warehouseId);
    };
  }

  private handleRawMessage(rawData: unknown, activeWarehouseId: string): void {
    let parsed: unknown;
    if (typeof rawData === 'string') {
      try {
        parsed = JSON.parse(rawData);
      } catch {
        return;
      }
    } else if (rawData && typeof rawData === 'object') {
      parsed = rawData;
    } else {
      return;
    }

    const event = validateWarehouseRealtimeEvent(parsed);
    if (!event) return;

    // Step 2: Verify active warehouse matches
    if (event.warehouse_id !== activeWarehouseId) return;

    // Step 3a: Duplicate event_id protection
    if (this.seenEventIds.has(event.event_id)) return;

    // Step 3b: Per-entity monotonic version protection
    const entityKey = `${event.type}:${event.entity_id}`;
    const lastVersion = this.entityVersions.get(entityKey);
    if (lastVersion !== undefined && event.version <= lastVersion) {
      return;
    }

    this.recordSeenEvent(event.event_id);
    this.entityVersions.set(entityKey, event.version);

    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  private scheduleReconnect(warehouseId: string): void {
    if (this.manualDisconnect || this.activeWarehouseId !== warehouseId) return;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
    }

    const delayMs = computeReconnectDelayMs(
      this.reconnectAttempt,
      this.baseDelayMs,
      this.maxDelayMs,
      this.randomFn,
    );
    this.reconnectAttempt += 1;
    this.setStatus('reconnecting', `Reconnecting in ${(delayMs / 1000).toFixed(1)}s`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.manualDisconnect || this.activeWarehouseId !== warehouseId) return;
      this.openSocket(warehouseId, true);
    }, delayMs);
  }

  private cleanupSocket(clearTimer: boolean): void {
    if (clearTimer && this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      const prev = this.socket;
      this.socket = null;
      prev.onopen = null;
      prev.onmessage = null;
      prev.onerror = null;
      prev.onclose = null;
      try {
        prev.close(1000, 'Client disconnect');
      } catch {
        // Ignore already-closed sockets
      }
    }
  }

  private recordSeenEvent(eventId: string): void {
    this.seenEventIds.add(eventId);
    this.seenEventQueue.push(eventId);
    while (this.seenEventQueue.length > this.maxSeenEvents) {
      const oldest = this.seenEventQueue.shift();
      if (oldest) {
        this.seenEventIds.delete(oldest);
      }
    }
  }

  private resetEventGuards(): void {
    this.seenEventIds.clear();
    this.seenEventQueue.length = 0;
    this.entityVersions.clear();
  }

  private setStatus(next: RealtimeConnectionStatus, detail?: string): void {
    this.status = next;
    for (const listener of this.statusListeners) {
      listener(next, detail);
    }
  }

  private buildWarehouseSocketUrl(baseUrl: string, warehouseId: string): string {
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}warehouse_id=${encodeURIComponent(warehouseId)}`;
  }
}
