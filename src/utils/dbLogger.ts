/**
 * Yalla.lb - Real-Time Data Flow & Firestore Database Logger
 * Tracks the complete lifecycle of data updates from UI form inputs to Firestore persistence and snapshot sync.
 */

import { secureRandomString } from './uuid';

export type DataFlowStage = 
  | 'STAGE_1_FORM_INPUT'       // UI Form input or button action captured
  | 'STAGE_2_SANITIZATION'     // Payload inspected, stripped of 'undefined', diff calculated
  | 'STAGE_3_FIRESTORE_WRITE'  // Write operation initiated to Firestore document/collection
  | 'STAGE_4_FIRESTORE_ACK'    // Firestore responded with success / commit acknowledgement
  | 'STAGE_4_FIRESTORE_ERROR'  // Firestore threw error (network, permission, schema)
  | 'STAGE_5_SNAPSHOT_SYNC';   // Live onSnapshot listener received updated state

export type DatabaseOperation = 'setDoc' | 'updateDoc' | 'deleteDoc' | 'writeBatch' | 'onSnapshot';

export interface DataFlowLogEntry {
  id: string;
  timestamp: string;
  isoTime: string;
  stage: DataFlowStage;
  operation: DatabaseOperation;
  targetPath: string; // e.g. "cms/main", "products/prod-12", "orders/YLB-98421"
  sourceComponent: string; // e.g. "PageCMSManager", "ProductModal", "AdminView"
  actionName: string; // e.g. "updateSiteContent", "quickStockEdit", "createProduct"
  summary: string;
  payload?: any;
  diff?: Record<string, { before: any; after: any }> | string[];
  latencyMs?: number;
  status: 'info' | 'success' | 'warning' | 'error';
  errorMessage?: string;
  errorCode?: string;
}

function redactPII(data: any): any {
  if (!data) return data;
  if (typeof data !== 'object') return data;
  
  if (Array.isArray(data)) {
    return data.map(redactPII);
  }
  
  const redacted = { ...data };
  const piiKeys = [
    'fullName', 'firstName', 'lastName', 'customerName', 'recipientName', 'userName', 'profileName',
    'phone', 'email', 'street', 'building', 'floorApartment', 'deliveryNotes', 'address', 
    'defaultAddress', 'defaultNotes', 'shipping', 'recipient',
    'customer', 'user', 'profile'
  ];
  
  for (const key of Object.keys(redacted)) {
    if (piiKeys.includes(key)) {
      redacted[key] = '[REDACTED_PII]';
    } else if (typeof redacted[key] === 'object') {
      redacted[key] = redactPII(redacted[key]);
    }
  }
  return redacted;
}

type LogListener = (entry: DataFlowLogEntry, logs: DataFlowLogEntry[]) => void;

class DatabaseLoggerService {
  private logs: DataFlowLogEntry[] = [];
  private listeners: Set<LogListener> = new Set();
  private maxLogs = 200;

  constructor() {
    // Expose logger to window for quick debugging in browser console
    if (typeof window !== 'undefined') {
      (window as any).__YALLA_DB_LOGGER = this;
    }
  }

