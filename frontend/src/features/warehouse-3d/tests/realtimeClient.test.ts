import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WarehouseRealtimeEvent } from '../data/contracts';
import {
  WebSocketWarehouseRealtimeClient,
  computeReconnectDelayMs,
  validateWarehouseRealtimeEvent,
  type WebSocketLike,
} from '../services/realtimeClient';

class FakeWebSocket implements WebSocketLike {
  readyState = 0;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null = null;
  closed = false;
  readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  triggerOpen(): void {
    this.readyState = 1;
    this.onopen?.({});
  }

  triggerMessage(payload: unknown): void {
    this.onmessage?.({
      data: typeof payload === 'string' ? payload : JSON.stringify(payload),
    });
  }

  triggerClose(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }

  close(): void {
    this.closed = true;
    this.readyState = 3;
  }
}

describe('realtimeClient — validation, deduplication, reconnect backoff, and cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('validates proposed warehouse event schema and rejects malformed payloads', () => {
    const valid = validateWarehouseRealtimeEvent({
      event_id: 'evt-1',
      type: 'warehouse.inventory.changed',
      warehouse_id: 'wh-1',
      entity_id: 'bin-1',
      version: 2,
      timestamp: '2026-11-22T12:00:00Z',
      payload: { bin_id: 'bin-1' },
    });
    expect(valid).not.toBeNull();
    expect(valid?.type).toBe('warehouse.inventory.changed');

    // Invalid event type
    expect(
      validateWarehouseRealtimeEvent({
        event_id: 'evt-2',
        type: 'unknown.event',
        warehouse_id: 'wh-1',
        entity_id: 'bin-1',
        version: 1,
        timestamp: '2026-11-22T12:00:00Z',
        payload: {},
      }),
    ).toBeNull();

    // Missing event_id / negative version / bad timestamp
    expect(validateWarehouseRealtimeEvent(null)).toBeNull();
    expect(
      validateWarehouseRealtimeEvent({
        event_id: '',
        type: 'warehouse.bin.updated',
        warehouse_id: 'wh-1',
        entity_id: 'bin-1',
        version: -1,
        timestamp: 'not-a-date',
        payload: {},
      }),
    ).toBeNull();
  });

  it('refuses to connect when disabled or when VITE_WAREHOUSE_WS_URL is unset', () => {
    const factory = vi.fn((url: string) => new FakeWebSocket(url));

    const disabledClient = new WebSocketWarehouseRealtimeClient({
      url: 'wss://example.test/ws',
      enabled: false,
      webSocketFactory: factory,
    });
    disabledClient.connect('wh-1');
    expect(disabledClient.getStatus()).toBe('disabled');
    expect(factory).not.toHaveBeenCalled();

    const unconfiguredClient = new WebSocketWarehouseRealtimeClient({
      url: '',
      enabled: true,
      webSocketFactory: factory,
    });
    unconfiguredClient.connect('wh-1');
    expect(unconfiguredClient.getStatus()).toBe('unconfigured');
    expect(factory).not.toHaveBeenCalled();
  });

  it('filters by active warehouse ID, suppresses duplicate event_ids and stale versions', () => {
    const sockets: FakeWebSocket[] = [];
    const client = new WebSocketWarehouseRealtimeClient({
      url: 'wss://example.test/ws',
      enabled: true,
      webSocketFactory: (url) => {
        const ws = new FakeWebSocket(url);
        sockets.push(ws);
        return ws;
      },
    });

    const received: WarehouseRealtimeEvent[] = [];
    client.subscribe((evt) => received.push(evt));
    client.connect('wh-1');
    sockets[0].triggerOpen();

    // Valid event v2
    sockets[0].triggerMessage({
      event_id: 'e-1',
      type: 'warehouse.inventory.changed',
      warehouse_id: 'wh-1',
      entity_id: 'bin-a01',
      version: 2,
      timestamp: '2026-11-22T12:00:00Z',
      payload: { bin_id: 'bin-a01' },
    });

    // Duplicate event_id -> ignored
    sockets[0].triggerMessage({
      event_id: 'e-1',
      type: 'warehouse.inventory.changed',
      warehouse_id: 'wh-1',
      entity_id: 'bin-a01',
      version: 3,
      timestamp: '2026-11-22T12:00:01Z',
      payload: { bin_id: 'bin-a01' },
    });

    // Stale version (v1 <= v2) -> ignored
    sockets[0].triggerMessage({
      event_id: 'e-2',
      type: 'warehouse.inventory.changed',
      warehouse_id: 'wh-1',
      entity_id: 'bin-a01',
      version: 1,
      timestamp: '2026-11-22T12:00:02Z',
      payload: { bin_id: 'bin-a01' },
    });

    // Wrong warehouse ID -> ignored
    sockets[0].triggerMessage({
      event_id: 'e-3',
      type: 'warehouse.inventory.changed',
      warehouse_id: 'wh-OTHER',
      entity_id: 'bin-a01',
      version: 5,
      timestamp: '2026-11-22T12:00:03Z',
      payload: { bin_id: 'bin-a01' },
    });

    // Newer valid event v3 -> accepted
    sockets[0].triggerMessage({
      event_id: 'e-4',
      type: 'warehouse.inventory.changed',
      warehouse_id: 'wh-1',
      entity_id: 'bin-a01',
      version: 3,
      timestamp: '2026-11-22T12:00:04Z',
      payload: { bin_id: 'bin-a01' },
    });

    expect(received.map((e) => e.event_id)).toEqual(['e-1', 'e-4']);
  });

  it('applies exponential backoff with jitter and requests REST reconciliation after reconnect', () => {
    expect(computeReconnectDelayMs(0, 1000, 30000, () => 0)).toBe(500);
    expect(computeReconnectDelayMs(0, 1000, 30000, () => 1)).toBe(1000);
    expect(computeReconnectDelayMs(3, 1000, 30000, () => 1)).toBe(8000);
    expect(computeReconnectDelayMs(10, 1000, 30000, () => 1)).toBe(30000);

    const sockets: FakeWebSocket[] = [];
    const reconcileSpy = vi.fn();
    const client = new WebSocketWarehouseRealtimeClient({
      url: 'wss://example.test/ws',
      enabled: true,
      baseDelayMs: 1000,
      maxDelayMs: 8000,
      randomFn: () => 1,
      webSocketFactory: (url) => {
        const ws = new FakeWebSocket(url);
        sockets.push(ws);
        return ws;
      },
    });

    client.onReconcileNeeded(reconcileSpy);
    client.connect('wh-1');
    expect(sockets).toHaveLength(1);
    sockets[0].triggerOpen();
    expect(reconcileSpy).not.toHaveBeenCalled();

    // Unexpected drop -> schedules reconnect in 1000ms
    sockets[0].triggerClose();
    expect(client.getStatus()).toBe('reconnecting');

    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2);
    sockets[1].triggerOpen();

    // Reconnection after drop triggers authoritative REST reconciliation
    expect(client.getStatus()).toBe('connected');
    expect(reconcileSpy).toHaveBeenCalledTimes(1);
    expect(reconcileSpy).toHaveBeenCalledWith('wh-1');
  });

  it('cleans up sockets and pending reconnect timers on warehouse switch and disconnect', () => {
    const sockets: FakeWebSocket[] = [];
    const client = new WebSocketWarehouseRealtimeClient({
      url: 'wss://example.test/ws',
      enabled: true,
      baseDelayMs: 1000,
      randomFn: () => 1,
      webSocketFactory: (url) => {
        const ws = new FakeWebSocket(url);
        sockets.push(ws);
        return ws;
      },
    });

    client.connect('wh-1');
    const firstSocket = sockets[0];
    expect(firstSocket.url).toContain('warehouse_id=wh-1');

    // Switch warehouse -> previous socket must close cleanly
    client.connect('wh-2');
    expect(firstSocket.closed).toBe(true);
    expect(sockets).toHaveLength(2);
    expect(sockets[1].url).toContain('warehouse_id=wh-2');

    // Trigger drop then disconnect before timer fires -> no zombie reconnect socket created
    sockets[1].triggerClose();
    client.disconnect();
    vi.advanceTimersByTime(10000);
    expect(sockets).toHaveLength(2);
    expect(client.getStatus()).toBe('disconnected');
  });
});
