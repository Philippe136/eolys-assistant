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
