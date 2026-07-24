// ── FLOX SUPPORT CHAT — плавающая кнопка + мессенджер поддержки ──────────
// 25.07.26, по просьбе Ильи. Модуль сделан 1:1 по образцу topbar.js (тот же
// стиль подключения и тот же принцип: один файл, общий для всех страниц).
//
// Подключать:  <script src="support-chat.js"></script>
// Вызвать:     floxSupportChat.init()
//              — на flox-web.html и project.html вызывать ВСЕГДА;
//              — на unit.html только если !isClientMode (см. там же, где
//                стоит `if (!isClientMode) floxTopbar.init(...)`) — кнопка
//                поддержки агенту, не клиенту.
//              — на offer.html/входном экране вообще не подключать.
//
// Откуда берёт личность агента: как и topbar.js — из localStorage
// ('flox-agent'), ничего не спрашивает заново. Если агент ещё не залогинен
// (экран входа поверх, z-index 5000 — выше нашей кнопки 4000/4001), кнопка
// просто не рисуется. Если логин происходит БЕЗ перезагрузки страницы —
// floxweb.html должен явно позвать floxSupportChat._onAgentReady() в том же
// месте, где уже зовёт floxTopbar._loadAgent() (см. renderAgent() в
// floxweb.html) — это сделано отдельной правкой в самом floxweb.html.
//
// Требует SQL-миграцию support_chat_migration.sql (таблицы
// support_conversations/support_messages, поля agents.staff_role/
// managed_projects, бакет Storage support-attachments) — без неё все
// запросы ниже будут просто получать ошибки от Supabase.
//
// Устройство ролей (см. миграцию):
//   agents.staff_role IS NULL        → обычный агент: видит РОВНО один
//                                       свой тред с поддержкой (заводится
//                                       автоматически при первом открытии
//                                       кнопки, даже если ничего не пишет).
//   agents.staff_role = 'support'    → видит СПИСОК тредов ВСЕХ агентов
//                                       (project_code IS NULL) — левая
//                                       колонка как на скрине-образце.
//   agents.staff_role = 'project_manager' (задел на будущее, в этой
//                                       версии кодом ещё не используется —
//                                       нет UI для создания тредов с
//                                       project_code) — увидит только
//                                       agents.managed_projects, когда
//                                       появится сама механика таких тредов.
//
// Никакого realtime/SDK — как и весь остальной проект, ходим напрямую в
// PostgREST через fetch с анонимным ключом, обновляем данные поллингом.

