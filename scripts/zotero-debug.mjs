#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.ZOTERO_BASE_URL ?? 'http://127.0.0.1:23119';
const apiKey = process.env.ZOTERO_API_KEY ?? '';
const itemKey = process.argv[2];

if (!itemKey) {
  console.error('Usage: node scripts/zotero-debug.mjs <zotero_item_key>');
  process.exit(1);
}

const headers = {
  Accept: 'application/json',
  ...(apiKey ? { 'Zotero-API-Key': apiKey } : {}),
};

async function getJson(endpoint) {
  const response = await fetch(`${baseUrl}${endpoint}`, { headers });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${endpoint}: ${text}`);
  }

  return JSON.parse(text);
}

function itemType(entry) {
  return entry?.data?.itemType ?? '';
}

const item = await getJson(`/api/users/0/items/${encodeURIComponent(itemKey)}`);
const children = await getJson(`/api/users/0/items/${encodeURIComponent(itemKey)}/children?limit=200`);
const attachmentKeys = children.filter((entry) => itemType(entry) === 'attachment').map((entry) => entry.key);

const annotationsByAttachment = [];
for (const attachmentKey of attachmentKeys) {
  const attachmentChildren = await getJson(`/api/users/0/items/${encodeURIComponent(attachmentKey)}/children?limit=200`);
  annotationsByAttachment.push({
    attachmentKey,
    attachmentChildren,
    annotationChildren: attachmentChildren.filter((entry) => itemType(entry) === 'annotation'),
  });
}

const payload = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  item,
  children,
  annotationsByAttachment,
};

const outputPath = path.join(process.cwd(), `zotero-debug-${itemKey}.json`);
fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
console.log(`Wrote debug payload to ${outputPath}`);
