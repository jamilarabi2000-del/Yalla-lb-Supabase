/**
 * Yalla.lb - Real-Time Firestore Database Monitor & Operation Tracker
 * Logs all Firestore read/write/snapshot operations from AdminView and store contexts
 * with precise timestamps, document IDs, payload inspections, and latency metrics
 * to diagnose and pinpoint sync failures immediately.
 */

import { secureRandomString } from './uuid';
import { 
  DocumentReference, 
  DocumentData, 
  SetOptions, 
  setDoc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  WriteBatch,
  DocumentSnapshot,
  QuerySnapshot
} from 'firebase/firestore';

export type FirestoreOpType = 
  | 'GET_DOC' 
  | 'SET_DOC' 
  | 'UPDATE_DOC' 
  | 'DELETE_DOC' 
  | 'BATCH_COMMIT' 
  | 'SNAPSHOT_SYNC' 
  | 'QUERY' 
  | 'DIAGNOSTIC_PING';

export type OperationStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export interface FirestoreLogRecord {
  id: string;
  timestamp: string;       // Human readable "HH:mm:ss.SSS"
  isoTimestamp: string;    // Full ISO-8601 string
  epochMs: number;         // Numeric millisecond timestamp for sorting
  operation: FirestoreOpType;
  collection: string;      // e.g. "cms", "products", "orders", "users", "categories"
  documentId: string;      // e.g. "main", "prod-custom-123", "YLB-89421"
  path: string;            // Full path: "cms/main", "products/prod-1"
  caller: string;          // Originating component / function e.g. "AdminView:updateStock"
  status: OperationStatus;
  latencyMs?: number;      // Duration in milliseconds
  payload?: any;           // Sanitized data written or read
  diff?: Record<string, { before: any; after: any }>; // Detailed field-level diff
  errorMessage?: string;
  errorCode?: string;
  errorStack?: string;
  metadata?: Record<string, any>;
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

export interface SyncDiagnosticsSummary {
  totalOperations: number;
  totalReads: number;
  totalWrites: number;
  successfulWrites: number;
  failedWrites: number;
  writeSuccessRate: number;
  avgLatencyMs: number;
  lastSuccessfulSync: string | null;
  lastFailedSync: string | null;
  lastError: string | null;
  activeMonitoredPaths: string[];
}

type LogSubscriber = (record: FirestoreLogRecord, allLogs: FirestoreLogRecord[]) => void;

class DatabaseMonitorService {
  private logs: FirestoreLogRecord[] = [];
  private subscribers: Set<LogSubscriber> = new Set();
  private maxLogCapacity = 300;
  private pendingOps = new Map<string, { startTime: number; partialRecord: Partial<FirestoreLogRecord> }>();

  constructor() {
    // Expose singleton to window for effortless live browser DevTools inspection
    if (typeof window !== 'undefined') {
      (window as any).__DATABASE_MONITOR = this;
      (window as any).__GET_DB_LOGS = () => this.getLogs();
      (window as any).__GET_DB_DIAGNOSTICS = () => this.getDiagnosticsSummary();
    }
  }

  /**
   * Subscribe to real-time database operation events
   */
  public subscribe(subscriber: LogSubscriber): () => void {
    this.subscribers.add(subscriber);
    if (this.logs.length > 0) {
      subscriber(this.logs[0], this.logs);
    }
    return () => this.subscribers.delete(subscriber);
  }

  /**
   * Return copy of all logged records
   */
  public getLogs(): FirestoreLogRecord[] {
    return [...this.logs];
  }

  /**
   * Clear all records in memory
   */
  public clearLogs(): void {
    this.logs = [];
    this.notifySubscribers({
      id: `clear-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }),
      isoTimestamp: new Date().toISOString(),
      epochMs: Date.now(),
      operation: 'DIAGNOSTIC_PING',
      collection: 'system',
      documentId: 'monitor',
      path: 'system/monitor',
      caller: 'DatabaseMonitor:clearLogs',
      status: 'SUCCESS',
      metadata: { action: 'Buffer cleared' }
    });
  }

  /**
   * Extract collection and docId from a path or DocumentReference
   */
  public parsePath(pathOrRef: string | DocumentReference): { collection: string; documentId: string; path: string } {
    const fullPath = typeof pathOrRef === 'string' ? pathOrRef : pathOrRef.path;
    const parts = fullPath.split('/').filter(Boolean);
    const collection = parts[0] || 'root';
    const documentId = parts.slice(1).join('/') || 'collection_root';
    return { collection, documentId, path: fullPath };
  }

  /**
   * Log initiation of a Firestore operation
   */
  public logOperationStart(params: {
    operation: FirestoreOpType;
    path: string | DocumentReference;
    caller: string;
    payload?: any;
    diff?: Record<string, { before: any; after: any }>;
    metadata?: Record<string, any>;
  }): { opId: string; startTime: number } {
    const opId = `op-${Date.now()}-${secureRandomString(5)}`;
    const startTime = performance.now();
    const { collection, documentId, path } = this.parsePath(params.path);

    const partialRecord: Partial<FirestoreLogRecord> = {
      operation: params.operation,
      collection,
      documentId,
      path,
      caller: params.caller,
      payload: params.payload,
      diff: params.diff,
      metadata: params.metadata
    };

    this.pendingOps.set(opId, { startTime, partialRecord });

    const startRecord: FirestoreLogRecord = {
      id: opId,
      timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }),
      isoTimestamp: new Date().toISOString(),
      epochMs: Date.now(),
      operation: params.operation,
      collection,
      documentId,
      path,
      caller: params.caller,
      status: 'PENDING',
      payload: params.payload,
      diff: params.diff,
      metadata: params.metadata
    };

    this.pushLog(startRecord);
    this.printConsoleLog(startRecord);

    return { opId, startTime };
  }

  /**
   * Log successful resolution of a Firestore operation
   */
  public logOperationSuccess(opId: string, params?: {
    payload?: any;
    metadata?: Record<string, any>;
    customLatencyMs?: number;
  }): FirestoreLogRecord {
    const pending = this.pendingOps.get(opId);
    const latencyMs = params?.customLatencyMs ?? (pending ? Math.round(performance.now() - pending.startTime) : 0);
    this.pendingOps.delete(opId);

    const now = new Date();
    const successRecord: FirestoreLogRecord = {
      id: `${opId}-ack`,
      timestamp: now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }),
      isoTimestamp: now.toISOString(),
      epochMs: Date.now(),
      operation: pending?.partialRecord.operation || 'SET_DOC',
      collection: pending?.partialRecord.collection || 'unknown',
      documentId: pending?.partialRecord.documentId || 'unknown',
      path: pending?.partialRecord.path || 'unknown',
      caller: pending?.partialRecord.caller || 'AdminView',
      status: 'SUCCESS',
      latencyMs,
      payload: params?.payload ?? pending?.partialRecord.payload,
      diff: pending?.partialRecord.diff,
      metadata: { ...pending?.partialRecord.metadata, ...params?.metadata }
    };

    this.pushLog(successRecord);
    this.printConsoleLog(successRecord);

    return successRecord;
  }

  /**
   * Log failure of a Firestore operation with full error diagnostic trace
   */
  public logOperationFailure(opId: string, error: any, params?: {
    metadata?: Record<string, any>;
  }): FirestoreLogRecord {
    const pending = this.pendingOps.get(opId);
    const latencyMs = pending ? Math.round(performance.now() - pending.startTime) : 0;
    this.pendingOps.delete(opId);

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = (error as any)?.code || (error as any)?.name || 'UNKNOWN_ERROR';
    const errorStack = error instanceof Error ? error.stack : undefined;

    const now = new Date();
    const failRecord: FirestoreLogRecord = {
      id: `${opId}-err`,
      timestamp: now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }),
      isoTimestamp: now.toISOString(),
      epochMs: Date.now(),
      operation: pending?.partialRecord.operation || 'SET_DOC',
      collection: pending?.partialRecord.collection || 'unknown',
      documentId: pending?.partialRecord.documentId || 'unknown',
      path: pending?.partialRecord.path || 'unknown',
      caller: pending?.partialRecord.caller || 'AdminView',
      status: 'FAILED',
      latencyMs,
      payload: pending?.partialRecord.payload,
      diff: pending?.partialRecord.diff,
      errorMessage,
      errorCode,
      errorStack,
      metadata: { ...pending?.partialRecord.metadata, ...params?.metadata }
    };

    this.pushLog(failRecord);
    this.printConsoleLog(failRecord);

    return failRecord;
  }

  /**
   * Log real-time snapshot sync updates from Firestore listeners
   */
  public logSnapshotSync(params: {
    path: string | DocumentReference;
    caller: string;
    itemCount?: number;
    docExists?: boolean;
    data?: any;
    metadata?: Record<string, any>;
  }): FirestoreLogRecord {
    const { collection, documentId, path } = this.parsePath(params.path);
    const now = new Date();

    const record: FirestoreLogRecord = {
      id: `snap-${Date.now()}-${secureRandomString(4)}`,
      timestamp: now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }),
      isoTimestamp: now.toISOString(),
      epochMs: Date.now(),
      operation: 'SNAPSHOT_SYNC',
      collection,
      documentId,
      path,
      caller: params.caller,
      status: 'SUCCESS',
      payload: params.data,
      metadata: {
        itemCount: params.itemCount,
        docExists: params.docExists,
        ...params.metadata
      }
    };

    this.pushLog(record);
    this.printConsoleLog(record);
    return record;
  }

  /**
   * Get analytical summary of sync reliability & latency
   */
  public getDiagnosticsSummary(): SyncDiagnosticsSummary {
    const totalOperations = this.logs.length;
    const reads = this.logs.filter(l => l.operation === 'GET_DOC' || l.operation === 'QUERY' || l.operation === 'SNAPSHOT_SYNC');
    const writes = this.logs.filter(l => l.operation === 'SET_DOC' || l.operation === 'UPDATE_DOC' || l.operation === 'DELETE_DOC' || l.operation === 'BATCH_COMMIT');
    
    const successfulWrites = writes.filter(l => l.status === 'SUCCESS');
    const failedWrites = writes.filter(l => l.status === 'FAILED');
    const writeSuccessRate = writes.length > 0 ? Math.round((successfulWrites.length / writes.length) * 100) : 100;

    const latencies = this.logs.filter(l => l.latencyMs !== undefined).map(l => l.latencyMs!);
    const avgLatencyMs = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

    const lastSuccess = this.logs.find(l => l.status === 'SUCCESS')?.timestamp || null;
    const lastFailed = this.logs.find(l => l.status === 'FAILED')?.timestamp || null;
    const lastErrorLog = this.logs.find(l => l.errorMessage);
    const lastError = lastErrorLog ? `[${lastErrorLog.path}] ${lastErrorLog.errorMessage}` : null;

    const activePaths = Array.from(new Set(this.logs.map(l => l.path))).slice(0, 10);

    return {
      totalOperations,
      totalReads: reads.length,
      totalWrites: writes.length,
      successfulWrites: successfulWrites.length,
      failedWrites: failedWrites.length,
      writeSuccessRate,
      avgLatencyMs,
      lastSuccessfulSync: lastSuccess,
      lastFailedSync: lastFailed,
      lastError,
      activeMonitoredPaths: activePaths
    };
  }

  /**
   * Export all recorded logs as a formatted JSON string
   */
  public exportLogs(): string {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      diagnostics: this.getDiagnosticsSummary(),
      records: this.logs
    }, null, 2);
  }

  private pushLog(record: FirestoreLogRecord) {
    const redactedRecord: FirestoreLogRecord = {
      ...record,
      payload: redactPII(record.payload),
      diff: redactPII(record.diff),
      metadata: redactPII(record.metadata)
    };
    this.logs.unshift(redactedRecord);
    if (this.logs.length > this.maxLogCapacity) {
      this.logs = this.logs.slice(0, this.maxLogCapacity);
    }
    this.notifySubscribers(redactedRecord);
  }

  private notifySubscribers(record: FirestoreLogRecord) {
    this.subscribers.forEach((sub) => {
      try {
        sub(record, this.logs);
      } catch (err) {
        console.error('[DatabaseMonitor] Subscriber error:', err);
      }
    });
  }

  private printConsoleLog(record: FirestoreLogRecord) {
    if (!import.meta.env.DEV) return;

    const statusEmoji: Record<OperationStatus, string> = {
      PENDING: '⏳',
      SUCCESS: '✅',
      FAILED: '❌'
    };

    const statusStyle: Record<OperationStatus, string> = {
      PENDING: 'color: #f59e0b; font-weight: bold;',
      SUCCESS: 'color: #10b981; font-weight: bold;',
      FAILED: 'color: #ef4444; font-weight: bold; background: #fee2e2; padding: 2px 4px; border-radius: 4px;'
    };

    const latencyText = record.latencyMs !== undefined ? ` [${record.latencyMs}ms]` : '';
    const header = `%c[DB Monitor ${record.timestamp}] ${statusEmoji[record.status]} ${record.operation} » ${record.path}${latencyText} (by ${record.caller})`;

    console.groupCollapsed(header, statusStyle[record.status] || 'color: #6366f1;');
    console.log('Document ID:', record.documentId);
    console.log('Collection:', record.collection);
    console.log('Full Path:', record.path);
    console.log('Caller:', record.caller);
    if (record.diff) console.log('Changes / Diff:', redactPII(record.diff));
    if (record.payload !== undefined) console.log('Payload / Data:', redactPII(record.payload));
    if (record.errorMessage) console.error(`Error (${record.errorCode}):`, record.errorMessage, record.errorStack);
    if (record.metadata) console.log('Metadata:', record.metadata);
    console.groupEnd();
  }
}

export const dbMonitor = new DatabaseMonitorService();

// ============================================================================
// MONITORED FIRESTORE CLIENT WRAPPERS
// Drop-in replacements for standard Firestore calls that automatically trace,
// sanitize payloads, and capture document ID, timestamp, and latency metrics.
// ============================================================================

/**
 * Deep sanitization to eliminate `undefined` values and prevent Firestore serialization crashes
 */
export function sanitizeDocumentData<T>(input: T): T {
  if (input === null || input === undefined) {
    return null as unknown as T;
  }
  if (typeof input === 'string') {
    // Prevent Firestore 1MB document size limit crash from oversized base64 data URLs (> 200KB)
    if (input.startsWith('data:image/') && input.length > 200000) {
      console.warn(`[DatabaseMonitor] Stripped oversized base64 image data URL (${Math.round(input.length / 1024)} KB) to prevent Firestore 1MB document size limit violation.`);
      return '' as unknown as T;
    }
    return input;
  }
  if (Array.isArray(input)) {
    return input
      .filter((item) => item !== undefined)
      .map((item) => sanitizeDocumentData(item)) as unknown as T;
  }
  if (typeof input === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        cleaned[key] = sanitizeDocumentData(value);
      }
    }
    return cleaned as T;
  }
  return input;
}

/**
 * Compute key-value differences between previous and updated documents
 */
export function computeFieldDiff(before: Record<string, any> | undefined, after: Record<string, any> | undefined): Record<string, { before: any; after: any }> {
  const diff: Record<string, { before: any; after: any }> = {};
  if (!before && !after) return diff;
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

/**
 * Monitored setDoc wrapper
 */
export async function monitoredSetDoc<T extends DocumentData>(
  docRef: DocumentReference<T>,
  data: Partial<T> | T,
  options?: SetOptions,
  caller: string = 'AdminView'
): Promise<void> {
  const sanitized = sanitizeDocumentData(data);
  const { opId } = dbMonitor.logOperationStart({
    operation: 'SET_DOC',
    path: docRef,
    caller,
    payload: sanitized,
    metadata: { options }
  });

  try {
    if (options) {
      await setDoc(docRef, sanitized as any, options);
    } else {
      await setDoc(docRef, sanitized as any);
    }

    dbMonitor.logOperationSuccess(opId, {
      payload: sanitized,
      metadata: { options, committed: true }
    });
  } catch (error: any) {
    dbMonitor.logOperationFailure(opId, error, {
      metadata: { options, attemptedPayload: sanitized }
    });
    throw error;
  }
}

/**
 * Monitored getDoc wrapper
 */
export async function monitoredGetDoc<T extends DocumentData>(
  docRef: DocumentReference<T>,
  caller: string = 'AdminView'
): Promise<DocumentSnapshot<T>> {
  const { opId } = dbMonitor.logOperationStart({
    operation: 'GET_DOC',
    path: docRef,
    caller
  });

  try {
    const snapshot = await getDoc(docRef);
    dbMonitor.logOperationSuccess(opId, {
      payload: snapshot.data(),
      metadata: { exists: snapshot.exists(), id: snapshot.id }
    });
    return snapshot;
  } catch (error: any) {
    dbMonitor.logOperationFailure(opId, error);
    throw error;
  }
}

/**
 * Monitored updateDoc wrapper
 */
export async function monitoredUpdateDoc<T extends DocumentData>(
  docRef: DocumentReference<T>,
  data: Partial<T>,
  caller: string = 'AdminView'
): Promise<void> {
  const sanitized = sanitizeDocumentData(data);
  const { opId } = dbMonitor.logOperationStart({
    operation: 'UPDATE_DOC',
    path: docRef,
    caller,
    payload: sanitized
  });

  try {
    await updateDoc(docRef, sanitized as any);
    dbMonitor.logOperationSuccess(opId, {
      payload: sanitized,
      metadata: { updated: true }
    });
  } catch (error: any) {
    dbMonitor.logOperationFailure(opId, error, {
      metadata: { attemptedPayload: sanitized }
    });
    throw error;
  }
}

/**
 * Monitored deleteDoc wrapper
 */
export async function monitoredDeleteDoc<T extends DocumentData>(
  docRef: DocumentReference<T>,
  caller: string = 'AdminView'
): Promise<void> {
  const { opId } = dbMonitor.logOperationStart({
    operation: 'DELETE_DOC',
    path: docRef,
    caller
  });

  try {
    await deleteDoc(docRef);
    dbMonitor.logOperationSuccess(opId, {
      metadata: { deleted: true }
    });
  } catch (error: any) {
    dbMonitor.logOperationFailure(opId, error);
    throw error;
  }
}

/**
 * Monitored WriteBatch commit wrapper
 */
export async function monitoredBatchCommit(
  batch: WriteBatch,
  itemCount: number,
  collectionName: string,
  caller: string = 'AdminView'
): Promise<void> {
  const { opId } = dbMonitor.logOperationStart({
    operation: 'BATCH_COMMIT',
    path: `${collectionName}/*`,
    caller,
    metadata: { batchSize: itemCount, collection: collectionName }
  });

  try {
    await batch.commit();
    dbMonitor.logOperationSuccess(opId, {
      metadata: { batchSize: itemCount, committed: true }
    });
  } catch (error: any) {
    dbMonitor.logOperationFailure(opId, error, {
      metadata: { batchSize: itemCount }
    });
    throw error;
  }
}
