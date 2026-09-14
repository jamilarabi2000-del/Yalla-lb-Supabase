declare module 'firebase/firestore' {
  export type DocumentData = Record<string, any>;
  export type SetOptions = { merge?: boolean };
  export type FirestoreDataConverter<T> = { toFirestore(value: T): DocumentData; fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): T };
  export type SnapshotOptions = { serverTimestamps?: 'estimate' | 'previous' | 'none' };
  export type QueryDocumentSnapshot<T = DocumentData> = { id: string; data(options?: SnapshotOptions): T; exists(): true; ref?: any };
  export type QuerySnapshot<T = DocumentData> = { docs: QueryDocumentSnapshot<T>[]; empty: boolean; size: number; forEach(callback: (doc: QueryDocumentSnapshot<T>) => void): void };
  export type DocumentSnapshot<T = DocumentData> = { id: string; data(options?: SnapshotOptions): T | undefined; exists(): boolean; ref?: any };
  export type CollectionReference<T = DocumentData> = any;
  export type DocumentReference<T = DocumentData> = any;
  export type Query<T = DocumentData> = any;
  export type QueryConstraint = any;
  export type WriteBatch = any;
  export type Firestore = any;
  export const collection: <T = DocumentData>(db: any, ...segments: string[]) => CollectionReference<T>;
  export const doc: <T = DocumentData>(dbOrCollection: any, ...segments: string[]) => DocumentReference<T>;
  export const query: <T = DocumentData>(source: Query<T>, ...constraints: QueryConstraint[]) => Query<T>;
  export const where: (field: string, op: string, value: unknown) => QueryConstraint;
  export const orderBy: (field: string, direction?: 'asc' | 'desc') => QueryConstraint;
  export const limit: (count: number) => QueryConstraint;
  export const getDocs: <T = DocumentData>(q: Query<T>) => Promise<QuerySnapshot<T>>;
  export const getDoc: <T = DocumentData>(ref: DocumentReference<T>) => Promise<DocumentSnapshot<T>>;
  export const getDocFromServer: <T = DocumentData>(ref: DocumentReference<T>) => Promise<DocumentSnapshot<T>>;
  export const addDoc: (ref: any, data: DocumentData) => Promise<{ id: string }>;
  export const setDoc: (ref: any, data: DocumentData, options?: SetOptions) => Promise<void>;
  export const updateDoc: (ref: any, data: DocumentData) => Promise<void>;
  export const deleteDoc: (ref: any) => Promise<void>;
  export const onSnapshot: <T = DocumentData>(q: Query<T>, onNext: (snapshot: QuerySnapshot<T>) => void, onError?: (error: any) => void) => () => void;
  export const writeBatch: (db: any) => WriteBatch;
  export const serverTimestamp: () => string;
  export const Timestamp: any;
  export const documentId: () => string;
  export class FieldPath { constructor(...parts: string[]); }
}