(function() {

const SUPABASE_URL = 'https://lqhuegdwglzkfzjcfxdx.supabase.co/rest/v1';
const SUPABASE_BASE = 'https://lqhuegdwglzkfzjcfxdx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxaHVlZ2R3Z2x6a2Z6amNmeGR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MjA5NjIsImV4cCI6MjA5NzM5Njk2Mn0.egEtZ5Av8tAD_Y6tKtWowxpbHoCiDezWEG5gWpEYNpo';
const SB = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
const POLL_MS = 5000; // 25.07.26: без realtime-подписки опрашиваем раз в 5с — тот же принцип, что и весь проект (обычный fetch, без Supabase SDK)

// ── CSS: 1:1 из согласованного мокапа (support_chat_mockup.html), после
// всех правок Ильи (без свечения кнопки, наш скролл, тёмные таблетки в
// тёмной теме/белые в светлой — --chat-pill-bg, нейтральная подсветка
// выбранного чата, без серых линий между чатами, без title-подсказок и
// иконки поменьше). --chat-pill-bg объявляется тут же (в :root/body.light
// его нет в самих flox-web.html/project.html/unit.html, т.к. это только
// наш компонент) — переопределяем прямо на этих же переменных.
const CSS = `
:root{ --chat-pill-bg: var(--surface-2); }
body.light{ --chat-pill-bg: #ffffff; }

.fc-fab{
  position:fixed; right:28px; bottom:28px; width:58px; height:58px; border-radius:50%;
  background:#FF6B6B; border:none; cursor:pointer; z-index:4000;
  display:flex; align-items:center; justify-content:center;
  box-shadow:0 2px 8px rgba(0,0,0,.2);
  transition:transform .2s cubic-bezier(.34,1.56,.64,1);
}
.fc-fab{display:none;}
.fc-fab.vis{display:flex;}
.fc-fab:hover{transform:scale(1.08);}
.fc-fab svg{width:26px;height:26px;}
.fc-fab .fc-badge{
  position:absolute; top:-2px; right:-2px; min-width:20px; height:20px; padding:0 5px;
  background:var(--accent,#5E17EB); color:#fff; border-radius:10px; font-size:11px; font-weight:700;
  display:none; align-items:center; justify-content:center; border:2px solid var(--bg,#0d0d18);
}
.fc-fab .fc-badge.vis{display:flex;}

.fc-panel{
  position:fixed; right:28px; bottom:100px; width:860px; height:600px; max-width:calc(100vw - 56px);
  max-height:calc(100vh - 130px); background:var(--surface); border:1px solid var(--line);
  border-radius:20px; box-shadow:0 20px 60px rgba(0,0,0,.4); z-index:4001;
  display:flex; overflow:hidden; opacity:0; transform:translateY(16px) scale(.98); pointer-events:none;
  transition:opacity .18s ease, transform .18s cubic-bezier(.34,1.2,.64,1);
}
.fc-panel.open{opacity:1; transform:translateY(0) scale(1); pointer-events:auto;}

.fc-list-col{width:300px; border-right:1px solid var(--line); display:flex; flex-direction:column; background:var(--surface);}
.fc-list-head{padding:16px 16px 12px;}
.fc-search{
  display:flex; align-items:center; gap:8px; background:var(--chat-pill-bg); border:1px solid var(--line-2);
  border-radius:10px; padding:9px 12px; color:var(--muted); font-size:13px;
}
.fc-search svg{width:15px;height:15px;flex-shrink:0;opacity:.7;}
.fc-search input{border:none;background:none;outline:none;color:var(--text);font-size:13px;width:100%;font-family:inherit;}
.fc-search input::placeholder{color:var(--muted);}
.fc-tabs{display:flex; gap:4px; padding:0 12px 10px;}
.fc-tab{font-size:11.5px; font-weight:600; color:var(--muted); padding:5px 10px; border-radius:20px; white-space:nowrap; cursor:pointer; border:none; background:none; font-family:inherit;}
.fc-tab.act{background:var(--accent-soft); color:var(--accent);}
.fc-list{flex:1; overflow-y:auto; scrollbar-width:thin; scrollbar-color:var(--line-2) transparent;}
.fc-list::-webkit-scrollbar{width:6px;}
.fc-list::-webkit-scrollbar-track{background:transparent;}
.fc-list::-webkit-scrollbar-thumb{background:var(--line-2);border-radius:10px;}
.fc-item{display:flex; gap:10px; padding:11px 16px; cursor:pointer;}
.fc-item:hover,.fc-item.act{background:var(--surface-2);}
.fc-avatar{width:40px;height:40px;border-radius:50%;background:var(--surface-3);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:var(--muted);flex-shrink:0;}
.fc-item-body{flex:1;min-width:0;}
.fc-item-top{display:flex;justify-content:space-between;align-items:baseline;gap:6px;}
.fc-item-name{font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.fc-item-time{font-size:10.5px;color:var(--muted);flex-shrink:0;}
.fc-item-msg{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;}
.fc-item-badge{background:var(--accent);color:#fff;font-size:10.5px;font-weight:700;border-radius:9px;min-width:18px;height:18px;display:flex;align-items:center;justify-content:center;padding:0 4px;flex-shrink:0;}
.fc-empty{padding:24px 16px;color:var(--muted);font-size:12.5px;text-align:center;}

.fc-chat-col{flex:1;display:flex;flex-direction:column;min-width:0;}
.fc-chat-head{display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid var(--line);}
.fc-chat-head .fc-avatar{width:38px;height:38px;font-size:13px;}
.fc-chat-title{font-size:14px;font-weight:700;}
.fc-chat-sub{font-size:11.5px;color:var(--muted);margin-top:1px;}
.fc-close{margin-left:auto;width:30px;height:30px;border-radius:50%;border:none;background:var(--surface-2);color:var(--muted);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s,color .15s;}
.fc-close:hover{background:var(--surface-3);color:var(--text);}

.fc-msgs{flex:1;overflow-y:auto;padding:18px 20px;display:flex;flex-direction:column;gap:10px;
  scrollbar-width:thin; scrollbar-color:var(--line-2) transparent;}
.fc-msgs::-webkit-scrollbar{width:6px;}
.fc-msgs::-webkit-scrollbar-track{background:transparent;}
.fc-msgs::-webkit-scrollbar-thumb{background:var(--line-2);border-radius:10px;}
.fc-day{align-self:center;font-size:11px;color:var(--muted);background:var(--surface-2);padding:4px 12px;border-radius:20px;margin:6px 0;}
.fc-bubble{max-width:68%;padding:9px 13px;border-radius:14px;font-size:13px;line-height:1.45;position:relative;white-space:pre-wrap;word-break:break-word;}
.fc-bubble.in{align-self:flex-start;background:var(--surface-2);border-bottom-left-radius:4px;}
.fc-bubble.out{align-self:flex-end;background:var(--accent);color:#fff;border-bottom-right-radius:4px;}
.fc-bubble-time{display:block;font-size:10px;color:var(--muted);margin-top:4px;text-align:right;}
.fc-bubble.out .fc-bubble-time{color:rgba(255,255,255,.7);}
.fc-bubble-file{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.06);border-radius:10px;padding:8px 10px;font-size:12.5px;margin-top:2px;}
.fc-bubble-file a{color:inherit;text-decoration:none;}
.fc-bubble.out .fc-bubble-file{background:rgba(255,255,255,.15);}
.fc-bubble-file svg{width:16px;height:16px;flex-shrink:0;}
.fc-hint{color:var(--muted);font-size:12.5px;text-align:center;padding:20px;}

.fc-input-row{display:flex;align-items:center;gap:8px;padding:12px 16px;border-top:1px solid var(--line);position:relative;}
.fc-icon-btn{width:28px;height:28px;border-radius:50%;border:none;background:none;color:var(--muted);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s,color .15s;}
.fc-icon-btn:hover{background:var(--surface-2);color:var(--text);}
.fc-icon-btn svg{width:16px;height:16px;}
.fc-input{flex:1;background:var(--chat-pill-bg);border:1px solid var(--line-2);border-radius:20px;padding:10px 16px;color:var(--text);font-size:13px;outline:none;font-family:inherit;}
.fc-input::placeholder{color:var(--muted);}
.fc-send{width:32px;height:32px;border-radius:50%;border:none;background:var(--accent);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform .15s;}
.fc-send:hover{transform:scale(1.06);}
.fc-send svg{width:14px;height:14px;}
.fc-send:disabled{opacity:.5;cursor:default;transform:none;}

.fc-emoji-pop{position:absolute;bottom:calc(100% + 8px);right:56px;background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:0 10px 28px rgba(0,0,0,.2);padding:8px;display:none;grid-template-columns:repeat(8,1fr);gap:2px;width:280px;z-index:10;}
.fc-emoji-pop.vis{display:grid;}
.fc-emoji-pop button{border:none;background:none;font-size:18px;padding:5px;border-radius:8px;cursor:pointer;line-height:1;}
.fc-emoji-pop button:hover{background:var(--surface-2);}

@media (max-width:720px){
  .fc-list-col{display:none;}
  .fc-panel{width:calc(100vw - 32px);right:16px;bottom:88px;}
}
`;

const SVG_FAB = `<svg viewBox="0 0 24 24" fill="none" stroke="#1a1330" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/><circle cx="8.5" cy="11.5" r="1" fill="#1a1330" stroke="none"/><circle cx="12" cy="11.5" r="1" fill="#1a1330" stroke="none"/><circle cx="15.5" cy="11.5" r="1" fill="#1a1330" stroke="none"/></svg>`;
const SVG_SEARCH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>`;
const SVG_CLOSE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
const SVG_CLIP = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;
const SVG_EMOJI = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`;
const SVG_SEND = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/></svg>`;
const SVG_FILE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>`;

const EMOJI_SET = ['😀','😁','😂','🙂','😉','😊','😍','😎','🤔','😅','😢','😡','👍','👎','🙏','👋','💪','🔥','🎉','✅','❌','⚠️','📎','🏠','💰','📅','⏳','❤️'];

function initials(name){
  return (name || '').trim().split(/\s+/).map(w => w[0]).filter(Boolean).slice(0,2).join('').toUpperCase() || '?';
}
function fmtTime(ts){
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('ru', {hour:'2-digit', minute:'2-digit'});
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера';
  const diffDays = Math.round((now - d) / 86400000);
  if (diffDays < 7) return d.toLocaleDateString('ru', {weekday:'short'});
  return d.toLocaleDateString('ru', {day:'2-digit', month:'2-digit'});
}
function fmtDayLabel(ts){
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Сегодня';
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru', {day:'2-digit', month:'long', year:'numeric'});
}
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

window.floxSupportChat = {
  _agent: null,
  _isStaff: false,
  _conversations: [],   // [{id, agent_id, agent_name, agent_agency, last_body, last_at, unread}]
  _activeConvId: null,
  _tab: 'all',          // 'all' | 'unread'
  _pollTimer: null,
  _panelOpen: false,
  _built: false,

  init() {
    if (!document.getElementById('sc-css')) {
      const s = document.createElement('style');
      s.id = 'sc-css'; s.textContent = CSS;
      document.head.appendChild(s);
    }
    if (!this._built) {
      this._buildDOM();
      this._built = true;
    }
    this._onAgentReady();
  },

  // Позвать явно, если агент авторизовался БЕЗ перезагрузки страницы (см.
  // renderAgent() в floxweb.html, рядом с floxTopbar._loadAgent()).
  _onAgentReady() {
    let agent = null;
    try { agent = JSON.parse(localStorage.getItem('flox-agent') || 'null'); } catch(e) {}
    if (!agent || !agent.id) {
      document.getElementById('fcFab')?.classList.remove('vis');
      return;
    }
    if (this._agent && this._agent.id === agent.id && this._pollTimer) return; // уже запущено для этого агента
    this._agent = agent;
    this._isStaff = agent.staff_role === 'support';
    document.getElementById('fcFab')?.classList.add('vis');
    this._bootstrap();
  },

  async _bootstrap() {
    try {
      if (!this._isStaff) {
        await this._ensureOwnConversation();
      }
      await this._loadConversations();
      this._renderList();
      if (!this._activeConvId && this._conversations.length) {
        this._selectConversation(this._conversations[0].id);
      }
      this._updateBadge();
    } catch(e) {
      console.error('[floxSupportChat] bootstrap error', e);
    }
    clearInterval(this._pollTimer);
    this._pollTimer = setInterval(() => this._poll(), POLL_MS);
  },

  async _poll() {
    if (!this._agent) return;
    try {
      await this._loadConversations();
      this._renderList();
      this._updateBadge();
      if (this._activeConvId && this._panelOpen) {
        await this._loadMessages(this._activeConvId, {silent:true});
      }
    } catch(e) { /* тихо — не мешаем агенту всплывающими ошибками сети раз в 5с */ }
  },

  // ── Данные ────────────────────────────────────────────────────────────
  async _ensureOwnConversation() {
    const r = await fetch(`${SUPABASE_URL}/support_conversations?agent_id=eq.${this._agent.id}&project_code=is.null&select=id`, {headers: SB});
    const rows = await r.json();
    if (Array.isArray(rows) && rows.length) { this._activeConvId = this._activeConvId || rows[0].id; return; }
    const cr = await fetch(`${SUPABASE_URL}/support_conversations`, {
      method: 'POST',
      headers: {...SB, 'Content-Type':'application/json', 'Prefer':'return=representation'},
      body: JSON.stringify({agent_id: this._agent.id, project_code: null}),
    });
    const created = await cr.json();
    if (Array.isArray(created) && created.length) this._activeConvId = created[0].id;
  },

  async _loadConversations() {
    let convRows;
    if (this._isStaff) {
      // 25.07.26: поддержка видит ВСЕ общие треды (project_code IS NULL),
      // с именем агента через встроенный select PostgREST по FK agents.
      const r = await fetch(`${SUPABASE_URL}/support_conversations?project_code=is.null&select=id,agent_id,created_at,agents(full_name,agency)`, {headers: SB});
      convRows = await r.json();
    } else {
      const r = await fetch(`${SUPABASE_URL}/support_conversations?agent_id=eq.${this._agent.id}&project_code=is.null&select=id,agent_id,created_at`, {headers: SB});
      convRows = await r.json();
    }
    if (!Array.isArray(convRows)) convRows = [];

    // N+1 к support_messages ради последнего сообщения/непрочитанных —
    // осознанно просто для MVP (ожидаемый объём — единицы/десятки тредов у
    // поддержки, не тысячи). Если тредов станет много — стоит переписать на
    // одну агрегирующую RPC-функцию в Supabase вместо цикла запросов.
    const withMeta = await Promise.all(convRows.map(async c => {
      const lastR = await fetch(`${SUPABASE_URL}/support_messages?conversation_id=eq.${c.id}&order=created_at.desc&limit=1&select=body,attachment_name,created_at,sender_agent_id`, {headers: SB});
      const last = (await lastR.json())[0];
      const unreadR = await fetch(`${SUPABASE_URL}/support_messages?conversation_id=eq.${c.id}&sender_agent_id=neq.${this._agent.id}&read_at=is.null&select=id`, {headers: SB});
      const unread = await unreadR.json();
      return {
        id: c.id,
        agent_id: c.agent_id,
        agent_name: this._isStaff ? (c.agents?.full_name || 'Агент') : 'Поддержка Flox',
        agent_agency: this._isStaff ? (c.agents?.agency || '—') : 'Ответим как можно скорее',
        last_body: last ? (last.body || (last.attachment_name ? `📎 ${last.attachment_name}` : '')) : '',
        last_from_me: last ? last.sender_agent_id === this._agent.id : false,
        last_at: last ? last.created_at : c.created_at,
        unread: Array.isArray(unread) ? unread.length : 0,
      };
    }));

    withMeta.sort((a,b) => new Date(b.last_at) - new Date(a.last_at));
    this._conversations = withMeta;
  },

  async _loadMessages(convId, opts) {
    const r = await fetch(`${SUPABASE_URL}/support_messages?conversation_id=eq.${convId}&order=created_at.asc&select=*`, {headers: SB});
    const msgs = await r.json();
    this._renderMessages(Array.isArray(msgs) ? msgs : []);
    // отмечаем прочитанным всё, что пришло не от меня
    const unreadIds = (Array.isArray(msgs) ? msgs : []).filter(m => m.sender_agent_id !== this._agent.id && !m.read_at).map(m => m.id);
    if (unreadIds.length) {
      fetch(`${SUPABASE_URL}/support_messages?id=in.(${unreadIds.join(',')})`, {
        method: 'PATCH', headers: {...SB, 'Content-Type':'application/json'},
        body: JSON.stringify({read_at: new Date().toISOString()}),
      }).catch(()=>{});
    }
    if (!opts || !opts.silent) this._scrollMsgsBottom();
  },

  async _sendMessage(convId, body, attachment) {
    const payload = {conversation_id: convId, sender_agent_id: this._agent.id, body: body || null};
    if (attachment) { payload.attachment_url = attachment.url; payload.attachment_name = attachment.name; }
    await fetch(`${SUPABASE_URL}/support_messages`, {
      method: 'POST', headers: {...SB, 'Content-Type':'application/json'},
      body: JSON.stringify(payload),
    });
    await this._loadMessages(convId);
    await this._loadConversations();
    this._renderList();
  },

  async _uploadAttachment(file) {
    const path = `${this._agent.id}/${Date.now()}_${file.name}`.replace(/\s+/g,'_');
    await fetch(`${SUPABASE_BASE}/storage/v1/object/support-attachments/${encodeURIComponent(path)}`, {
      method: 'POST',
      headers: {...SB, 'Content-Type': file.type || 'application/octet-stream'},
      body: file,
    });
    return {url: `${SUPABASE_BASE}/storage/v1/object/public/support-attachments/${encodeURIComponent(path)}`, name: file.name};
  },

  // ── DOM / рендер ──────────────────────────────────────────────────────
  _buildDOM() {
    const fab = document.createElement('button');
    fab.className = 'fc-fab'; fab.id = 'fcFab';
    fab.innerHTML = `<span class="fc-badge" id="fcBadge"></span>${SVG_FAB}`;
    fab.onclick = () => this._togglePanel();
    document.body.appendChild(fab);

    const panel = document.createElement('div');
    panel.className = 'fc-panel'; panel.id = 'fcPanel';
    panel.innerHTML = `
      <div class="fc-list-col">
        <div class="fc-list-head">
          <div class="fc-search">${SVG_SEARCH}<input id="fcSearchInput" placeholder="Поиск по чатам"></div>
        </div>
        <div class="fc-tabs">
          <button class="fc-tab act" id="fcTabAll">Все</button>
          <button class="fc-tab" id="fcTabUnread">Непрочитанные</button>
        </div>
        <div class="fc-list" id="fcList"></div>
      </div>
      <div class="fc-chat-col">
        <div class="fc-chat-head">
          <div class="fc-avatar" id="fcChatAvatar">?</div>
          <div>
            <div class="fc-chat-title" id="fcChatTitle">—</div>
            <div class="fc-chat-sub" id="fcChatSub">—</div>
          </div>
          <button class="fc-close" id="fcCloseBtn">${SVG_CLOSE}</button>
        </div>
        <div class="fc-msgs" id="fcMsgs"></div>
        <div class="fc-input-row">
          <button class="fc-icon-btn" id="fcAttachBtn" aria-label="Прикрепить файл">${SVG_CLIP}</button>
          <input type="file" id="fcFileInput" style="display:none">
          <input class="fc-input" id="fcInput" type="text" placeholder="Напишите сообщение…">
          <button class="fc-icon-btn" id="fcEmojiBtn" aria-label="Эмодзи">${SVG_EMOJI}</button>
          <div class="fc-emoji-pop" id="fcEmojiPop">${EMOJI_SET.map(e => `<button type="button">${e}</button>`).join('')}</div>
          <button class="fc-send" id="fcSendBtn" aria-label="Отправить">${SVG_SEND}</button>
        </div>
      </div>`;
    document.body.appendChild(panel);

    document.getElementById('fcCloseBtn').onclick = () => this._togglePanel(false);
    document.getElementById('fcTabAll').onclick = () => this._setTab('all');
    document.getElementById('fcTabUnread').onclick = () => this._setTab('unread');
    document.getElementById('fcSearchInput').oninput = () => this._renderList();

    const input = document.getElementById('fcInput');
    const send = () => this._handleSend();
    document.getElementById('fcSendBtn').onclick = send;
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });

    document.getElementById('fcAttachBtn').onclick = () => document.getElementById('fcFileInput').click();
    document.getElementById('fcFileInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file || !this._activeConvId) return;
      try {
        const uploaded = await this._uploadAttachment(file);
        await this._sendMessage(this._activeConvId, null, uploaded);
      } catch(err) { console.error('[floxSupportChat] upload error', err); }
    });

    const emojiBtn = document.getElementById('fcEmojiBtn');
    const emojiPop = document.getElementById('fcEmojiPop');
    emojiBtn.onclick = (e) => { e.stopPropagation(); emojiPop.classList.toggle('vis'); };
    emojiPop.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') { input.value += e.target.textContent; input.focus(); }
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.fc-emoji-pop') && e.target !== emojiBtn) emojiPop.classList.remove('vis');
    });
  },

  _togglePanel(force) {
    const panel = document.getElementById('fcPanel');
    this._panelOpen = force !== undefined ? force : !panel.classList.contains('open');
    panel.classList.toggle('open', this._panelOpen);
    if (this._panelOpen && this._activeConvId) this._loadMessages(this._activeConvId);
  },

  _setTab(tab) {
    this._tab = tab;
    document.getElementById('fcTabAll').classList.toggle('act', tab === 'all');
    document.getElementById('fcTabUnread').classList.toggle('act', tab === 'unread');
    this._renderList();
  },

  _selectConversation(id) {
    this._activeConvId = id;
    const c = this._conversations.find(x => x.id === id);
    if (c) {
      document.getElementById('fcChatAvatar').textContent = initials(c.agent_name);
      document.getElementById('fcChatTitle').textContent = c.agent_name;
      document.getElementById('fcChatSub').textContent = this._isStaff ? c.agent_agency : c.agent_agency;
    }
    this._renderList();
    this._loadMessages(id);
  },

  _handleSend() {
    const input = document.getElementById('fcInput');
    const body = input.value.trim();
    if (!body || !this._activeConvId) return;
    input.value = '';
    this._sendMessage(this._activeConvId, body);
  },

  _renderList() {
    const q = (document.getElementById('fcSearchInput')?.value || '').trim().toLowerCase();
    let list = this._conversations.slice();
    if (this._tab === 'unread') list = list.filter(c => c.unread > 0);
    if (q) list = list.filter(c => c.agent_name.toLowerCase().includes(q));

    const el = document.getElementById('fcList');
    if (!list.length) {
      el.innerHTML = `<div class="fc-empty">${q ? 'Ничего не найдено' : 'Пока нет диалогов'}</div>`;
      return;
    }
    el.innerHTML = list.map(c => `
      <div class="fc-item ${c.id === this._activeConvId ? 'act' : ''}" data-id="${c.id}">
        <div class="fc-avatar">${initials(c.agent_name)}</div>
        <div class="fc-item-body">
          <div class="fc-item-top"><span class="fc-item-name">${esc(c.agent_name)}</span><span class="fc-item-time">${fmtTime(c.last_at)}</span></div>
          <div class="fc-item-msg">${c.last_body ? (c.last_from_me ? 'Вы: ' : '') + esc(c.last_body) : '<span style="opacity:.7">Напишите, если будут вопросы</span>'}</div>
        </div>
        ${c.unread ? `<span class="fc-item-badge">${c.unread}</span>` : ''}
      </div>`).join('');
    el.querySelectorAll('.fc-item').forEach(node => {
      node.onclick = () => this._selectConversation(node.dataset.id);
    });
  },

  _renderMessages(msgs) {
    const el = document.getElementById('fcMsgs');
    if (!msgs.length) {
      el.innerHTML = `<div class="fc-hint">👋 Напишите нам, если возникнут вопросы — мы обязательно ответим.</div>`;
      return;
    }
    let html = '';
    let lastDay = null;
    for (const m of msgs) {
      const day = fmtDayLabel(m.created_at);
      if (day !== lastDay) { html += `<div class="fc-day">${day}</div>`; lastDay = day; }
      const out = m.sender_agent_id === this._agent.id;
      html += `<div class="fc-bubble ${out ? 'out' : 'in'}">`;
      if (m.body) html += esc(m.body);
      if (m.attachment_url) {
        html += `<div class="fc-bubble-file">${SVG_FILE}<a href="${esc(m.attachment_url)}" target="_blank" rel="noopener">${esc(m.attachment_name || 'файл')}</a></div>`;
      }
      html += `<span class="fc-bubble-time">${fmtTime(m.created_at)}</span></div>`;
    }
    el.innerHTML = html;
    this._scrollMsgsBottom();
  },

  _scrollMsgsBottom() {
    const el = document.getElementById('fcMsgs');
    if (el) el.scrollTop = el.scrollHeight;
  },

  _updateBadge() {
    const total = this._conversations.reduce((s,c) => s + (c.unread || 0), 0);
    const badge = document.getElementById('fcBadge');
    if (!badge) return;
    badge.textContent = total > 9 ? '9+' : String(total);
    badge.classList.toggle('vis', total > 0);
  },
};

})();
