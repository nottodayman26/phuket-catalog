// ── FLOX TOPBAR — единый модуль для всех страниц ─────────────────────────
// Подключать в <head>: <script src="topbar.js"></script>
// В <body> первым элементом: <div id="flox-topbar"></div>
// После загрузки вызывается window.initTopbar(options)
// options = { activePage: 'search'|'project'|'unit', meetingBtnId: 'meetingBtn' }

(function() {
  // ── CSS ──────────────────────────────────────────────────────────────────
  const CSS = `
.flox-topbar{
  position:sticky;top:0;z-index:200;
  background:var(--surface);border-bottom:0.5px solid var(--line);
  display:flex;align-items:center;padding:0 24px;height:52px;gap:0;
  font-family:'Inter',system-ui,sans-serif;
}
.flox-tb-logo{
  font-size:20px;font-weight:700;letter-spacing:-0.05em;
  color:var(--text);text-decoration:none;margin-right:32px;
  display:flex;align-items:center;gap:2px;
}
.flox-tb-logo-dot{width:6px;height:6px;border-radius:50%;background:#E8441A;margin-bottom:9px;flex-shrink:0;}
.flox-tb-nav{display:flex;align-items:center;gap:2px;flex:1;}
.flox-tb-item{
  padding:6px 14px;border-radius:8px;font-size:13px;font-weight:500;
  color:var(--muted);cursor:pointer;
  transition:background .15s,color .15s;
  text-decoration:none;background:none;border:none;font-family:inherit;
}
.flox-tb-item:hover{background:var(--surface-2);color:var(--text);}
.flox-tb-right{display:flex;align-items:center;gap:10px;margin-left:auto;}
.flox-tb-avatar{
  width:32px;height:32px;border-radius:50%;
  background:linear-gradient(135deg,#5E17EB,#7B3FF5);
  display:flex;align-items:center;justify-content:center;
  font-size:11px;font-weight:700;color:#fff;cursor:pointer;flex-shrink:0;
}
.flox-tb-popover{
  position:absolute;top:calc(100% + 8px);right:0;
  background:var(--surface);border:1px solid var(--line-2);
  border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,0.2);
  z-index:400;min-width:200px;padding:8px;
  opacity:0;pointer-events:none;
  transform:translateY(-6px);transition:opacity .18s,transform .18s;
}
.flox-tb-popover.vis{opacity:1;pointer-events:all;transform:translateY(0);}
.flox-tb-popover-info{padding:10px 12px 8px;border-bottom:1px solid var(--line);margin-bottom:6px;}
.flox-tb-popover-name{font-size:13px;font-weight:600;}
.flox-tb-popover-agency{font-size:11px;color:var(--muted);margin-top:2px;}
.flox-tb-popover-item{
  display:flex;align-items:center;gap:8px;
  padding:9px 12px;border-radius:8px;cursor:pointer;
  font-size:13px;color:var(--text);transition:background .12s;
}
.flox-tb-popover-item:hover{background:var(--surface-2);}
.flox-tb-popover-item.danger{color:#FF6B6B;}
.flox-tb-avatar-wrap{position:relative;}
.flox-tb-meeting{
  display:flex;align-items:center;gap:6px;
  padding:6px 12px;border-radius:8px;border:1px solid var(--line-2);
  background:none;color:var(--muted);font-size:12px;font-weight:500;
  cursor:pointer;transition:all .15s;white-space:nowrap;font-family:inherit;
}
.flox-tb-meeting:hover{border-color:#5E17EB;color:#5E17EB;}
.flox-tb-meeting.act{background:#5E17EB;border-color:#5E17EB;color:#fff;}
.flox-tb-theme{
  width:30px;height:30px;border-radius:8px;border:none;
  background:var(--surface-2);color:var(--muted);cursor:pointer;
  display:flex;align-items:center;justify-content:center;transition:background .15s;
}
.flox-tb-theme:hover{background:var(--surface-3);}
.flox-tb-dropdown-wrap{position:relative;}
.flox-tb-dropdown{
  position:absolute;top:calc(100% + 8px);left:0;
  background:var(--surface);border:1px solid var(--line-2);
  border-radius:14px;box-shadow:0 8px 40px rgba(0,0,0,0.25);
  z-index:400;min-width:220px;padding:8px;
  opacity:0;pointer-events:none;
  transform:translateY(-6px);transition:opacity .18s,transform .18s;
}
.flox-tb-dropdown.vis{opacity:1;pointer-events:all;transform:translateY(0);}
.flox-tb-dd-title{
  font-size:11px;font-weight:600;color:var(--muted);
  text-transform:uppercase;letter-spacing:.06em;padding:6px 10px 4px;
}
.flox-tb-dd-item{
  display:flex;align-items:center;gap:10px;
  padding:10px 12px;border-radius:10px;cursor:pointer;
  transition:background .12s;color:var(--text);text-decoration:none;
}
.flox-tb-dd-item:hover{background:var(--surface-2);}
.flox-tb-dd-icon{
  width:32px;height:32px;border-radius:8px;
  background:rgba(94,23,235,0.18);color:#5E17EB;
  display:flex;align-items:center;justify-content:center;
  font-size:15px;flex-shrink:0;
}
.flox-tb-dd-label{font-size:13px;font-weight:500;}
.flox-tb-dd-sub{font-size:11px;color:var(--muted);margin-top:1px;}
`;

  // ── HTML ─────────────────────────────────────────────────────────────────
  function buildHTML(opts) {
    const isSearch = opts.activePage === 'search';
    const searchLink = isSearch
      ? `<div class="flox-tb-item" style="cursor:default" onclick="floxTopbar.onSearchClick()">Поиск</div>`
      : `<a class="flox-tb-item" href="flox-web.html">Поиск</a>`;

    return `
      <a class="flox-tb-logo" href="flox-web.html">flox<span class="flox-tb-logo-dot"></span></a>
      <nav class="flox-tb-nav">
        ${searchLink}
        <div class="flox-tb-dropdown-wrap"
          onmouseenter="floxTopbar.openDd('tools')"
          onmouseleave="floxTopbar.closeDd('tools')">
          <div class="flox-tb-item">Инструменты</div>
          <div class="flox-tb-dropdown" id="ftb-dd-tools"
            onmouseenter="floxTopbar.keepDd('tools')"
            onmouseleave="floxTopbar.closeDd('tools')">
            <div class="flox-tb-dd-title">Инструменты</div>
            <div class="flox-tb-dd-item" onclick="floxTopbar.goTo('offers')">
              <div class="flox-tb-dd-icon">📋</div>
              <div>
                <div class="flox-tb-dd-label">Мои предложения</div>
                <div class="flox-tb-dd-sub">Ссылки, отправленные клиентам</div>
              </div>
            </div>
            <div class="flox-tb-dd-item" onclick="floxTopbar.goTo('presentation')">
              <div class="flox-tb-dd-icon">🗂️</div>
              <div>
                <div class="flox-tb-dd-label">Презентации</div>
                <div class="flox-tb-dd-sub">Подобранные юниты</div>
              </div>
            </div>
          </div>
        </div>
        <div class="flox-tb-dropdown-wrap"
          onmouseenter="floxTopbar.openDd('clients')"
          onmouseleave="floxTopbar.closeDd('clients')">
          <div class="flox-tb-item">Клиенты</div>
          <div class="flox-tb-dropdown" id="ftb-dd-clients"
            onmouseenter="floxTopbar.keepDd('clients')"
            onmouseleave="floxTopbar.closeDd('clients')">
            <div class="flox-tb-dd-title">Клиенты</div>
            <div class="flox-tb-dd-item" onclick="floxTopbar.goTo('activity')">
              <div class="flox-tb-dd-icon">📊</div>
              <div>
                <div class="flox-tb-dd-label">Последняя активность</div>
                <div class="flox-tb-dd-sub">История действий клиентов</div>
              </div>
            </div>
          </div>
        </div>
      </nav>
      <div class="flox-tb-right">
        <div class="flox-tb-avatar-wrap">
          <div class="flox-tb-avatar" id="ftb-avatar" onclick="floxTopbar.togglePopover()">АГ</div>
          <div class="flox-tb-popover" id="ftb-popover">
            <div class="flox-tb-popover-info">
              <div class="flox-tb-popover-name" id="ftb-name">—</div>
              <div class="flox-tb-popover-agency" id="ftb-agency">—</div>
            </div>
            <div class="flox-tb-popover-item danger" onclick="floxTopbar.logout()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
              Выйти из аккаунта
            </div>
          </div>
        </div>
        <button class="flox-tb-meeting" id="ftb-meeting" onclick="floxTopbar.toggleMeeting()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
          <span id="ftb-meeting-label">Встреча с клиентом</span>
        </button>
        <button class="flox-tb-theme" id="ftb-theme" onclick="floxTopbar.toggleTheme()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
        </button>
      </div>`;
  }

  // ── МОДУЛЬ ───────────────────────────────────────────────────────────────
  window.floxTopbar = {
    _opts: {},
    _ddTimers: {},
    _meetingMode: localStorage.getItem('flox-meeting') === 'true',

    init(opts) {
      this._opts = opts || {};

      // Вставляем CSS
      if (!document.getElementById('flox-topbar-css')) {
        const style = document.createElement('style');
        style.id = 'flox-topbar-css';
        style.textContent = CSS;
        document.head.appendChild(style);
      }

      // Вставляем HTML
      const root = document.getElementById('flox-topbar');
      if (!root) return;
      root.className = 'flox-topbar';
      root.innerHTML = buildHTML(this._opts);

      // Инициализируем состояния
      this._applyMeeting();
      this._applyTheme();
      this._loadAgent();

      // Закрываем поповер при клике вне
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.flox-tb-avatar-wrap')) {
          document.getElementById('ftb-popover')?.classList.remove('vis');
        }
      });
    },

    // ── Дропдауны ──────────────────────────────────────────────────────────
    openDd(name) {
      clearTimeout(this._ddTimers[name]);
      const dd = document.getElementById('ftb-dd-' + name);
      if (dd) dd.classList.add('vis');
    },
    keepDd(name) {
      clearTimeout(this._ddTimers[name]);
    },
    closeDd(name) {
      this._ddTimers[name] = setTimeout(() => {
        const dd = document.getElementById('ftb-dd-' + name);
        if (dd) dd.classList.remove('vis');
      }, 180);
    },

    // ── Навигация ───────────────────────────────────────────────────────────
    goTo(page) {
      if (this._opts.activePage === 'search') {
        // Уже на главной — переключаем вкладку
        if (typeof setPage === 'function') setPage(page);
        else if (typeof openPage === 'function') openPage(page);
      } else {
        // Переходим на главную с нужной вкладкой
        localStorage.setItem('flox-page', page);
        window.location.href = 'flox-web.html';
      }
    },
    onSearchClick() {
      if (typeof setPage === 'function') setPage('search');
    },

    // ── Поповер агента ──────────────────────────────────────────────────────
    togglePopover() {
      document.getElementById('ftb-popover')?.classList.toggle('vis');
    },
    _loadAgent() {
      try {
        const a = JSON.parse(localStorage.getItem('flox-agent') || '{}');
        if (a.full_name) {
          const initials = a.full_name.trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
          const av = document.getElementById('ftb-avatar');
          const nm = document.getElementById('ftb-name');
          const ag = document.getElementById('ftb-agency');
          if (av) av.textContent = initials;
          if (nm) nm.textContent = a.full_name;
          if (ag) ag.textContent = a.agency || '—';
        }
      } catch(e) {}
    },
    logout() {
      localStorage.removeItem('flox-meeting');
      window.location.href = 'flox-web.html';
    },

    // ── Встреча ─────────────────────────────────────────────────────────────
    _applyMeeting() {
      const btn = document.getElementById('ftb-meeting');
      const lbl = document.getElementById('ftb-meeting-label');
      const m = this._meetingMode;
      if (btn) btn.classList.toggle('act', m);
      if (lbl) lbl.textContent = 'Встреча с клиентом';
      // Сообщаем странице
      if (typeof window.onMeetingChange === 'function') window.onMeetingChange(m);
      // Совместимость со старыми переменными
      if (typeof meetingMode !== 'undefined') window.meetingMode = m;
    },
    toggleMeeting() {
      this._meetingMode = !this._meetingMode;
      localStorage.setItem('flox-meeting', String(this._meetingMode));
      this._applyMeeting();
      // Вызываем локальный toggleMeeting страницы если есть
      if (typeof window._pageMeetingCallback === 'function') window._pageMeetingCallback(this._meetingMode);
    },
    isMeeting() { return this._meetingMode; },

    // ── Тема ────────────────────────────────────────────────────────────────
    _applyTheme() {
      const dark = localStorage.getItem('flox-theme') !== 'light';
      document.body.classList.toggle('light', !dark);
      const btn = document.getElementById('ftb-theme');
      if (btn) {
        btn.innerHTML = dark
          ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`
          : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>`;
      }
    },
    toggleTheme() {
      const dark = localStorage.getItem('flox-theme') !== 'light';
      localStorage.setItem('flox-theme', dark ? 'light' : 'dark');
      this._applyTheme();
    },
  };

  // Авто-инициализация при наличии data-page атрибута
  document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('flox-topbar');
    if (root && root.dataset.page) {
      window.floxTopbar.init({ activePage: root.dataset.page });
    }
  });
})();
