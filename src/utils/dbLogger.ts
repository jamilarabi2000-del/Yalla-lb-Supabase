/**
 * Yalla.lb - Real-Time Data Flow & Database Logger
 * Tracks UI actions through Supabase persistence and synchronization.
 */

import { secureRandomString } from './uuid';

export type DataFlowStage =
  | 'STAGE_1_FORM_INPUT'
  | 'STAGE_2_SANITIZATION'
  | 'STAGE_3_FIRESTORE_WRITE'
  | 'STAGE_4_FIRESTORE_ACK'
  | 'STAGE_4_FIRESTORE_ERROR'
  | 'STAGE_5_SNAPSHOT_SYNC';

// Kept compatible with legacy UI call sites while the backend is Supabase.
export type DatabaseOperation =
  | 'setDoc'
  | 'updateDoc'
  | 'deleteDoc'
  | 'writeBatch'
  | 'onSnapshot'
  | 'upsert'
  | 'delete';

export interface DataFlowLogEntry {
  id: string;
  timestamp: string;
  isoTime: string;
  stage: DataFlowStage;
  operation: DatabaseOperation;
  targetPath: string;
  sourceComponent: string;
  actionName: string;
  summary: string;
  payload?: any;
  diff?: Record<string, { before: any; after: any }> | string[];
  latencyMs?: number;
  status: 'info' | 'success' | 'warning' | 'error';
  errorMessage?: string;
  errorCode?: string;
}

function redactPII(data: any): any {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(redactPII);
  const redacted = { ...data };
  const piiKeys = [
    'fullName', 'firstName', 'lastName', 'customerName', 'recipientName', 'userName', 'profileName',
    'phone', 'email', 'street', 'building', 'floorApartment', 'deliveryNotes', 'address',
    'defaultAddress', 'defaultNotes', 'shipping', 'recipient', 'customer', 'user', 'profile'
  ];
  for (const key of Object.keys(redacted)) {
    if (piiKeys.includes(key)) redacted[key] = '[REDACTED_PII]';
    else if (typeof redacted[key] === 'object') redacted[key] = redactPII(redacted[key]);
  }
  return redacted;
}

type LogListener = (entry: DataFlowLogEntry, logs: DataFlowLogEntry[]) => void;

class DatabaseLoggerService {
  private logs: DataFlowLogEntry[] = [];
  private listeners: Set<LogListener> = new Set();
  private maxLogs = 200;

  constructor() {
    if (typeof window !== 'undefined') (window as any).__YALLA_DB_LOGGER = this;
  }

  public subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    if (this.logs.length > 0) listener(this.logs[0], this.logs);
    return () => this.listeners.delete(listener);
  }

  public getLogs(): DataFlowLogEntry[] { return [...this.logs]; }
  public clearLogs(): void { this.logs = []; }

  private push(entry: DataFlowLogEntry): DataFlowLogEntry {
    this.logs = [entry, ...this.logs].slice(0, this.maxLogs);
    this.listeners.forEach(listener => {
      try { listener(entry, this.logs); } catch (err) { console.warn('[dbLogger] listener error', err); }
    });
    return entry;
  }

  public logFormInput(params: { sourceComponent: string; actionName: string; targetPath: string; summary: string; payload?: any; diff?: any }): DataFlowLogEntry {
    const now = new Date();
    return this.push({
      id: `log_${secureRandomString(12)}`,
      timestamp: String(now.getTime()), isoTime: now.toISOString(),
      stage: 'STAGE_1_FORM_INPUT', operation: 'setDoc',
      targetPath: params.targetPath, sourceComponent: params.sourceComponent,
      actionName: params.actionName, summary: params.summary,
      payload: redactPII(params.payload), diff: params.diff, status: 'info'
    });
  }

  public logSanitization(params: { sourceComponent: string; actionName: string; targetPath: string; summary: string; cleanedPayload?: any }): DataFlowLogEntry {
    const now = new Date();
    return this.push({
      id: `log_${secureRandomString(12)}`,
      timestamp: String(now.getTime()), isoTime: now.toISOString(),
      stage: 'STAGE_2_SANITIZATION', operation: 'setDoc',
      targetPath: params.targetPath, sourceComponent: params.sourceComponent,
      actionName: params.actionName, summary: params.summary,
      payload: redactPII(params.cleanedPayload), status: 'info'
    });
  }

  public logDbWriteStart(params: { operation: DatabaseOperation; targetPath: string; sourceComponent: string; actionName: string; summary: string; payload?: any }): { entry: DataFlowLogEntry; startTime: number } {
    const startTime = Date.now();
    const now = new Date(startTime);
    const entry = this.push({
      id: `log_${secureRandomString(12)}`,
      timestamp: String(startTime), isoTime: now.toISOString(),
      stage: 'STAGE_3_FIRESTORE_WRITE', operation: params.operation,
      targetPath: params.targetPath, sourceComponent: params.sourceComponent,
      actionName: params.actionName, summary: params.summary,
      payload: redactPII(params.payload), status: 'info'
    });
    return { entry, startTime };
  }

  public logDbWriteSuccess(params: { operation: DatabaseOperation; targetPath: string; sourceComponent: string; actionName: string; startTime: number; summary: string; payload?: any }): DataFlowLogEntry {
    const now = new Date();
    return this.push({
      id: `log_${secureRandomString(12)}`,
      timestamp: String(now.getTime()), isoTime: now.toISOString(),
      stage: 'STAGE_4_FIRESTORE_ACK', operation: params.operation,
      targetPath: params.targetPath, sourceComponent: params.sourceComponent,
      actionName: params.actionName, summary: params.summary,
      payload: redactPII(params.payload), latencyMs: Math.max(0, Date.now() - params.startTime), status: 'success'
    });
  }

  public logDbWriteError(params: { operation: DatabaseOperation; targetPath: string; sourceComponent: string; actionName: string; startTime: number; summary: string; error: any }): DataFlowLogEntry {
    const now = new Date();
    return this.push({
      id: `log_${secureRandomString(12)}`,
      timestamp: String(now.getTime()), isoTime: now.toISOString(),
      stage: 'STAGE_4_FIRESTORE_ERROR', operation: params.operation,
      targetPath: params.targetPath, sourceComponent: params.sourceComponent,
      actionName: params.actionName, summary: params.summary,
      latencyMs: Math.max(0, Date.now() - params.startTime), status: 'error',
      errorMessage: String(params.error?.message || params.error || ''),
      errorCode: String(params.error?.code || '')
    });
  }
}

export const dbLogger = new DatabaseLoggerService();

export const calculateObjectDiff = (before: any, after: any): Record<string, { before: any; after: any }> => {
  const diff: Record<string, { before: any; after: any }> = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  keys.forEach(key => {
    const a = before?.[key];
    const b = after?.[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) diff[key] = { before: a, after: b };
  });
  return diff;
};
