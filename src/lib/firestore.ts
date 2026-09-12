import { doc, getDocFromServer } from 'firebase/firestore';
import { db } from '../firebase';

export async function pingFirestore(): Promise<boolean> {
  if (!db) {
    throw new Error('Firestore database instance is not initialized.');
  }
  try {
    // Attempt a lightweight server ping against public cms document
    await getDocFromServer(doc(db, 'cms', 'main'));
    return true;
  } catch (err: any) {
    // Check if it's a true offline / network failure
    const msg = (err?.message || '').toLowerCase();
    const isOffline = 
      msg.includes('offline') || 
      msg.includes('unavailable') || 
      msg.includes('network') || 
      err?.code === 'unavailable' ||
      err?.code === 'client-is-offline';

    if (isOffline) {
      throw err;
    }
    // For permission-denied, not-found, or other rule/schema responses, 
    // Firestore IS connected to the network/server successfully!
    return true;
  }
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  retries: number = 3,
  delay: number = 1000
): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    if (retries <= 0) {
      throw error;
    }
    // Check if error is transient / network / quota / unavailable
    const msg = (error?.message || '').toLowerCase();
    const isTransient = 
      msg.includes('unavailable') || 
      msg.includes('offline') || 
      msg.includes('network') || 
      msg.includes('deadline-exceeded') ||
      msg.includes('resource-exhausted') ||
      error?.code === 'unavailable' ||
      error?.code === 'resource-exhausted';

    if (!isTransient && retries === 3) {
      // For non-transient errors (e.g. permission-denied), maybe throw immediately or retry once
      // Let's allow retry for safety or throw if explicitly permission denied
      if (error?.code === 'permission-denied') {
        throw error;
      }
    }

    // Exponential backoff with jitter
    const jitter = Math.random() * 200;
    const nextDelay = delay * 2 + jitter;
    console.warn(`Firestore operation failed. Retrying in ${Math.round(nextDelay)}ms... (${retries} attempts left). Error: ${error?.message || error}`);
    
    await new Promise((resolve) => setTimeout(resolve, nextDelay));
    return retryWithBackoff(operation, retries - 1, nextDelay);
  }
}

