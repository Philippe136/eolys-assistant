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

  const calls = await sql`
    SELECT c.id, c.created_at, c.call_type, c.project_name, c.status,
           c.titre, c.resume, c.actions, c.email,
           c.trello_url, c.outlook_draft_url
    FROM calls c
    ORDER BY c.created_at DESC
    LIMIT 1000
  `;

  // Récupérer les actions cochables
  if (calls.length) {
    const ids = calls.map(c => c.id);
    const actionRows = await sql`
      SELECT call_id, text, done, position
      FROM call_actions
      WHERE call_id = ANY(${ids}::uuid[])
      ORDER BY call_id, position
    `;
    const byCall = {};
    for (const a of actionRows) {
      if (!byCall[a.call_id]) byCall[a.call_id] = [];
      byCall[a.call_id].push(`[${a.done ? 'x' : ' '}] ${a.text}`);
    }
    for (const c of calls) {
      if (!c._actionItems) c._actionItems = byCall[c.id] || null;
    }
  }

  const headers = [
    'Date', 'Type', 'Projet', 'Statut', 'Titre', 'Résumé',
    'Actions', 'Email', 'Trello', 'Outlook',
  ];

  const rows = calls.map(c => {
    // Préférer les actions cochables (V2) ; sinon JSONB legacy (V1)
    let actionsStr = '';
    if (c._actionItems && c._actionItems.length) {
      actionsStr = c._actionItems.join(' | ');
    } else if (Array.isArray(c.actions)) {
      actionsStr = c.actions.join(' | ');
    }

    return [
      new Date(c.created_at).toLocaleDateString('fr-FR'),
      c.call_type || '',
      c.project_name || '',
      c.status || '',
      c.titre || '',
      c.resume || '',
      actionsStr,
      c.email || '',
      c.trello_url || '',
      c.outlook_draft_url || '',
    ].map(csvEsc).join(',');
  });

  const csv    = [headers.join(','), ...rows].join('\r\n');
  const today  = new Date().toISOString().slice(0, 10);
  const fname  = `eolys-appels-${today}.csv`;

  // BOM UTF-8 pour ouverture correcte dans Excel
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  return res.status(200).end('\uFEFF' + csv);
}
