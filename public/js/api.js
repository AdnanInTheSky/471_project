(function () {
  const COMPARE_KEY = 'motosheba_compare_ids';

  async function request(path, options = {}) {
    const opts = {
      method: options.method || 'GET',
      credentials: 'same-origin',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    };

    if (options.body !== undefined) {
      opts.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    }

    const res = await fetch(path, opts);
    let data = {};
    try {
      data = await res.json();
    } catch (e) {
      data = {};
    }

    if (!res.ok) {
      const err = new Error(data.error || `Request failed with status ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function getCompareIds() {
    try {
      const raw = localStorage.getItem(COMPARE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
    } catch (e) {
      return [];
    }
  }

  function setCompareIds(ids) {
    const clean = Array.from(new Set(ids.filter(Boolean))).slice(0, 3);
    localStorage.setItem(COMPARE_KEY, JSON.stringify(clean));
    window.dispatchEvent(new CustomEvent('motosheba:compare', { detail: clean }));
    return clean;
  }

  function toggleCompare(id) {
    const strId = String(id);
    const current = getCompareIds();
    if (current.includes(strId)) {
      return {
        added: false,
        ids: setCompareIds(current.filter((x) => x !== strId))
      };
    }
    if (current.length >= 3) {
      throw new Error('You can compare up to 3 vehicles at a time.');
    }
    return {
      added: true,
      ids: setCompareIds([...current, strId])
    };
  }

  function formatBDT(amount) {
    const num = Number(amount || 0);
    if (!Number.isFinite(num)) return 'BDT 0';
    return 'BDT ' + num.toLocaleString('en-IN');
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (e) {
      return iso;
    }
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return iso;
    }
  }

  window.MotoApi = {
    request,
    get: (url) => request(url, { method: 'GET' }),
    post: (url, body) => request(url, { method: 'POST', body }),
    patch: (url, body) => request(url, { method: 'PATCH', body }),
    del: (url) => request(url, { method: 'DELETE' }),
    getCompareIds,
    setCompareIds,
    toggleCompare,
    clearCompare: () => setCompareIds([]),
    formatBDT,
    formatDate,
    formatDateTime
  };

  function renderNavbar() {
    const navMount = document.getElementById('motosheba-navbar');
    if (!navMount) return;

    const path = window.location.pathname;
    const isActive = (href) => {
      if (href === '/index.html' && (path === '/' || path === '/index.html')) return true;
      return path.endsWith(href);
    };

    navMount.innerHTML = `
      <header x-data="navbarShell()" x-init="init()" class="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40 shadow-sm">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex items-center justify-between h-16">
            <div class="flex items-center gap-6">
              <a href="/index.html" class="flex items-center gap-2.5 group">
                <div class="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-slate-950 text-lg shadow-sm group-hover:bg-emerald-400 transition">M</div>
                <div>
                  <span class="font-bold text-lg tracking-tight text-white">MotoSheba</span>
                  <span class="hidden sm:inline-block ml-1.5 text-[11px] font-medium px-2 py-0.5 rounded bg-slate-800 text-emerald-400 border border-slate-700">BD Auto Trust</span>
                </div>
              </a>
              <nav class="hidden md:flex items-center gap-1 text-sm">
                <a href="/listings.html" class="px-3 py-2 rounded-md font-medium transition ${isActive('/listings.html') ? 'bg-slate-800 text-emerald-400' : 'text-slate-300 hover:text-white hover:bg-slate-800/60'}">Browse Cars</a>
                <a href="/compare.html" class="px-3 py-2 rounded-md font-medium transition flex items-center gap-1.5 ${isActive('/compare.html') ? 'bg-slate-800 text-emerald-400' : 'text-slate-300 hover:text-white hover:bg-slate-800/60'}">
                  <span>Compare</span>
                  <span x-show="compareCount > 0" x-text="compareCount" class="px-1.5 py-0.2 text-xs rounded-full bg-emerald-500 text-slate-950 font-bold"></span>
                </a>
                <a href="/storefront.html" class="px-3 py-2 rounded-md font-medium transition ${isActive('/storefront.html') ? 'bg-slate-800 text-emerald-400' : 'text-slate-300 hover:text-white hover:bg-slate-800/60'}">Dealers</a>

                <template x-if="user && (user.role === 'seller' || user.role === 'dealer')">
                  <a href="/my-listings.html" class="px-3 py-2 rounded-md font-medium text-slate-300 hover:text-white hover:bg-slate-800/60">My Listings</a>
                </template>

                <template x-if="user && user.role === 'dealer'">
                  <div class="flex items-center gap-1 border-l border-slate-700 pl-2 ml-1">
                    <a href="/inventory.html" class="px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-800/80 text-emerald-300 hover:bg-slate-800">Inventory</a>
                    <a href="/leads.html" class="px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-800/80 text-emerald-300 hover:bg-slate-800">Leads</a>
                    <a href="/staff.html" class="px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-800/80 text-emerald-300 hover:bg-slate-800">Staff</a>
                  </div>
                </template>

                <template x-if="user && ['buyer','seller','dealer'].includes(user.role)">
                  <div class="flex items-center gap-1">
                    <a href="/inquiries.html" class="px-3 py-2 rounded-md font-medium text-slate-300 hover:text-white hover:bg-slate-800/60">Inquiries</a>
                    <a href="/reservations.html" class="px-3 py-2 rounded-md font-medium text-slate-300 hover:text-white hover:bg-slate-800/60">Reservations</a>
                  </div>
                </template>

                <template x-if="user && user.role === 'admin'">
                  <div class="flex items-center gap-1 border-l border-slate-700 pl-2 ml-1">
                    <a href="/admin-verify.html" class="px-2.5 py-1.5 rounded-md text-xs font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25">Verify Queue</a>
                    <a href="/admin-moderation.html" class="px-2.5 py-1.5 rounded-md text-xs font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25">Moderation</a>
                    <a href="/admin-users.html" class="px-2.5 py-1.5 rounded-md text-xs font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25">Users</a>
                    <a href="/admin-audit.html" class="px-2.5 py-1.5 rounded-md text-xs font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25">Audit Log</a>
                  </div>
                </template>
              </nav>
            </div>

            <div class="flex items-center gap-3">
              <template x-if="!loaded">
                <span class="text-xs text-slate-400">Loading...</span>
              </template>

              <template x-if="loaded && !user">
                <div class="flex items-center gap-2">
                  <a href="/login.html" class="px-3.5 py-1.5 rounded-lg text-sm font-medium text-slate-200 hover:text-white hover:bg-slate-800 transition">Sign In</a>
                  <a href="/register.html" class="px-3.5 py-1.5 rounded-lg text-sm font-semibold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition">Register</a>
                </div>
              </template>

              <template x-if="loaded && user">
                <div class="flex items-center gap-2.5">
                  <a href="/profile.html" class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 transition">
                    <span class="text-xs font-semibold text-white" x-text="user.name"></span>
                    <span class="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" x-text="user.role"></span>
                    <span x-show="user.verified" title="Verified Account" class="text-emerald-400 text-xs">✓</span>
                  </a>
                  <button @click="logout()" class="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-red-500/20 border border-transparent hover:border-red-500/40 transition">Logout</button>
                </div>
              </template>
            </div>
          </div>
        </div>
      </header>
    `;
  }

  function renderFooter() {
    const footerMount = document.getElementById('motosheba-footer');
    if (!footerMount) return;

    footerMount.innerHTML = `
      <footer class="bg-slate-900 text-slate-400 border-t border-slate-800 mt-16">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div class="md:col-span-2">
              <div class="flex items-center gap-2 mb-3">
                <div class="w-7 h-7 rounded bg-emerald-500 flex items-center justify-center font-bold text-slate-950 text-sm">M</div>
                <span class="font-bold text-white text-base">MotoSheba</span>
              </div>
              <p class="text-xs text-slate-400 leading-relaxed max-w-md">
                Transparent vehicle marketplace, dealer storefronts, and verified transaction workflows for Bangladesh.
                All verification flags and calculations are decision-support tools for human review—never official credit scores, approvals, or BRTA ownership certificates.
              </p>
            </div>
            <div>
              <h4 class="text-xs font-semibold uppercase tracking-wider text-slate-200 mb-3">Marketplace</h4>
              <ul class="space-y-2 text-xs">
                <li><a href="/listings.html" class="hover:text-white">Search Vehicles</a></li>
                <li><a href="/compare.html" class="hover:text-white">Compare Up to 3 Cars</a></li>
                <li><a href="/storefront.html" class="hover:text-white">Verified Dealer Showrooms</a></li>
                <li><a href="/reservations.html" class="hover:text-white">Reservation Timeline</a></li>
              </ul>
            </div>
            <div>
              <h4 class="text-xs font-semibold uppercase tracking-wider text-slate-200 mb-3">Account & Governance</h4>
              <ul class="space-y-2 text-xs">
                <li><a href="/login.html" class="hover:text-white">Sign In / Switch Role</a></li>
                <li><a href="/profile.html" class="hover:text-white">Seller & Dealer Verification</a></li>
                <li><a href="/admin-verify.html" class="hover:text-white">Admin Verification Queue</a></li>
                <li><a href="/admin-audit.html" class="hover:text-white">System Audit Log</a></li>
              </ul>
            </div>
          </div>
          <div class="border-t border-slate-800 mt-8 pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500">
            <span>© 2026 MotoSheba Prototype · Phase 0 & Phase 1 Marketplace Foundation</span>
            <span>Stack: HTML + Tailwind CDN + Alpine.js + Serverless API + MongoDB</span>
          </div>
        </div>
      </footer>
    `;
  }

  window.navbarShell = function () {
    return {
      loaded: false,
      user: null,
      profile: null,
      compareCount: getCompareIds().length,
      async init() {
        window.addEventListener('motosheba:compare', (e) => {
          this.compareCount = (e.detail || []).length;
        });
        try {
          const data = await window.MotoApi.get('/api/auth/me');
          this.user = data.user || null;
          this.profile = data.profile || null;
          window.MotoCurrentUser = this.user;
          window.MotoCurrentProfile = this.profile;
          window.dispatchEvent(new CustomEvent('motosheba:auth', { detail: data }));
        } catch (err) {
          this.user = null;
        } finally {
          this.loaded = true;
        }
      },
      async logout() {
        await window.MotoApi.post('/api/auth/logout', {});
        window.location.href = '/login.html';
      }
    };
  };

  document.addEventListener('DOMContentLoaded', () => {
    renderNavbar();
    renderFooter();
  });
})();
