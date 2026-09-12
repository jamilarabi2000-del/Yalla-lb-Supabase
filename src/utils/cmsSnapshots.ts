import { SiteContent } from '../types';
import { db, IS_FIREBASE_ENABLED } from '../firebase';
import { secureRandomString } from './uuid';
import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  query, 
  orderBy, 
  limit, 
  deleteDoc 
} from 'firebase/firestore';

export interface CmsSnapshot {
  id: string;
  timestamp: string;
  author: string;
  note?: string;
  changesCount: number;
  data: SiteContent;
  isRemote?: boolean;
}

export interface CmsDiffItem {
  tab: string;
  tabLabel: string;
  path: string;
  label: string;
  before: any;
  after: any;
  type: 'modified' | 'added' | 'removed';
}

const STORAGE_KEY = 'yalla_cms_history_snapshots_v1';
const REMOTE_COLLECTION = 'cms_versions';

export const getCmsSnapshots = (): CmsSnapshot[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Failed to load CMS snapshots from local storage:', e);
    return [];
  }
};

export const saveCmsSnapshot = (data: SiteContent, author = 'Admin', note?: string, changesCount = 1): CmsSnapshot => {
  const newSnapshot: CmsSnapshot = {
    id: `snap_${Date.now()}_${secureRandomString(5)}`,
    timestamp: new Date().toISOString(),
    author,
    note: note || 'CMS live update published',
    changesCount,
    data: JSON.parse(JSON.stringify(data))
  };

  try {
    const snapshots = getCmsSnapshots();
    // Keep up to 10 recent revisions in local storage to prevent storage quota exhaustion
    const updated = [newSnapshot, ...snapshots].slice(0, 10);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // If quota exceeded, try keeping only the latest 2 snapshots
      const minimal = [newSnapshot, snapshots[0]].filter(Boolean);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(minimal));
    }
  } catch (e) {
    console.warn('Could not save CMS snapshot to local storage (quota or storage restricted):', e);
  }

  // Also asynchronously persist to Firestore cms_versions if Firebase is active
  void saveCmsSnapshotRemote(newSnapshot);

  return newSnapshot;
};

/**
 * Persists snapshot to Firestore `cms_versions` collection
 */
export const saveCmsSnapshotRemote = async (snapshot: CmsSnapshot): Promise<boolean> => {
  if (!IS_FIREBASE_ENABLED || !db) return false;
  try {
    const docRef = doc(collection(db, REMOTE_COLLECTION), snapshot.id);
    await setDoc(docRef, {
      ...snapshot,
      createdAt: new Date().toISOString()
    });
    // Fire and forget pruning older snapshots beyond 30
    void pruneCmsSnapshotsRemote();
    return true;
  } catch (err) {
    console.warn('[cmsSnapshots] Could not save remote snapshot to Firestore:', err);
    return false;
  }
};

/**
 * Fetches recent snapshots from Firestore `cms_versions`
 */
export const getCmsSnapshotsRemote = async (): Promise<CmsSnapshot[] | null> => {
  if (!IS_FIREBASE_ENABLED || !db) return null;
  try {
    const q = query(collection(db, REMOTE_COLLECTION), orderBy('timestamp', 'desc'), limit(30));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const remoteList: CmsSnapshot[] = [];
    snap.forEach(docItem => {
      const data = docItem.data();
      remoteList.push({
        id: docItem.id,
        timestamp: data.timestamp || new Date().toISOString(),
        author: data.author || 'Admin',
        note: data.note || 'Version snapshot',
        changesCount: typeof data.changesCount === 'number' ? data.changesCount : 1,
        data: data.data,
        isRemote: true
      });
    });
    // Cache the remote list locally too
    if (remoteList.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteList));
      } catch {}
    }
    return remoteList;
  } catch (err) {
    console.warn('[cmsSnapshots] Failed to fetch remote snapshots:', err);
    return null;
  }
};

/**
 * Prunes remote snapshots in Firestore to the 30 most recent
 */
