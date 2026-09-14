declare module 'firebase/firestore' {
  export type DocumentData = Record<string, any>;
  export type QueryConstraint = any;
  export type Firestore = any;
  export type CollectionReference<T = DocumentData> = any;
  export type DocumentReference<T = DocumentData> = any;
  export type Query<T = DocumentData> = any;
  export type QuerySnapshot<T = DocumentData> = {
    docs: Array<{ id: string; data(): T; exists(): boolean }>;
    empty: boolean;
    size: number;
    forEach(callback: (doc: { id: string; data(): T; exists(): boolean }) => void): void;
  };
  export type DocumentSnapshot<T = DocumentData> = {
    id: string;
    data(): T;
    exists(): boolean;
  };
  export const collection: any;
  export const doc: any;
  export const query: any;
  export const where: any;
  export const orderBy: any;
  export const limit: any;
  export const getDocs: any;
  export const getDoc: any;
  export const addDoc: any;
  export const setDoc: any;
  export const updateDoc: any;
  export const deleteDoc: any;
  export const onSnapshot: any;
  export const writeBatch: any;
  export const serverTimestamp: any;
  export const Timestamp: any;
  export const documentId: any;
  export const FieldPath: any;
}
