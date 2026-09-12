#!/usr/bin/env node
/**
 * scripts/publish-cms.mjs
 *
 * Reads documents from the admin-only `cms` collection, sanitizes and projects
 * them to the public `cms_public` collection so storefront visitors can view
 * published banners, announcements, and site content without permissions errors.
 *
 * Usage:
 *   node scripts/publish-cms.mjs --dry-run
 *   node scripts/publish-cms.mjs
 */

import { getDb, getResolvedDbId } from './lib/db.mjs';

const isDryRun = process.argv.includes('--dry-run');

function filterPublicContent(data) {
  if (!data || typeof data !== 'object') return data;
  const clean = JSON.parse(JSON.stringify(data));

  // Strip internal / draft / audit fields
  delete clean.drafts;
  delete clean.draftHistory;
  delete clean.auditTrail;
  delete clean.internalNotes;
  delete clean.lastModifiedBy;

  // Filter unpublished custom blocks
  if (Array.isArray(clean.customBlocks)) {
    clean.customBlocks = clean.customBlocks.filter(b => b && b.isPublished !== false);
  }

  // Filter unpublished news articles
  if (clean.newsSection && Array.isArray(clean.newsSection.articles)) {
    clean.newsSection.articles = clean.newsSection.articles.filter(a => a && a.isPublished !== false);
  }

  // Filter unpublished promo slider slides
  if (clean.promoBanner && Array.isArray(clean.promoBanner.slides)) {
    clean.promoBanner.slides = clean.promoBanner.slides.filter(s => s && s.isPublished !== false);
  }

  // Filter unpublished hero media items
  if (clean.hero && Array.isArray(clean.hero.bgMediaItems)) {
    clean.hero.bgMediaItems = clean.hero.bgMediaItems.filter(m => m && m.isPublished !== false);
  }

  return clean;
}

async function run() {
  const db = getDb();
  const dbId = getResolvedDbId();
  console.log(`[publish-cms] Target database: "${dbId}"`);
  console.log(`[publish-cms] Mode: ${isDryRun ? 'DRY-RUN (read-only)' : 'LIVE EXECUTION'}`);

  const cmsSnapshot = await db.collection('cms').get();
  console.log(`[publish-cms] Found ${cmsSnapshot.size} document(s) in 'cms' collection.`);

  if (cmsSnapshot.empty) {
    console.log('[publish-cms] No CMS documents found to publish.');
    return;
  }

  let count = 0;
  for (const docSnap of cmsSnapshot.docs) {
    const docId = docSnap.id;
    const rawData = docSnap.data();
    const publicData = filterPublicContent(rawData);

    console.log(`[publish-cms] Processing doc "${docId}" (${Object.keys(publicData).length} public keys)...`);

    if (!isDryRun) {
      await db.collection('cms_public').doc(docId).set(publicData, { merge: true });
      console.log(`[publish-cms] ✓ Published "cms_public/${docId}"`);
    } else {
      console.log(`[publish-cms] [DRY RUN] Would write to "cms_public/${docId}"`);
    }
    count++;
  }

  console.log(`\n[publish-cms] Complete. ${count} document(s) projected to 'cms_public'.`);
}

run().catch((err) => {
  console.error('[publish-cms] Fatal error:', err);
  process.exit(1);
});