export const pruneCmsSnapshotsRemote = async (): Promise<void> => {
  if (!IS_FIREBASE_ENABLED || !db) return;
  try {
    const q = query(collection(db, REMOTE_COLLECTION), orderBy('timestamp', 'desc'), limit(45));
    const snap = await getDocs(q);
    if (snap.size > 30) {
      const docsToDelete = snap.docs.slice(30);
      for (const d of docsToDelete) {
        await deleteDoc(d.ref).catch(() => {});
      }
    }
  } catch {}
};

export const deleteCmsSnapshot = (id: string): CmsSnapshot[] => {
  try {
    const snapshots = getCmsSnapshots();
    const updated = snapshots.filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    if (IS_FIREBASE_ENABLED && db) {
      deleteDoc(doc(db, REMOTE_COLLECTION, id)).catch(() => {});
    }
    return updated;
  } catch (e) {
    console.error('Failed to delete CMS snapshot:', e);
    return getCmsSnapshots();
  }
};

export const clearAllCmsSnapshots = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear snapshots:', e);
  }
};

const TAB_LABELS: Record<string, string> = {
  visibility: 'Section Visibility',
  navbar: 'Navbar & Header',
  hero: 'Hero Banner',
  offers: 'Offers & Promos',
  home: 'Home Page Sections',
  productsPage: 'Catalog Page',
  productDetailPage: 'Product Detail',
  checkoutPage: 'Checkout Page',
  checkoutSuccessPage: 'Checkout Success',
  accountPage: 'Patron Account',
  newsSection: 'News & Press',
  footer: 'Footer & Support',
  socialLinks: 'Social Links',
  customBlocks: 'Custom Visual Blocks',
  seo: 'SEO & SERP',
  theme: 'Theme & Styling'
};

export const computeCmsDiff = (original: Partial<SiteContent> = {}, current: Partial<SiteContent> = {}): CmsDiffItem[] => {
  const diffs: CmsDiffItem[] = [];

  const compareObjects = (origObj: any, currObj: any, tabKey: string, parentPath = '') => {
    if (!origObj && !currObj) return;
    const allKeys = Array.from(new Set([...Object.keys(origObj || {}), ...Object.keys(currObj || {})]));

    for (const key of allKeys) {
      const origVal = origObj ? origObj[key] : undefined;
      const currVal = currObj ? currObj[key] : undefined;
      const currentPath = parentPath ? `${parentPath}.${key}` : key;
      const formattedLabel = key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .replace(/Arabic$/, ' (Arabic)')
        .replace(/Ar$/, ' (Arabic)')
        .replace(/En$/, ' (English)');

      if (typeof currVal === 'object' && currVal !== null && !Array.isArray(currVal)) {
        compareObjects(origVal, currVal, tabKey, currentPath);
      } else if (Array.isArray(currVal) || Array.isArray(origVal)) {
        const origJson = JSON.stringify(origVal || []);
        const currJson = JSON.stringify(currVal || []);
        if (origJson !== currJson) {
          diffs.push({
            tab: tabKey,
            tabLabel: TAB_LABELS[tabKey] || tabKey,
            path: currentPath,
            label: formattedLabel,
            before: origVal,
            after: currVal,
            type: !origVal ? 'added' : !currVal ? 'removed' : 'modified'
          });
        }
      } else if (origVal !== currVal) {
        diffs.push({
          tab: tabKey,
          tabLabel: TAB_LABELS[tabKey] || tabKey,
          path: currentPath,
          label: formattedLabel,
          before: origVal,
          after: currVal,
          type: origVal === undefined ? 'added' : currVal === undefined ? 'removed' : 'modified'
        });
      }
    }
  };

  const topSections = Array.from(new Set([...Object.keys(original || {}), ...Object.keys(current || {})]));
  for (const section of topSections) {
    compareObjects((original as any)[section], (current as any)[section], section);
  }

  return diffs;
};

export const computeCmsDiffs = computeCmsDiff;
