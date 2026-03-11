import { cors, requireSession } from '../lib/auth.js';
import { sql } from '../lib/db.js';

/** Échappe une valeur pour le format CSV (RFC 4180). */
function csvEsc(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export default async function handler(req, res) {
  cors(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireSession(req, res)) return;

  const entries = await sql`
    SELECT e.id, e.created_at, e.source, e.category, e.status,
           e.title, e.summary, e.tags, e.email_draft
    FROM entries e
    WHERE e.archived = false
    ORDER BY e.created_at DESC
    LIMIT 1000
  `;

  // Récupérer les items
  if (entries.length) {
    const ids = entries.map(e => e.id);
    const itemRows = await sql`
      SELECT entry_id, type, text, done, position
      FROM items
      WHERE entry_id = ANY(${ids}::uuid[])
      ORDER BY entry_id, position
    `;
    const byEntry = {};
    for (const i of itemRows) {
      if (!byEntry[i.entry_id]) byEntry[i.entry_id] = [];
      byEntry[i.entry_id].push(`[${i.done ? 'x' : ' '}][${i.type}] ${i.text}`);
    }
    for (const e of entries) e._items = byEntry[e.id] || null;
  }

  const headers = [
    'Date', 'Catégorie', 'Source', 'Statut', 'Titre', 'Résumé',
    'Tags', 'Items', 'Email draft',
  ];

  const rows = entries.map(e => {
    const itemsStr = (e._items || []).join(' | ');
    return [
      new Date(e.created_at).toLocaleDateString('fr-FR'),
      e.category || '',
      e.source || '',
      e.status || '',
      e.title || '',
      e.summary || '',
      (e.tags || []).join(', '),
      itemsStr,
      e.email_draft ? e.email_draft.substring(0, 200) : '',
    ].map(csvEsc).join(',');
  });

  const csv    = [headers.join(','), ...rows].join('\r\n');
  const today  = new Date().toISOString().slice(0, 10);
  const fname  = `vox-export-${today}.csv`;

  // BOM UTF-8 pour ouverture correcte dans Excel
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  return res.status(200).end('\uFEFF' + csv);
}
