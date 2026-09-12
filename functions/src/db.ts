import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getApps, initializeApp } from 'firebase-admin/app';
import * as path from 'path';
import * as fs from 'fs';

export function getDatabaseId(): string | undefined {
  if (process.env.FIRESTORE_DATABASE_ID) {
    return process.env.FIRESTORE_DATABASE_ID;
  }
  if (process.env.FIRESTORE_DB_ID) {
    return process.env.FIRESTORE_DB_ID;
  }
  const candidatePaths = [
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
    path.resolve(process.cwd(), '../firebase-applet-config.json'),
    path.resolve(process.cwd(), '../../firebase-applet-config.json'),
    path.resolve(__dirname, '../firebase-applet-config.json'),
    path.resolve(__dirname, '../../firebase-applet-config.json'),
    path.resolve(__dirname, '../../../firebase-applet-config.json'),
  ];
  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        const config = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (config.firestoreDatabaseId) {
          return config.firestoreDatabaseId;
        }
      }
    } catch {}
  }
  return 'ai-studio-yallalb-1415b490-9de7-4a31-acee-0f9c6439c18c';
}

export function getDb(): Firestore {
  const adminApp = getApps().length === 0 ? initializeApp() : getApps()[0];
  const dbId = getDatabaseId();
  if (dbId) {
    return getFirestore(adminApp, dbId);
  }
  return getFirestore(adminApp);
}
