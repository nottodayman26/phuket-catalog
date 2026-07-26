// ── FLOX TOPBAR — единый модуль для всех страниц ─────────────────────────
// Подключать: <script src="topbar.js"></script>
// В <body> первым элементом: <div id="flox-topbar" data-page="search|project|unit"></div>
// Вызвать: floxTopbar.init({ activePage: '...' })

(function() {

// 27.07.26, по просьбе Ильи: добавлена загрузка фото/лого агента в топбар
// (кружок с инициалами). Те же константы и тот же способ обращения к
// Supabase (голый fetch + анонимный ключ), что и в support-chat.js —
// см. там же _uploadAttachment для образца хранилища.
const SUPABASE_URL = 'https://lqhuegdwglzkfzjcfxdx.supabase.co/rest/v1';
const SUPABASE_BASE = 'https://lqhuegdwglzkfzjcfxdx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxaHVlZ2R3Z2x6a2Z6amNmeGR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MjA5NjIsImV4cCI6MjA5NzM5Njk2Mn0.egEtZ5Av8tAD_Y6tKtWowxpbHoCiDezWEG5gWpEYNpo';
const SB = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };

const CSS = `
/* 26.07.26, по просьбе Ильи: убрана верхняя линия под топбаром (border-bottom) —
   вместе с фикс в .ticker-wrap ниже (в каждом файле отдельно) убирает обе линии
   вокруг бегущей строки "недавно продано". */
.flox-topbar{position:sticky;top:0;z-index:200;background:var(--surface);display:flex;align-items:center;padding:0 24px;height:52px;gap:0;font-family:'Inter',system-ui,sans-serif;}
.flox-tb-logo{font-size:20px;font-weight:700;letter-spacing:-0.05em;color:var(--text);text-decoration:none;margin-right:32px;display:flex;align-items:center;overflow:hidden;max-width:120px;transition:opacity .25s ease,max-width .25s ease,margin-right .25s ease;}
.flox-tb-logo.meeting-hidden{opacity:0;max-width:0;margin-right:0;pointer-events:none;}
.flox-tb-logo-dot{width:6px;height:6px;border-radius:50%;background:#FF6B6B;margin-left:1px;margin-bottom:9px;flex-shrink:0;vertical-align:bottom;display:inline-block;}
.flox-tb-nav{display:flex;align-items:center;gap:2px;flex:1;margin-left:-14px;}
.flox-tb-item{padding:6px 14px;border-radius:8px;font-size:13px;font-weight:500;color:var(--muted);cursor:pointer;transition:background .15s,color .15s;text-decoration:none;background:none;border:none;font-family:inherit;}
.flox-tb-item:hover{background:var(--surface-2);color:var(--text);}
.flox-tb-right{display:flex;align-items:center;gap:10px;margin-left:auto;}
.flox-tb-avatar{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#5E17EB,#7B3FF5);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;cursor:pointer;flex-shrink:0;}
.flox-tb-avatar-wrap{position:relative;}
.flox-tb-popover{position:absolute;top:calc(100% + 8px);right:0;background:var(--surface);border-radius:14px;box-shadow:0 4px 16px rgba(0,0,0,0.14);z-index:400;min-width:200px;padding:8px;opacity:0;pointer-events:none;transform:translateY(-6px);transition:opacity .18s,transform .18s;}
.flox-tb-popover.vis{opacity:1;pointer-events:all;transform:translateY(0);}
.flox-tb-popover-info{padding:10px 12px 8px;margin-bottom:6px;}
.flox-tb-popover-name{font-size:13px;font-weight:600;}
.flox-tb-popover-agency{font-size:11px;color:var(--muted);margin-top:2px;}
.flox-tb-popover-item{display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:8px;cursor:pointer;font-size:13px;color:var(--text);transition:background .12s;}
.flox-tb-popover-item:hover{background:var(--surface-2);}
.flox-tb-popover-item.danger{color:#FF6B6B;}
/* 21.07.26 (2), по просьбе Ильи: выбран вариант 2 из meeting_button_variants.html
   — заполненная плашка (без контура) вместо контурной кнопки: сразу залита
   приглушённым фоном surface-3, при активной встрече — фиолетовый акцент.
   Логика (floxTopbar.toggleMeeting()) не менялась, поменялся только вид.
   22.07.26, по просьбе Ильи: серую плашку убрали совсем (background:none в
   покое) — Илье не понравилась именно она. Переход цвета текста на hover и
   заливка фиолетовым в активном состоянии (.act) оставлены как есть.
   27.07.26, по новой просьбе Ильи: серую плашку всё-таки вернули — но
   только на hover (в покое по-прежнему background:none, как просили
   22.07.26 — постоянного серого фона нет). */
.flox-tb-meeting{display:flex;align-items:center;gap:7px;padding:7px 14px;border-radius:10px;border:none;background:none;color:var(--muted);font-size:12.5px;font-weight:600;cursor:pointer;transition:all .15s;white-space:nowrap;font-family:inherit;}
.flox-tb-meeting:hover{background:var(--surface-2);color:var(--text);}
.flox-tb-meeting.act{background:#5E17EB;color:#fff;}
.flox-tb-meeting.act:hover{background:#5E17EB;}
/* 27.07.26: .flox-tb-theme:hover уже темнеет/светлеет в зависимости от темы
   без дополнительных правок — в тёмной теме --surface-3 (#222232) светлее
   --surface-2 (#1a1a26), в светлой --surface-3 (#EBEBED) темнее --surface-2
   (#F5F5F7) (см. project.html/unit.html/floxweb.html), то есть иконка и
   темнеет, и светлеет — как раз то, что просили. */
.flox-tb-theme{width:32px;height:32px;border-radius:50%;border:none;background:var(--surface-2);color:var(--muted);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s;flex-shrink:0;}
.flox-tb-theme:hover{background:var(--surface-3);}
.flox-tb-avatar{overflow:hidden;background-size:cover;background-position:center;}
.flox-tb-popover-item input[type=file]{display:none;}
.flox-tb-dd-wrap{position:relative;}
.flox-tb-dd{position:absolute;top:calc(100% + 8px);left:0;background:var(--surface);border-radius:14px;box-shadow:0 4px 16px rgba(0,0,0,0.14);z-index:400;min-width:220px;padding:8px;opacity:0;pointer-events:none;transform:translateY(-6px);transition:opacity .18s,transform .18s;}
.flox-tb-dd.vis{opacity:1;pointer-events:all;transform:translateY(0);}
.flox-tb-dd-title{font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;padding:6px 10px 4px;}
.flox-tb-dd-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;cursor:pointer;transition:background .12s;color:var(--text);text-decoration:none;}
.flox-tb-dd-item:hover{background:var(--surface-2);}
.flox-tb-dd-icon{width:32px;height:32px;border-radius:8px;background:rgba(94,23,235,0.18);color:#5E17EB;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;}
.flox-tb-dd-label{font-size:13px;font-weight:500;}
.flox-tb-dd-sub{font-size:11px;color:var(--muted);margin-top:1px;}
`;

const SVG_PEOPLE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>`;
const SVG_SUN  = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`;
const SVG_MOON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>`;
const SVG_OUT  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>`;
const SVG_UPLOAD = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`;

function buildHTML(isSearch) {
  const searchEl = isSearch
    ? `<div class="flox-tb-item" onclick="floxTopbar._onSearch()">Поиск</div>`
    : `<div class="flox-tb-item" onclick="floxTopbar._onSearch()">Поиск</div>`;
  return `
    <div class="flox-tb-logo" id="ftb-logo">flox<span class="flox-tb-logo-dot"></span></div>
    <nav class="flox-tb-nav">
      ${searchEl}
      <div class="flox-tb-dd-wrap" onmouseenter="floxTopbar._ddOpen('tools')" onmouseleave="floxTopbar._ddClose('tools')">
        <div class="flox-tb-item">Инструменты</div>
        <div class="flox-tb-dd" id="ftb-dd-tools" onmouseenter="floxTopbar._ddKeep('tools')" onmouseleave="floxTopbar._ddClose('tools')">
          <div class="flox-tb-dd-title">Инструменты</div>
          <div class="flox-tb-dd-item" onclick="floxTopbar._go('offers')">
            <div class="flox-tb-dd-icon">📋</div>
            <div><div class="flox-tb-dd-label">Мои предложения</div><div class="flox-tb-dd-sub">Ссылки, отправленные клиентам</div></div>
          </div>
          <div class="flox-tb-dd-item" onclick="floxTopbar._go('presentation')">
            <div class="flox-tb-dd-icon">🗂️</div>
            <div><div class="flox-tb-dd-label">Презентации</div><div class="flox-tb-dd-sub">Подобранные юниты</div></div>
          </div>
        </div>
      </div>
      <div class="flox-tb-dd-wrap" onmouseenter="floxTopbar._ddOpen('clients')" onmouseleave="floxTopbar._ddClose('clients')">
        <div class="flox-tb-item">Клиенты</div>
        <div class="flox-tb-dd" id="ftb-dd-clients" onmouseenter="floxTopbar._ddKeep('clients')" onmouseleave="floxTopbar._ddClose('clients')">
          <div class="flox-tb-dd-title">Клиенты</div>
          <div class="flox-tb-dd-item" onclick="floxTopbar._go('activity')">
            <div class="flox-tb-dd-icon">📊</div>
            <div><div class="flox-tb-dd-label">Последняя активность</div><div class="flox-tb-dd-sub">История действий клиентов</div></div>
          </div>
        </div>
      </div>
    </nav>
    <div class="flox-tb-right">
      <button class="flox-tb-meeting" id="ftb-meeting" onclick="floxTopbar.toggleMeeting()">${SVG_PEOPLE}<span id="ftb-meeting-lbl">Встреча с клиентом</span></button>
      <div class="flox-tb-avatar-wrap">
        <div class="flox-tb-avatar" id="ftb-avatar" onclick="floxTopbar._togglePopover()">АГ</div>
        <div class="flox-tb-popover" id="ftb-popover">
          <div class="flox-tb-popover-info">
            <div class="flox-tb-popover-name" id="ftb-name">—</div>
            <div class="flox-tb-popover-agency" id="ftb-agency">—</div>
          </div>
          <div class="flox-tb-popover-item" onclick="floxTopbar._triggerPhotoUpload()">${SVG_UPLOAD} Загрузить фото
            <input type="file" id="ftb-photo-input" accept="image/*" onchange="floxTopbar._onPhotoSelected(this.files[0])">
          </div>
          <div class="flox-tb-popover-item danger" onclick="floxTopbar._logout()">${SVG_OUT} Выйти из аккаунта</div>
        </div>
      </div>
      <button class="flox-tb-theme" id="ftb-theme" onclick="floxTopbar.toggleTheme()"></button>
    </div>`;
}

window.floxTopbar = {
  _page: 'search',
  _meeting: localStorage.getItem('flox-meeting') === 'true',
  _timers: {},

  init(opts) {
    this._page = (opts && opts.activePage) || 'search';

    // CSS
    if (!document.getElementById('ftb-css')) {
      const s = document.createElement('style');
      s.id = 'ftb-css'; s.textContent = CSS;
      document.head.appendChild(s);
    }

    // HTML
    const root = document.getElementById('flox-topbar');
    if (!root) return;
    root.className = 'flox-topbar';
    root.innerHTML = buildHTML(this._page === 'search');

    // Применяем состояния
    this._applyTheme();
    this._applyMeeting();
    this._loadAgent();

    // Закрываем поповер при клике вне
    document.addEventListener('click', e => {
      if (!e.target.closest('.flox-tb-avatar-wrap'))
        document.getElementById('ftb-popover')?.classList.remove('vis');
    });
  },

  // ── Дропдауны ────────────────────────────────────────────────────────────
  _ddOpen(name) {
    clearTimeout(this._timers[name]);
    // Закрываем остальные дропдауны сразу, чтобы не перекрывались
    ['tools', 'clients'].forEach(n => {
      if (n !== name) {
        clearTimeout(this._timers[n]);
        document.getElementById('ftb-dd-' + n)?.classList.remove('vis');
      }
    });
    document.getElementById('ftb-dd-' + name)?.classList.add('vis');
  },
  _ddKeep(name) { clearTimeout(this._timers[name]); },
  _ddClose(name) {
    this._timers[name] = setTimeout(() => {
      document.getElementById('ftb-dd-' + name)?.classList.remove('vis');
    }, 180);
  },

  // ── Навигация ─────────────────────────────────────────────────────────────
  _go(page) {
    if (this._page === 'search') {
      // Уже на главной — переключаем вкладку
      if (typeof setPage === 'function') setPage(page);
      else if (typeof openPage === 'function') openPage(page);
    } else {
      // Другая страница — переходим на главную с нужной вкладкой
      localStorage.setItem('flox-page', page);
      window.location.href = 'flox-web.html';
    }
  },
  _onSearch() {
    if (this._page === 'search') {
      // 15.07.26: НАЙДЕН реальный источник бага "при переходе из Инструменты/
      // Клиенты в Поиск снова появляются варианты" — раньше тут всегда, при
      // любом клике по "Поиск", вызывался freshSearch() СРАЗУ следом за
      // setPage('search'). freshSearch() не просто чистит вид — он ещё и сам
      // запускает новый поиск (doSearch()), то есть тут же заново показывал
      // список карточек. Из-за этого любая попытка почистить страницу поиска
      // внутри самого setPage()/floxweb.html немедленно перечёркивалась этим
      // синхронным вызовом сразу после — вот почему прошлая правка "не
      // срабатывала", хотя проходила тесты (тесты дёргали setPage() напрямую,
      // без topbar.js и без этого второго вызова).
      // Теперь: если агент СЕЙЧАС не на вкладке "Поиск" (переходит из
      // Инструменты/Клиенты) — просто показываем чистую страницу поиска, без
      // принудительного нового поиска. А если он и так уже на "Поиск" и жмёт
      // по ней ещё раз — это осознанное действие "начать заново", тут
      // freshSearch() как раньше уместен (полный сброс фильтров + новый поиск).
      const alreadyOnSearch = document.getElementById('page-search')?.classList.contains('act');
      if (typeof setPage === 'function') setPage('search');
      if (alreadyOnSearch) {
        if (typeof freshSearch === 'function') freshSearch();
      } else if (typeof resetSearchPageToClean === 'function') {
        resetSearchPageToClean();
      }
    } else {
      window.location.href = 'flox-web.html';
    }
  },

  // ── Поповер агента ────────────────────────────────────────────────────────
  _togglePopover() {
    document.getElementById('ftb-popover')?.classList.toggle('vis');
  },
  _loadAgent() {
    try {
      const a = JSON.parse(localStorage.getItem('flox-agent') || 'null');
      if (!a) return;
      const initials = (a.full_name || '').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
      const av = document.getElementById('ftb-avatar');
      const nm = document.getElementById('ftb-name');
      const ag = document.getElementById('ftb-agency');
      if (av) this._renderAvatarPhoto(av, a.avatar_url, initials);
      if (nm) nm.textContent = a.full_name || '—';
      if (ag) {
        const agency = (a.agency || '').trim();
        ag.textContent = agency.toLowerCase() === 'независимый' ? 'Независимый агент' : (agency || '—');
      }
      // 27.07.26: если фото ещё не закешировано в localStorage (например,
      // залито с другого устройства/вкладки), подтягиваем его из базы —
      // отдельным запросом, чтобы не трогать остальную загрузку агента,
      // если колонки agents.avatar_url вдруг ещё нет (см. комментарий у
      // _uploadPhotoAndPersist ниже).
      if (a.avatar_url === undefined && a.id) {
        fetch(`${SUPABASE_URL}/agents?id=eq.${a.id}&select=avatar_url`, {headers: SB})
          .then(r => r.ok ? r.json() : [])
          .then(rows => {
            const url = rows[0] && rows[0].avatar_url;
            if (!url) return;
            a.avatar_url = url;
            localStorage.setItem('flox-agent', JSON.stringify(a));
            if (av) this._renderAvatarPhoto(av, url, initials);
          })
          .catch(() => {});
      }
    } catch(e) {}
  },

  // 27.07.26: общий рендер кружка-аватара — либо фото (background-image),
  // либо буквы-инициалы, как было раньше.
  // 27.07.26 (2), по факту бага у Ильи: раньше URL применялся "вслепую",
  // просто потому что он был непустой строкой — если ссылка на самом деле
  // битая (например, файл не залился в Storage, а сам URL всё равно был
  // сохранён), кружок становился ПУСТЫМ (текст уже стёрт, картинка не
  // грузится) — и терялись даже старые добрые инициалы. Теперь URL сначала
  // ПРОВЕРЯЕТСЯ реальной загрузкой (new Image()) — инициалы стираются и
  // фото ставится только если картинка правда загрузилась; при ошибке —
  // тихий откат на инициалы. Это же самолечит уже испорченные значения
  // (старый битый avatar_url в базе/кеше), без ручной чистки.
  _renderAvatarPhoto(el, photoUrl, initials) {
    if (!photoUrl) {
      el.style.backgroundImage = '';
      el.textContent = initials || 'АГ';
      return;
    }
    const probe = new Image();
    probe.onload = () => {
      el.style.backgroundImage = `url('${photoUrl}')`;
      el.textContent = '';
    };
    probe.onerror = () => {
      console.error('[floxTopbar] фото по ссылке не загрузилось, оставляем инициалы:', photoUrl);
      el.style.backgroundImage = '';
      el.textContent = initials || 'АГ';
    };
    probe.src = photoUrl;
  },

  // ── Загрузка фото/лого ───────────────────────────────────────────────────
  _triggerPhotoUpload() {
    document.getElementById('ftb-photo-input')?.click();
  },
  async _onPhotoSelected(file) {
    if (!file) return;
    try {
      const a = JSON.parse(localStorage.getItem('flox-agent') || 'null');
      // 27.07.26 (5), баг у Ильи ("на аккаунте поддержки фото вообще не
      // грузится, но никакой ошибки не видно"): раньше этот выход был
      // ПОЛНОСТЬЮ молчаливым — если в localStorage нет 'flox-agent' или в
      // нём нет поля id, ничего не логировалось, просто ничего не
      // происходило. Добавили явную диагностику, чтобы в консоли было видно,
      // что дело именно в этом (а не в Storage/базе), если это тот случай.
      if (!a || !a.id) {
        console.error('[floxTopbar] не удалось загрузить фото: в localStorage нет корректного flox-agent с полем id', a);
        return;
      }
      const av = document.getElementById('ftb-avatar');
      const initials = (a.full_name || '').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
      // Загрузка в тот же способ хранения (Supabase Storage, анонимный
      // ключ), что и вложения в support-chat.js (_uploadAttachment) — тот
      // же паттерн: POST файла напрямую как body, публичный URL по
      // предсказуемому пути.
      // 27.07.26 (6), НАЙДЕНО по консоли Ильи: Supabase Storage возвращал
      // 400 "InvalidKey" — раньше в путь файла подставлялось оригинальное
      // имя файла (${file.name}) почти как есть (только пробелы менялись на
      // подчёркивания) — а Storage требует, чтобы ключ объекта состоял
      // только из ASCII-символов. Если пользователь загружает файл с
      // кириллицей в названии (например "логотип_2.png", как в консоли) —
      // ключ получался невалидным и загрузка падала. Теперь путь строится
      // только из ASCII-безопасных частей (id агента, timestamp, расширение
      // файла) — оригинальное название файла в пути больше не участвует.
      const extMatch = /\.([a-zA-Z0-9]+)$/.exec(file.name || '');
      const ext = extMatch ? extMatch[1].toLowerCase() : ((file.type && file.type.split('/')[1]) || 'jpg').replace(/[^a-z0-9]/gi, '');
      const path = `${a.id}/${Date.now()}.${ext || 'jpg'}`;
      const uploadResp = await fetch(`${SUPABASE_BASE}/storage/v1/object/agent-photos/${encodeURIComponent(path)}`, {
        method: 'POST',
        headers: {...SB, 'Content-Type': file.type || 'application/octet-stream'},
        body: file,
      });
      // 27.07.26 (2), ИСПРАВЛЕНО: раньше статус этого запроса вообще не
      // проверялся — если бакета "agent-photos" не существует (или другая
      // ошибка Storage), код всё равно шёл дальше, как будто файл реально
      // залился, и сохранял в базу ссылку на несуществующий файл. Теперь при
      // неуспехе сразу останавливаемся и НЕ трогаем ни базу, ни кружок —
      // он остаётся с инициалами, как было.
      if (!uploadResp.ok) {
        console.error('[floxTopbar] не удалось загрузить файл в Storage (бакет "agent-photos" существует? см. текст ошибки ниже):', await uploadResp.text().catch(()=>''));
        return;
      }
      const url = `${SUPABASE_BASE}/storage/v1/object/public/agent-photos/${encodeURIComponent(path)}`;

      // 27.07.26, ВАЖНО: это предполагает, что в Supabase уже существует
      // текстовая колонка agents.avatar_url — у меня нет доступа к схеме
      // базы, чтобы это проверить самому, поэтому если колонки ещё нет, эта
      // команда ниже вернёт ошибку и просто ничего не сохранится (кружок
      // останется с инициалами) — в таком случае нужно завести колонку с
      // этим именем (или сказать мне другое — поправлю код под него).
      const resp = await fetch(`${SUPABASE_URL}/agents?id=eq.${a.id}`, {
        method: 'PATCH',
        headers: {...SB, 'Content-Type': 'application/json', Prefer: 'return=minimal'},
        body: JSON.stringify({avatar_url: url}),
      });
      if (!resp.ok) {
        console.error('[floxTopbar] не удалось сохранить avatar_url — проверь, что в таблице agents есть такая колонка', await resp.text().catch(()=>''));
        return;
      }

      a.avatar_url = url;
      localStorage.setItem('flox-agent', JSON.stringify(a));
      if (av) this._renderAvatarPhoto(av, url, initials);
    } catch (e) {
      console.error('[floxTopbar] ошибка загрузки фото', e);
    }
  },
  _logout() {
    // 21.07.26, найден Ильёй баг ("выйти из аккаунта не могу"): раньше эта
    // функция НЕ удаляла flox-agent из localStorage (комментарий буквально
    // говорил "не удаляем — редиректим на главную") — экран входа на секунду
    // показывался поверх, но кэш агента оставался цел, и при любой
    // перезагрузке flox-web.html снова тихо логинил под старым аккаунтом,
    // как будто выхода не было вообще. Теперь кэш реально чистится, поэтому
    // выход работает и переживает перезагрузку/переход на другой Telegram-
    // аккаунт.
    localStorage.removeItem('flox-meeting');
    localStorage.removeItem('flox-agent');
    localStorage.removeItem('flox-page');
    // Всегда уходим на главную полной навигацией (а не просто показываем
    // authScreen поверх текущего состояния) — это гарантирует, что вся
    // JS-память страницы (переменная AGENT и т.п.) тоже сбрасывается, а не
    // только localStorage.
    window.location.href = 'flox-web.html';
  },

  // ── Встреча ───────────────────────────────────────────────────────────────
  _applyMeeting() {
    const m = this._meeting;
    const btn = document.getElementById('ftb-meeting');
    if (btn) btn.classList.toggle('act', m);

    // Скрываем логотип на project.html
    const logo = document.getElementById('ftb-logo');
    if (logo) logo.classList.toggle('meeting-hidden', m);

    // CSS-переменные для project.html (блок вознаграждения)
    document.documentElement.style.setProperty('--meeting-logo-vis', m ? 'hidden' : 'visible');
    document.documentElement.style.setProperty('--meeting-reward-display', m ? 'none' : 'block');

    // Комиссия в карточках поисковика
    document.querySelectorAll('.pc-comm').forEach(el => el.classList.toggle('hidden', m));

    // Callback для страницы (project.html, unit.html)
    if (typeof window._pageMeetingCallback === 'function') window._pageMeetingCallback(m);
  },
  toggleMeeting() {
    this._meeting = !this._meeting;
    localStorage.setItem('flox-meeting', String(this._meeting));
    this._applyMeeting();
  },
  isMeeting() { return this._meeting; },

  // ── Тема ─────────────────────────────────────────────────────────────────
  _applyTheme() {
    const dark = localStorage.getItem('flox-theme') === 'dark';
    document.body.classList.toggle('light', !dark);
    const btn = document.getElementById('ftb-theme');
    if (btn) btn.innerHTML = dark ? SVG_SUN : SVG_MOON;
  },
  toggleTheme() {
    const dark = localStorage.getItem('flox-theme') === 'dark';
    localStorage.setItem('flox-theme', dark ? 'light' : 'dark');
    this._applyTheme();
  },
};

// 22.07.26, по прямой просьбе Ильи ("вышел из аккаунта на одной странице —
// вышел из всех"): агент обычно держит открытыми сразу несколько вкладок
// (flox-web.html, project.html, unit.html — все три подключают этот файл).
// Выход (_logout() выше) удаляет 'flox-agent' из localStorage — а
// localStorage общий на весь домен, поэтому браузер сам присылает событие
// 'storage' во ВСЕ ДРУГИЕ открытые вкладки этого же источника (кроме той,
// где произошло удаление, — там уже сработала обычная навигация внутри
// _logout()). Раньше эти вкладки просто не знали об этом и продолжали
// показывать старый кэш агента до ручного обновления страницы.
// 22.07.26 (2), по фидбеку Ильи: сначала пробовали просто location.reload()
// — не годится для project.html/unit.html, у них нет СВОЕГО экрана входа
// (он есть только в flox-web.html), поэтому reload() просто перерисовывал
// ту же страницу проекта/юнита без агента, а не уводил на вход. Теперь
// везде — переход на flox-web.html (тот же путь, что и в самой кнопке
// "Выйти из аккаунта" выше), он и покажет экран входа. project.html/
// unit.html лежат в той же папке, что и flox-web.html (см. структуру
// репозитория в CONTEXT.md), поэтому относительный путь верен из любой
// из трёх страниц.
window.addEventListener('storage', (e) => {
  if (e.key === 'flox-agent' && e.newValue === null) {
    window.location.href = 'flox-web.html';
  }
});

// init вызывается явно каждой страницей через floxTopbar.init({activePage:'...'})
})();
