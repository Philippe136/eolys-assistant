/* ── Vox — Shared app behaviours ────────────────────────────────────────── */

// ── Haptic feedback ──────────────────────────────────────────────────────────
function haptic(pattern = [10]) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

// Vibration légère sur tous les boutons principaux
document.addEventListener('pointerdown', e => {
  const btn = e.target.closest('button, .btn-primary, .btn-record, [role="button"]');
  if (btn && !btn.disabled) haptic([8]);
}, { passive: true });

// ── Prefetch au survol/touch des liens de navigation ─────────────────────────
const prefetched = new Set();
function prefetch(href) {
  if (!href || prefetched.has(href) || href.startsWith('#') || href.startsWith('http')) return;
  prefetched.add(href);
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = href;
  document.head.appendChild(link);
}

document.addEventListener('pointerover', e => {
  const a = e.target.closest('a[href]');
  if (a) prefetch(a.getAttribute('href'));
}, { passive: true });

// ── Pull-to-refresh natif désactivé (évite le rechargement accidentel) ───────
let startY = 0;
document.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, { passive: true });
document.addEventListener('touchmove', e => {
  if (document.scrollingElement.scrollTop === 0 && e.touches[0].clientY > startY + 10) {
    e.preventDefault();
  }
}, { passive: false });

// ── Barre secondaire mobile (Notes / Dossiers / ⚙️) ─────────────────────────
(function injectSecondaryNav() {
  if (window.innerWidth > 640) return;
  const path = location.pathname;
  // Ne pas injecter sur la page login
  if (path === '/' || path === '/login') return;
  const header = document.querySelector('header');
  if (!header) return;
  // Vérifie qu'on n'a pas déjà injecté
  if (document.getElementById('secondary-nav')) return;
  const bar = document.createElement('div');
  bar.id = 'secondary-nav';
  bar.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 16px;background:var(--surface);border-bottom:1px solid var(--border);font-family:Inter,sans-serif;font-size:12px;overflow-x:auto;-webkit-overflow-scrolling:touch;';
  const links = [
    { href: '/dashboard', label: '📝 Notes' },
    { href: '/folders', label: '📂 Dossiers' },
    { href: '/settings', label: '⚙️ Réglages' },
  ];
  bar.innerHTML = links.map(l => {
    const active = path === l.href ? 'color:var(--accent);font-weight:700' : 'color:var(--ink-muted);font-weight:500';
    return `<a href="${l.href}" style="${active};text-decoration:none;padding:4px 10px;border-radius:6px;white-space:nowrap;background:var(--surface2);transition:color .15s">${l.label}</a>`;
  }).join('');
  header.after(bar);
})();

// ── Navigation active : marque le lien courant dans la bottom nav ─────────────
(function markActiveNav() {
  const path = location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.mobile-nav a').forEach(a => {
    const href = a.getAttribute('href')?.replace(/\/$/, '') || '/';
    if (href === path) {
      a.classList.add('active');
      a.setAttribute('aria-current', 'page');
    } else {
      a.classList.remove('active');
      a.removeAttribute('aria-current');
    }
  });
})();
