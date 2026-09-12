import fs from 'fs';
import path from 'path';
import { getFirestore } from 'firebase-admin/firestore';

const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
if (!fs.existsSync(configPath)) {
  throw new Error(`Cannot find configuration file at ${configPath}`);
}

const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));

export const firestoreDatabaseId = cfg.firestoreDatabaseId;
export const projectId = cfg.projectId;

/**
 * Returns a Firestore instance targeting the application's configured named database.
 */
export const getDb = () => {
  if (!cfg.firestoreDatabaseId) {
    throw new Error('firestoreDatabaseId is not defined in firebase-applet-config.json');
  }
  return getFirestore(cfg.firestoreDatabaseId);
};
