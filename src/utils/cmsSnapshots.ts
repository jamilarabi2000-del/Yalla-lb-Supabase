import { SiteContent } from '../types';
import { supabase } from '../lib/supabase';
import { secureRandomString } from './uuid';

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

const STORAGE_KEY = 'yalla_cms_history_snapshots_v2';
const MAX_LOCAL = 20;
const MAX_REMOTE = 30;

export const getCmsSnapshots = (): CmsSnapshot[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveCmsSnapshot = (
  data: SiteContent,
  author = 'Admin',
  note?: string,
  changesCount = 1
): CmsSnapshot => {
  const snapshot: CmsSnapshot = {
    id: `snap_${Date.now()}_${secureRandomString(5)}`,
    timestamp: new Date().toISOString(),
    author,
    note: note || 'CMS live update published',
    changesCount: Math.max(1, Number(changesCount) || 1),
    data: JSON.parse(JSON.stringify(data))
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([snapshot, ...getCmsSnapshots()].slice(0, MAX_LOCAL)));
  } catch {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([snapshot])); } catch {}
  }

  void saveCmsSnapshotRemote(snapshot);
  return snapshot;
};

export const saveCmsSnapshotRemote = async (snapshot: CmsSnapshot): Promise<boolean> => {
  try {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return false;

    const { error } = await supabase.from('cms_content_versions').insert({
      content: snapshot.data,
      published: true,
      created_by: authData.user.id,
      author: snapshot.author,
      note: snapshot.note || null,
      changes_count: snapshot.changesCount
    });
    if (error) throw error;
    void pruneCmsSnapshotsRemote();
    return true;
  } catch (err) {
    console.warn('[cmsSnapshots] Could not save remote Supabase snapshot:', err);
    return false;
  }
};

export const getCmsSnapshotsRemote = async (): Promise<CmsSnapshot[] | null> => {
  try {
    const { data, error } = await supabase
      .from('cms_content_versions')
      .select('id, content, published, created_by, created_at, author, note, changes_count')
      .order('created_at', { ascending: false })
      .limit(MAX_REMOTE);
    if (error) throw error;
    if (!data || data.length === 0) return null;

    const remoteList: CmsSnapshot[] = data.map((row: any) => ({
      id: String(row.id),
      timestamp: row.created_at || new Date().toISOString(),
      author: row.author || 'Admin',
      note: row.note || 'Version snapshot',
      changesCount: Math.max(1, Number(row.changes_count) || 1),
      data: (row.content || {}) as SiteContent,
      isRemote: true
    }));

    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteList)); } catch {}
    return remoteList;
  } catch (err) {
    console.warn('[cmsSnapshots] Failed to fetch remote Supabase snapshots:', err);
    return null;
  }
};

export const pruneCmsSnapshotsRemote = async (): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('cms_content_versions')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(MAX_REMOTE + 15);
    if (error || !data || data.length <= MAX_REMOTE) return;

    const staleIds = data.slice(MAX_REMOTE).map((row: any) => row.id);
    if (staleIds.length) {
      await supabase.from('cms_content_versions').delete().in('id', staleIds);
    }
  } catch {
    // Pruning is best-effort; RLS remains authoritative.
  }
};

export const deleteCmsSnapshot = (id: string): CmsSnapshot[] => {
  const next = getCmsSnapshots().filter(snapshot => snapshot.id !== id);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  // Remote rows are intentionally immutable from this helper because the current
  // Supabase RLS contract grants admin INSERT/SELECT for snapshot history.
  return next;
};

export const clearAllCmsSnapshots = (): void => {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
};

const TAB_LABELS: Record<string, string> = {
  visibility: 'Section Visibility', navbar: 'Navbar & Header', hero: 'Hero Banner', offers: 'Offers & Promos',
  home: 'Home Page Sections', productsPage: 'Catalog Page', productDetailPage: 'Product Detail',
  checkoutPage: 'Checkout Page', checkoutSuccessPage: 'Checkout Success', accountPage: 'Patron Account',
  newsSection: 'News & Press', footer: 'Footer & Support', socialLinks: 'Social Links',
  customBlocks: 'Custom Visual Blocks', seo: 'SEO & SERP', theme: 'Theme & Styling'
};

export const computeCmsDiff = (original: Partial<SiteContent> = {}, current: Partial<SiteContent> = {}): CmsDiffItem[] => {
  const diffs: CmsDiffItem[] = [];
  const compareObjects = (origObj: any, currObj: any, tabKey: string, parentPath = '') => {
    if (!origObj && !currObj) return;
    const allKeys = Array.from(new Set([...Object.keys(origObj || {}), ...Object.keys(currObj || {})]));
    for (const key of allKeys) {
      const origVal = origObj?.[key];
      const currVal = currObj?.[key];
      const path = parentPath ? `${parentPath}.${key}` : key;
      const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).replace(/Arabic$/, ' (Arabic)').replace(/Ar$/, ' (Arabic)').replace(/En$/, ' (English)');
      if (typeof currVal === 'object' && currVal !== null && !Array.isArray(currVal)) {
        compareObjects(origVal, currVal, tabKey, path);
      } else if (Array.isArray(currVal) || Array.isArray(origVal)) {
        if (JSON.stringify(origVal || []) !== JSON.stringify(currVal || [])) {
          diffs.push({ tab: tabKey, tabLabel: TAB_LABELS[tabKey] || tabKey, path, label, before: origVal, after: currVal, type: !origVal ? 'added' : !currVal ? 'removed' : 'modified' });
        }
      } else if (origVal !== currVal) {
        diffs.push({ tab: tabKey, tabLabel: TAB_LABELS[tabKey] || tabKey, path, label, before: origVal, after: currVal, type: origVal === undefined ? 'added' : currVal === undefined ? 'removed' : 'modified' });
      }
    }
  };
  for (const section of Array.from(new Set([...Object.keys(original || {}), ...Object.keys(current || {})]))) {
    compareObjects((original as any)[section], (current as any)[section], section);
  }
  return diffs;
};

export const computeCmsDiffs = computeCmsDiff;