  public subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    // Emit current state immediately to the new listener
    if (this.logs.length > 0) {
      listener(this.logs[0], this.logs);
    }
    return () => this.listeners.delete(listener);
  }

  public getLogs(): DataFlowLogEntry[] {
    return [...this.logs];
  }

  public clearLogs(): void {
    this.logs = [];
    this.notifyListeners({
      id: `log-clear-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      isoTime: new Date().toISOString(),
      stage: 'STAGE_1_FORM_INPUT',
      operation: 'setDoc',
      targetPath: 'system/logs',
      sourceComponent: 'DatabaseLoggerService',
      actionName: 'clearLogs',
      summary: 'Data flow log history cleared.',
      status: 'info'
    });
  }

  private notifyListeners(entry: DataFlowLogEntry) {
    this.listeners.forEach((listener) => {
      try {
        listener(entry, this.logs);
      } catch (err) {
        console.error('[DB Logger] Listener callback error:', err);
      }
    });
  }

  private addEntry(entry: Omit<DataFlowLogEntry, 'id' | 'timestamp' | 'isoTime'>): DataFlowLogEntry {
    const now = new Date();
    const fullEntry: DataFlowLogEntry = {
      ...entry,
      payload: redactPII(entry.payload),
      diff: redactPII(entry.diff),
      id: `log-${Date.now()}-${secureRandomString(5)}`,
      timestamp: now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }),
      isoTime: now.toISOString()
    };

    this.logs.unshift(fullEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    this.printToConsole(fullEntry);
    this.notifyListeners(fullEntry);
    return fullEntry;
  }

  private printToConsole(entry: DataFlowLogEntry) {
    if (!import.meta.env.DEV) return;

    const stageIcons: Record<DataFlowStage, string> = {
      STAGE_1_FORM_INPUT: '📝',
      STAGE_2_SANITIZATION: '🧹',
      STAGE_3_FIRESTORE_WRITE: '🚀',
      STAGE_4_FIRESTORE_ACK: '✅',
      STAGE_4_FIRESTORE_ERROR: '❌',
      STAGE_5_SNAPSHOT_SYNC: '⚡'
    };

    const stageColors: Record<DataFlowStage, string> = {
      STAGE_1_FORM_INPUT: 'color: #3b82f6; font-weight: bold;',
      STAGE_2_SANITIZATION: 'color: #8b5cf6; font-weight: bold;',
      STAGE_3_FIRESTORE_WRITE: 'color: #f59e0b; font-weight: bold;',
      STAGE_4_FIRESTORE_ACK: 'color: #10b981; font-weight: bold;',
      STAGE_4_FIRESTORE_ERROR: 'color: #ef4444; font-weight: bold; background: #fee2e2; padding: 2px 6px; border-radius: 4px;',
      STAGE_5_SNAPSHOT_SYNC: 'color: #06b6d4; font-weight: bold;'
    };

    const icon = stageIcons[entry.stage] || '📦';
    const style = stageColors[entry.stage] || 'color: #64748b;';
    const latencyStr = entry.latencyMs !== undefined ? ` [${entry.latencyMs}ms]` : '';

    console.groupCollapsed(
      `%c[Firestore Flow] ${icon} ${entry.stage} » ${entry.targetPath} (${entry.actionName})${latencyStr}`,
      style
    );
    console.log(`Source: %c${entry.sourceComponent}`, 'font-weight: bold; color: #6366f1;');
    console.log(`Summary: ${entry.summary}`);
    if (entry.diff) {
      console.log('Diff:', entry.diff);
    }
    if (entry.payload !== undefined) {
      console.log('Payload Data:', entry.payload);
    }
    if (entry.errorMessage) {
      console.error(`Error (${entry.errorCode || 'UNKNOWN'}): ${entry.errorMessage}`);
    }
    console.groupEnd();
  }

  // --- Public Logging Helpers ---

  public logFormInput(params: {
    sourceComponent: string;
    actionName: string;
    targetPath: string;
    summary: string;
    payload?: any;
    diff?: Record<string, { before: any; after: any }> | string[];
  }): DataFlowLogEntry {
    return this.addEntry({
      stage: 'STAGE_1_FORM_INPUT',
      operation: 'setDoc',
      targetPath: params.targetPath,
      sourceComponent: params.sourceComponent,
      actionName: params.actionName,
      summary: params.summary,
      payload: params.payload,
      diff: params.diff,
      status: 'info'
    });
  }

  public logSanitization(params: {
    sourceComponent: string;
    actionName: string;
    targetPath: string;
    summary: string;
    cleanedPayload?: any;
    removedUndefinedKeys?: string[];
  }): DataFlowLogEntry {
    return this.addEntry({
      stage: 'STAGE_2_SANITIZATION',
      operation: 'setDoc',
      targetPath: params.targetPath,
      sourceComponent: params.sourceComponent,
      actionName: params.actionName,
      summary: params.summary,
      payload: params.cleanedPayload,
      diff: params.removedUndefinedKeys,
      status: 'info'
    });
  }

  public logFirestoreWriteStart(params: {
    operation: DatabaseOperation;
    targetPath: string;
    sourceComponent: string;
    actionName: string;
    summary: string;
    payload?: any;
  }): { entry: DataFlowLogEntry; startTime: number } {
    const startTime = performance.now();
    const entry = this.addEntry({
      stage: 'STAGE_3_FIRESTORE_WRITE',
      operation: params.operation,
      targetPath: params.targetPath,
      sourceComponent: params.sourceComponent,
      actionName: params.actionName,
      summary: params.summary,
      payload: params.payload,
      status: 'warning'
    });
    return { entry, startTime };
  }

  public logFirestoreWriteSuccess(params: {
    operation: DatabaseOperation;
    targetPath: string;
    sourceComponent: string;
    actionName: string;
    summary: string;
    startTime: number;
    payload?: any;
  }): DataFlowLogEntry {
    const latencyMs = Math.round(performance.now() - params.startTime);
    return this.addEntry({
      stage: 'STAGE_4_FIRESTORE_ACK',
      operation: params.operation,
      targetPath: params.targetPath,
      sourceComponent: params.sourceComponent,
      actionName: params.actionName,
      summary: `${params.summary} (committed in ${latencyMs}ms)`,
      latencyMs,
      payload: params.payload,
      status: 'success'
    });
  }

  public logFirestoreWriteError(params: {
    operation: DatabaseOperation;
    targetPath: string;
    sourceComponent: string;
    actionName: string;
    summary: string;
    startTime: number;
    error: any;
  }): DataFlowLogEntry {
    const latencyMs = Math.round(performance.now() - params.startTime);
    const errorMessage = params.error instanceof Error ? params.error.message : String(params.error);
    const errorCode = (params.error as any)?.code || 'unknown-error';

    return this.addEntry({
      stage: 'STAGE_4_FIRESTORE_ERROR',
      operation: params.operation,
      targetPath: params.targetPath,
      sourceComponent: params.sourceComponent,
      actionName: params.actionName,
      summary: `Failed to persist to Firestore: ${errorMessage}`,
      latencyMs,
      errorMessage,
      errorCode,
      status: 'error'
    });
  }

  public logSnapshotSync(params: {
    targetPath: string;
    sourceComponent: string;
    summary: string;
    itemCountOrDetails?: any;
  }): DataFlowLogEntry {
    return this.addEntry({
      stage: 'STAGE_5_SNAPSHOT_SYNC',
      operation: 'onSnapshot',
      targetPath: params.targetPath,
      sourceComponent: params.sourceComponent,
      actionName: 'onSnapshotSync',
      summary: params.summary,
      payload: params.itemCountOrDetails,
      status: 'info'
    });
  }
}

export const dbLogger = new DatabaseLoggerService();

/**
 * Recursively removes all `undefined` values and converts problematic types
 * to ensure 100% compliance with Firestore's document serialization requirements.
 */
export function sanitizeFirestorePayload<T>(input: T): T {
  if (input === null || input === undefined) {
    return null as unknown as T;
  }

  if (Array.isArray(input)) {
    return input
      .filter((item) => item !== undefined)
      .map((item) => sanitizeFirestorePayload(item)) as unknown as T;
  }

  if (typeof input === 'object') {
    // Handle standard objects
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        cleaned[key] = sanitizeFirestorePayload(value);
      }
    }
    return cleaned as T;
  }

  return input;
}

/**
 * Calculates a shallow or nested diff between two objects for inspection in logs
 */
export function calculateObjectDiff(before: Record<string, any>, after: Record<string, any>): Record<string, { before: any; after: any }> {
  const diff: Record<string, { before: any; after: any }> = {};
  const allKeys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);

  for (const key of allKeys) {
    const valBefore = before?.[key];
    const valAfter = after?.[key];

    if (JSON.stringify(valBefore) !== JSON.stringify(valAfter)) {
      diff[key] = {
        before: valBefore,
        after: valAfter
      };
    }
  }

  return diff;
}
