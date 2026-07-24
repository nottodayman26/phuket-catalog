// ── FLOX SUPPORT CHAT — плавающая кнопка + мессенджер (поддержка + агенты) ──
// 25.07.26, по просьбе Ильи. Версия 2 — по образцу topbar.js (тот же стиль
// подключения). Изменения во второй версии (правки Ильи после первого
// прогона в бою):
//   1. Убрана обводка и уменьшена тень у всплывающего окна и у попапа эмодзи.
//   2. Исправлен баг "Поддержка Flox задвоилась" — см. _onAgentReady ниже
//      (синхронный флаг _bootstrapping вместо проверки только _pollTimer,
//      который выставлялся слишком поздно и допускал гонку) + требуется
//      SQL-патч support_chat_migration_v2.sql (частичный уникальный индекс
//      — Postgres не считает два NULL равными, поэтому старый
//      unique(agent_id, project_code) не мешал дублю общего треда).
//   3. Добавлена переписка МЕЖДУ АГЕНТАМИ + поиск по имени (agents.full_name
//      — то самое ФИО, которое меняет Илья как СЕО; имя треда всегда берём
//      свежим при каждой перезагрузке списка, не кэшируем).
//   4. Тред с поддержкой теперь называется "Техподдержка Агентов" (не
//      "Поддержка Flox").
//   5. Вложения-картинки (jpg/png/gif/webp/avif) открываются лайтбоксом
//      внутри страницы; остальные файлы по клику сразу скачиваются
//      (через ?download= у Supabase Storage — иначе кросс-доменная ссылка
//      просто открывалась бы криво в новой вкладке, как заметил Илья).
//   6. Эмодзи — свой расширенный набор с категориями и фильтром (не внешняя
//      библиотека: не смог из песочницы проверить, что CDN вроде jsdelivr/
//      unpkg реально отдаст emoji-picker-element в проде — рисковать
//      немым 404 на кнопке эмодзи не стал; сказал об этом Илье отдельно).
//   7. Перетаскивание файла в область переписки — тоже отправляет вложение.
//
// Версия 3 (26.07.26, по новой правке Ильи):
//   1. Поиск по агентам почему-то не находил даже полное ФИО в бою, хотя
//      мои тесты на мок-бэкенде проходили — грамматика PostgREST-фильтра
//      and=(...) не проверяема из песочницы (нет сетевого доступа к
//      реальному Supabase), поэтому решили не рисковать её и дальше:
//      теперь у сервера просим только простой одиночный ilike по ПЕРВОМУ
//      слову (уже проверенный, надёжный синтаксис) с запасом по limit, а
//      всю логику "каждое слово запроса должно быть подстрокой ФИО,
//      независимо от порядка" считаем на клиенте, в обычном JS — это можно
//      гарантированно проверить прямо тут. Заодно снижен порог минимальной
//      длины запроса (был 2 символа) — подсказки теперь показываются уже с
//      первого введённого символа.
//   2. Анимация выделения сообщения (правый клик): вместо рамки — плавное
//      увеличение (scale) и смена цвета из фиолетового (--accent) в
//      розовый (#FF6B6B, тот же акцентный розовый, что у круглой кнопки),
//      анимированное в обе стороны (выделение/снятие).
//   3. Анимация появления новых сообщений (текст/файл/картинка), от кого
//      угодно — см. _seenMsgIds и fc-appear ниже.
//   4. Клик по общему топбару (#flox-topbar — переключатель темы и всё
//      остальное там же, см. topbar.js) больше не закрывает открытое окно
//      саппорта как "клик снаружи".
//   5. Анимация наведения на "прикрепить файл"/эмодзи — вместо серого круга
//      теперь лёгкое увеличение (scale), цвет по наведению остался как был.
//   6. Сетка эмодзи: серый фон при наведении убран (тоже scale), сами эмодзи
//      увеличены.
//
// Подключать:  <script src="support-chat.js"></script>
// Вызвать:     floxSupportChat.init()
//              — flox-web.html и project.html: всегда;
//              — unit.html: только если !isClientMode.
//
// Требует ОБЕ миграции: support_chat_migration.sql, затем
// support_chat_migration_v2.sql (таблицы agent_conversations/agent_messages,
// починка дублей, партиционный уникальный индекс).

(function() {

const SUPABASE_URL = 'https://lqhuegdwglzkfzjcfxdx.supabase.co/rest/v1';
const SUPABASE_BASE = 'https://lqhuegdwglzkfzjcfxdx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxaHVlZ2R3Z2x6a2Z6amNmeGR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MjA5NjIsImV4cCI6MjA5NzM5Njk2Mn0.egEtZ5Av8tAD_Y6tKtWowxpbHoCiDezWEG5gWpEYNpo';
const SB = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
const POLL_MS = 5000;
const SEARCH_DEBOUNCE_MS = 300;
const IMAGE_EXT = ['jpg','jpeg','png','gif','webp','avif','bmp','svg'];

const TABLES = {
  support: { conv: 'support_conversations', msg: 'support_messages' },
  dm:      { conv: 'agent_conversations',    msg: 'agent_messages' },
};

// 24.07.26, по правке Ильи ("все что сейчас черное будет прозрачным"):
// значок на розовой кнопке раньше рисовался тёмным контуром (#1a1330)
// ПОВЕРХ розового круга. Теперь вместо этого форма значка (тот же контур
// чат-пузыря + три точки) вырезана как настоящая прозрачная дырка в CSS-маске,
// применённой к отдельному слою с розовой заливкой.
//
// Важный нюанс (столкнулись на практике): CSS mask-image по умолчанию в
// части браузеров использует АЛЬФА-канал источника, а не яркость цвета —
// если просто нарисовать белый фон и чёрные линии поверх (оба варианта
// полностью непрозрачны, alpha=1), с точки зрения альфа-маскирования разницы
// между ними нет вообще, и вырез не появляется. Поэтому дырки для контура и
// точек вырезаются ВНУТРИ самой SVG через <mask>, создавая настоящую
// прозрачность (alpha=0) в этих местах — тогда результат работает
// одинаково что при alpha-, что при luminance-маскировании снаружи.
// 24.07.26: первая версия маски (viewBox 24×24, mask-size:28×28) оставляла
// розовым только маленький квадратный патч в центре кнопки — за пределами
// этой мелкой области у CSS-маски "нет данных", а значит там всё прозрачно,
// а не розово, из-за чего пропадал сам круглый корпус кнопки ("иконка стала
// квадратной"). Правильно: маска должна занимать ВЕСЬ круг целиком (58×58,
// как сама кнопка), с белой заливкой на всю площадь — а контур/точки, тоже
// смещённые и увеличенные под тот же масштаб, вырезаны уже ВНУТРИ этого
// полного круга, как и было в исходном инлайн-значке (26px внутри 58px
// кнопки).
const FAB_MASK_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 58 58'><mask id='m'><rect width='58' height='58' fill='white'/><g transform='translate(16,16) scale(1.0833)'><path d='M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/><circle cx='8.5' cy='11.5' r='1' fill='black'/><circle cx='12' cy='11.5' r='1' fill='black'/><circle cx='15.5' cy='11.5' r='1' fill='black'/></g></mask><rect width='58' height='58' fill='white' mask='url(#m)'/></svg>`;

// ── CSS ────────────────────────────────────────────────────────────────
const CSS = `
:root{ --chat-pill-bg: var(--surface-2); }
body.light{ --chat-pill-bg: #ffffff; }

.fc-fab{
  position:fixed; right:28px; bottom:28px; width:58px; height:58px; border-radius:50%;
  /* 24.07.26, по правке Ильи: z-index поднят намного выше "фейкового
     полноэкрана" карты (см. .map-fake-fullscreen в floxweb.html/project.html/
     unit.html — это не настоящий Fullscreen API, а свой CSS-приём с
     z-index:999999999/99999), иначе кнопка пряталась под развёрнутой картой.
     Тень убрана совсем (была 0 2px 8px). Заливку теперь несёт внутренний
     .fc-fab-bg (см. ниже), сама кнопка — просто позиционирующий контейнер. */
  background:none; border:none; cursor:pointer; z-index:2147483000;
  display:flex; align-items:center; justify-content:center;
  box-shadow:none;
  transition:transform .2s cubic-bezier(.34,1.56,.64,1);
}
.fc-fab{display:none;}
.fc-fab.vis{display:flex;}
.fc-fab:hover{transform:scale(1.08);}
/* 24.07.26, по правке Ильи ("всё что сейчас черное будет прозрачным"):
   значок больше не рисуется тёмными линиями поверх розового круга — вместо
   этого его форма (контур чат-пузыря + три точки) вырезана из розовой
   заливки как CSS-маска: там, где раньше был тёмный контур, теперь настоящая
   прозрачность (см. FAB_MASK_SVG). Отдельный слой .fc-badge (счётчик
   непрочитанных) не задет маской — это соседний элемент, не часть этого
   слоя. */
.fc-fab-bg{
  position:absolute; inset:0; border-radius:50%; background:#FF6B6B;
  -webkit-mask-image:url("data:image/svg+xml,${encodeURIComponent(FAB_MASK_SVG)}");
  mask-image:url("data:image/svg+xml,${encodeURIComponent(FAB_MASK_SVG)}");
  -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat;
  -webkit-mask-position:center; mask-position:center;
  /* маска покрывает ВЕСЬ слой (сам круг), а не только значок — см. комментарий у FAB_MASK_SVG */
  -webkit-mask-size:100% 100%; mask-size:100% 100%;
}
.fc-fab .fc-badge{
  position:absolute; top:-2px; right:-2px; min-width:20px; height:20px; padding:0 5px;
  background:var(--accent,#5E17EB); color:#fff; border-radius:10px; font-size:11px; font-weight:700;
  display:none; align-items:center; justify-content:center; border:2px solid var(--bg,#0d0d18);
  z-index:1;
}
.fc-fab .fc-badge.vis{display:flex;}

/* 25.07.26, по правке Ильи: без обводки, тень заметно меньше (была
   0 20px 60px rgba(0,0,0,.4)). */
.fc-panel{
  position:fixed; right:28px; bottom:100px; width:860px; height:600px; max-width:calc(100vw - 56px);
  max-height:calc(100vh - 130px); background:var(--surface); border:none;
  border-radius:20px; box-shadow:0 4px 20px rgba(0,0,0,.18); z-index:2147483001;
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
.fc-avatar.fc-avatar-support{background:var(--accent-soft);color:var(--accent);}
.fc-item-body{flex:1;min-width:0;}
.fc-item-top{display:flex;justify-content:space-between;align-items:baseline;gap:6px;}
.fc-item-name{font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.fc-item-time{font-size:10.5px;color:var(--muted);flex-shrink:0;}
.fc-item-msg{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;}
.fc-item-badge{background:var(--accent);color:#fff;font-size:10.5px;font-weight:700;border-radius:9px;min-width:18px;height:18px;display:flex;align-items:center;justify-content:center;padding:0 4px;flex-shrink:0;}
.fc-empty{padding:24px 16px;color:var(--muted);font-size:12.5px;text-align:center;}
.fc-list-section-title{font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;padding:10px 16px 4px;}

.fc-chat-col{flex:1;display:flex;flex-direction:column;min-width:0;position:relative;}
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
/* 26.07.26: transition тут общий — используется и для анимации
   появления (fc-appear ниже), и для анимации выделения (.sel). */
.fc-bubble{max-width:68%;padding:9px 13px;border-radius:14px;font-size:13px;line-height:1.45;position:relative;white-space:pre-wrap;word-break:break-word;
  transition:transform .18s cubic-bezier(.34,1.56,.64,1), background-color .18s ease;}
.fc-bubble.in{align-self:flex-start;background:var(--surface-2);border-bottom-left-radius:4px;}
.fc-bubble.out{align-self:flex-end;background:var(--accent);color:#fff;border-bottom-right-radius:4px;}
.fc-bubble-time{display:block;font-size:10px;color:var(--muted);margin-top:4px;text-align:right;}
.fc-bubble.out .fc-bubble-time{color:rgba(255,255,255,.7);}
.fc-bubble-file{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.06);border-radius:10px;padding:8px 10px;font-size:12.5px;margin-top:2px;cursor:pointer;border:none;color:inherit;font-family:inherit;text-align:left;width:100%;}
.fc-bubble.out .fc-bubble-file{background:rgba(255,255,255,.15);}
.fc-bubble-file svg{width:16px;height:16px;flex-shrink:0;}
/* 24.07.26, по правке Ильи: убрана лупа-курсор (была cursor:zoom-in) —
   обычный указатель, картинка по клику всё так же открывается лайтбоксом. */
.fc-bubble-img{display:block;max-width:220px;max-height:220px;border-radius:10px;margin-top:2px;cursor:pointer;object-fit:cover;}
.fc-hint{color:var(--muted);font-size:12.5px;text-align:center;padding:20px;}

/* 24.07.26, по правке Ильи: удаление теперь не через иконку-корзину на
   сообщении, а через выделение правой кнопкой мыши (клик или зажать и
   провести по нескольким) — кнопка "отправить" при этом сама превращается в
   корзину (см. _updateSendButtonMode).
   26.07.26, по новой правке: вместо статичной рамки — анимация: сообщение
   слегка увеличивается и меняет цвет из фиолетового в розовый, плавно в обе
   стороны (выделение/снятие выделения, transition — на самом .fc-bubble
   выше). */
.fc-bubble.sel{transform:scale(1.045);}
.fc-bubble.out.sel{background:#FF6B6B;}

/* 26.07.26, по просьбе Ильи: анимация появления новых сообщений (текст,
   файлы, картинки) — независимо от того, кто пишет. Класс fc-appear
   навешивается только на ДЕЙСТВИТЕЛЬНО новые сообщения (см. _seenMsgIds в
   _renderMessages) — иначе анимация проигрывалась бы заново на всех старых
   сообщениях при каждом опросе (POLL_MS), где весь #fcMsgs перерисовывается
   целиком. */
@keyframes fc-msg-appear{
  from{opacity:0; transform:translateY(8px) scale(.96);}
  to{opacity:1; transform:translateY(0) scale(1);}
}
.fc-bubble.fc-appear{animation:fc-msg-appear .28s cubic-bezier(.34,1.4,.64,1);}

.fc-input-row{display:flex;align-items:center;gap:8px;padding:12px 16px;border-top:1px solid var(--line);position:relative;}
/* 26.07.26, по правке Ильи: серый круг при наведении убран — вместо него
   лёгкое увеличение (scale); смена цвета по наведению осталась как была
   ("Изменение цвета оставь как есть"). */
.fc-icon-btn{width:28px;height:28px;border-radius:50%;border:none;background:none;color:var(--muted);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform .15s cubic-bezier(.34,1.56,.64,1),color .15s;}
.fc-icon-btn:hover{background:none;color:var(--text);transform:scale(1.18);}
.fc-icon-btn svg{width:16px;height:16px;}
.fc-input{flex:1;background:var(--chat-pill-bg);border:1px solid var(--line-2);border-radius:20px;padding:10px 16px;color:var(--text);font-size:13px;outline:none;font-family:inherit;}
.fc-input::placeholder{color:var(--muted);}
.fc-send{width:32px;height:32px;border-radius:50%;border:none;background:var(--accent);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform .15s,background .15s;}
.fc-send:hover{transform:scale(1.06);}
.fc-send svg{width:14px;height:14px;}
.fc-send:disabled{opacity:.5;cursor:default;transform:none;}
.fc-send.fc-send-delete{background:#FF6B6B;}

/* 25.07.26, по правке Ильи: без обводки, тень меньше, свой скролл внутри
   (набор эмодзи вырос — иначе попап рос бы бесконечно вниз/вверх и вылезал
   за рамки окна, что и было "вышли за рамку"). Ширина/позиция подобраны
   так, чтобы гарантированно не вылезать за правый край панели. */
.fc-emoji-pop{
  position:absolute; bottom:calc(100% + 8px); right:8px; width:300px; max-width:calc(100vw - 40px);
  max-height:min(360px, calc(100vh - 160px));
  background:var(--surface); border:none; border-radius:14px; box-shadow:0 4px 16px rgba(0,0,0,.16);
  padding:10px; display:none; flex-direction:column; z-index:10;
}
.fc-emoji-pop.vis{display:flex;}
.fc-emoji-cat{font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;padding:4px 2px;}
/* 25.07.26: раньше свой скролл был у КАЖДОЙ категории (max-height:220px) —
   при нескольких категориях подряд их суммарная высота всё равно вылезала
   за рамки попапа и даже окна (это и была правка "эмодзи вышли за рамку").
   Теперь скроллится весь #fcEmojiBody целиком одним разом, а сам попап
   ограничен по высоте (см. .fc-emoji-pop выше) — вылезти уже не может. */
#fcEmojiBody{flex:1;min-height:0;overflow-y:auto;
  scrollbar-width:thin; scrollbar-color:var(--line-2) transparent;}
#fcEmojiBody::-webkit-scrollbar{width:6px;}
#fcEmojiBody::-webkit-scrollbar-track{background:transparent;}
#fcEmojiBody::-webkit-scrollbar-thumb{background:var(--line-2);border-radius:10px;}
/* 26.07.26, по правке Ильи: серый фон при наведении убран (тоже scale),
   сами эмодзи увеличены (было font-size:18px) — колонок в сетке стало
   меньше (6 вместо 7), чтобы бОльшим эмодзи не было тесно в той же ширине
   попапа. */
.fc-emoji-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:2px;}
.fc-emoji-grid button{border:none;background:none;font-size:24px;padding:6px;border-radius:8px;cursor:pointer;line-height:1;transition:transform .12s cubic-bezier(.34,1.56,.64,1);}
.fc-emoji-grid button:hover{background:none;transform:scale(1.25);}

/* Лайтбокс для картинок из чата */
.fc-lightbox{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:2147483200;display:none;align-items:center;justify-content:center;cursor:pointer;padding:40px;}
.fc-lightbox.vis{display:flex;}
.fc-lightbox img{max-width:100%;max-height:100%;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.5);}

/* 24.07.26: кнопка саппорта не нужна поверх собственного лайтбокса
   страницы (просмотр "Рендеры и фото"/"Поэтажный план" в project.html и
   unit.html) — прячем её на время просмотра, см. синхронизацию в _buildDOM. */
.fc-fab.fc-hidden-by-page{display:none !important;}

/* Подсветка зоны переписки при перетаскивании файла */
.fc-chat-col.fc-dragover::after{
  content:'Отпустите, чтобы отправить файл'; position:absolute; inset:8px; border:2px dashed var(--accent);
  border-radius:14px; background:var(--accent-soft); color:var(--accent); font-size:13px; font-weight:600;
  display:flex; align-items:center; justify-content:center; pointer-events:none; z-index:5;
}

@media (max-width:720px){
  .fc-list-col{display:none;}
  .fc-panel{width:calc(100vw - 32px);right:16px;bottom:88px;}
}
`;

const SVG_SEARCH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>`;
const SVG_CLOSE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
const SVG_CLIP = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;
const SVG_EMOJI = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`;
const SVG_SEND = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/></svg>`;
const SVG_FILE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>`;
const SVG_TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`;

// ── Расширенный набор эмодзи (без внешних библиотек — см. комментарий в
// шапке файла), с категориями. 24.07.26: поле поиска по эмодзи убрано по
// просьбе Ильи — просто категоризированная сетка. ──
const EMOJI_CATS = [
  { name: 'Смайлы', items: ['😀','😁','😂','🤣','😊','😉','😍','😘','😎','🤩','🙂','🙃','😇','🥳','🤔','🤨','😐','😑','😶','🙄','😏','😣','😥','😮','😯','😪','😫','😴','😌','😛','😜','😝','🤤','😒','😓','😔','😕','🙁','☹️','😖','😞','😟','😤','😢','😭','😦','😧','😨','😩','🤯','😬','😰','😱','🥵','🥶','😳','🤪','😵','🥴','😠','😡','🤬','😷','🤒','🤕','🤢','🤮','🥱'] },
  { name: 'Жесты', items: ['👍','👎','👏','🙌','🙏','🤝','👋','🤙','💪','✌️','🤞','🤟','👌','🤌','🖐️','✋','👊','✊','🤛','🤜','☝️','👉','👈','👆','👇','🫡','🫶'] },
  { name: 'Сердца', items: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝'] },
  { name: 'Дела и объекты', items: ['🏠','🏢','🏗️','🔑','📌','📎','📅','⏳','⏰','📞','📱','💻','📧','📝','📄','📁','📊','💰','💵','💳','🧾','✅','☑️','❌','❗','❓','⚠️','🔥','🎉','🎁','⭐','✨','🚀','🔒','🔓'] },
  { name: 'Природа и путешествия', items: ['🏖️','🌊','☀️','🌤️','☁️','🌧️','🌈','🌴','🌿','🌸','🚗','✈️','🏨','🗺️'] },
  { name: 'Еда', items: ['☕','🍵','🍕','🍔','🍎','🍉','🍰','🥂'] },
];
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
function isImageFile(name){
  const ext = (name || '').split('.').pop().toLowerCase();
  return IMAGE_EXT.includes(ext);
}
function pairSorted(a, b){ return [a, b].sort(); }
function debounce(fn, ms){
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

window.floxSupportChat = {
  _agent: null,
  _isStaff: false,
  _threads: [],          // объединённый список: support + dm
  _searchAgentsRaw: [],   // сырые результаты поиска по справочнику (агенты)
  _searchAgents: [],      // те же результаты, но без уже существующих чатов —
                          // пересчитывается в _renderList() при каждом рендере
                          // (24.07.26, см. комментарий в _renderList)
  _activeThreadId: null,
  _activeThreadKind: null,
  _tab: 'all',
  _pollTimer: null,
  _panelOpen: false,
  _built: false,
  _bootstrapping: false,
  _selectedMsgIds: new Set(),  // выбранные для удаления сообщения (правый клик)
  _lastRenderedMsgs: [],       // последний отрисованный список сообщений открытого чата
  _seenMsgIds: new Set(),      // 26.07.26: id сообщений, которые уже проигрывали анимацию
                                // появления (fc-appear) — сбрасывается при смене чата, см.
                                // _selectThread/_renderMessages

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

  _onAgentReady() {
    let agent = null;
    try { agent = JSON.parse(localStorage.getItem('flox-agent') || 'null'); } catch(e) {}
    if (!agent || !agent.id) {
      document.getElementById('fcFab')?.classList.remove('vis');
      return;
    }
    // 25.07.26: баг "Поддержка Flox задвоилась" был вызван именно тут —
    // проверка "уже запущено" смотрела только на this._pollTimer, который
    // выставляется в САМОМ КОНЦЕ асинхронного _bootstrap(). Если
    // _onAgentReady() вызывался дважды почти одновременно (init() внизу
    // страницы + renderAgent() чуть раньше/позже при разрешении логина без
    // перезагрузки), второй вызов успевал стартовать ДО того, как первый
    // выставит _pollTimer — оба запускали _ensureOwnConversation()
    // параллельно, оба не находили существующий тред (ещё не успел
    // создаться) и оба его создавали. Синхронный флаг _bootstrapping
    // выставляется НЕМЕДЛЕННО, а не по завершении, поэтому второй вызов
    // корректно останавливается. (SQL-патч v2 дополнительно защищает от
    // этого же на уровне базы — на случай гонки между вкладками/разными
    // JS-контекстами, где этот флаг не поможет.)
    if (this._agent && this._agent.id === agent.id && (this._pollTimer || this._bootstrapping)) return;
    this._agent = agent;
    this._isStaff = agent.staff_role === 'support';
    document.getElementById('fcFab')?.classList.add('vis');
    this._bootstrapping = true;
    this._bootstrap().finally(() => { this._bootstrapping = false; });
  },

  async _bootstrap() {
    try {
      if (!this._isStaff) await this._ensureOwnConversation();
      await this._loadAllThreads();
      this._renderList();
      if (!this._activeThreadId && this._threads.length) {
        this._selectThread(this._threads[0].id, this._threads[0].kind);
      } else {
        this._updateActiveHeader();
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
      await this._loadAllThreads();
      this._renderList();
      // 24.07.26, по просьбе Ильи: если СЕО поменял ФИО собеседника, пока
      // открыт чат с ним — заголовок над перепиской должен обновиться сам,
      // без переоткрытия чата (имя и так всегда читается свежим при каждой
      // подгрузке списка тредов, тут просто применяем это к уже открытому
      // заголовку, который раньше выставлялся только один раз при выборе).
      this._updateActiveHeader();
      this._updateBadge();
      if (this._activeThreadId && this._panelOpen) {
        await this._loadMessages(this._activeThreadId, this._activeThreadKind, {silent:true});
      }
    } catch(e) { /* тихо */ }
  },

  // ── Данные: тред с поддержкой ─────────────────────────────────────────
  async _ensureOwnConversation() {
    const r = await fetch(`${SUPABASE_URL}/support_conversations?agent_id=eq.${this._agent.id}&project_code=is.null&select=id`, {headers: SB});
    const rows = await r.json();
    if (Array.isArray(rows) && rows.length) return;
    try {
      await fetch(`${SUPABASE_URL}/support_conversations`, {
        method: 'POST',
        headers: {...SB, 'Content-Type':'application/json', 'Prefer':'return=minimal'},
        body: JSON.stringify({agent_id: this._agent.id, project_code: null}),
      });
    } catch(e) { /* частичный уникальный индекс в базе не даст создать дубль при гонке — не страшно */ }
  },

  async _loadSupportThreads() {
    let convRows;
    if (this._isStaff) {
      const r = await fetch(`${SUPABASE_URL}/support_conversations?project_code=is.null&select=id,agent_id,created_at,agents(full_name,agency)`, {headers: SB});
      convRows = await r.json();
    } else {
      const r = await fetch(`${SUPABASE_URL}/support_conversations?agent_id=eq.${this._agent.id}&project_code=is.null&select=id,agent_id,created_at`, {headers: SB});
      convRows = await r.json();
    }
    if (!Array.isArray(convRows)) convRows = [];

    return Promise.all(convRows.map(async c => {
      const meta = await this._loadThreadMeta('support', c.id);
      return {
        id: c.id, kind: 'support', agent_id: c.agent_id,
        // 25.07.26, по просьбе Ильи: раньше было "Поддержка Flox".
        name: this._isStaff ? (c.agents?.full_name || 'Агент') : 'Техподдержка Агентов',
        sub: this._isStaff ? (c.agents?.agency || '—') : 'Ответим как можно скорее',
        isSupportIcon: !this._isStaff,
        ...meta,
      };
    }));
  },

  // ── Данные: переписка между агентами ──────────────────────────────────
  async _loadDMThreads() {
    const r = await fetch(`${SUPABASE_URL}/agent_conversations?or=(agent_a_id.eq.${this._agent.id},agent_b_id.eq.${this._agent.id})&select=id,agent_a_id,agent_b_id,created_at`, {headers: SB});
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) return [];

    const otherIds = [...new Set(rows.map(c => c.agent_a_id === this._agent.id ? c.agent_b_id : c.agent_a_id))];
    const namesR = await fetch(`${SUPABASE_URL}/agents?id=in.(${otherIds.join(',')})&select=id,full_name,agency`, {headers: SB});
    const names = await namesR.json();
    const nameMap = {};
    (Array.isArray(names) ? names : []).forEach(a => { nameMap[a.id] = a; });

    return Promise.all(rows.map(async c => {
      const otherId = c.agent_a_id === this._agent.id ? c.agent_b_id : c.agent_a_id;
      const other = nameMap[otherId] || {};
      const meta = await this._loadThreadMeta('dm', c.id);
      return {
        id: c.id, kind: 'dm', agent_id: otherId,
        name: other.full_name || 'Агент',
        sub: other.agency || '—',
        isSupportIcon: false,
        ...meta,
      };
    }));
  },

  async _loadThreadMeta(kind, convId) {
    const t = TABLES[kind];
    const lastR = await fetch(`${SUPABASE_URL}/${t.msg}?conversation_id=eq.${convId}&order=created_at.desc&limit=1&select=body,attachment_name,created_at,sender_agent_id`, {headers: SB});
    const last = (await lastR.json())[0];
    const unreadR = await fetch(`${SUPABASE_URL}/${t.msg}?conversation_id=eq.${convId}&sender_agent_id=neq.${this._agent.id}&read_at=is.null&select=id`, {headers: SB});
    const unread = await unreadR.json();
    return {
      last_body: last ? (last.body || (last.attachment_name ? `📎 ${last.attachment_name}` : '')) : '',
      last_from_me: last ? last.sender_agent_id === this._agent.id : false,
      last_at: last ? last.created_at : null,
      unread: Array.isArray(unread) ? unread.length : 0,
    };
  },

  async _loadAllThreads() {
    const [support, dms] = await Promise.all([this._loadSupportThreads(), this._loadDMThreads()]);
    const all = [...support, ...dms];
    // Тред с поддержкой всегда закреплён первым для обычного агента; для
    // всех остальных элементов — сортировка по последней активности.
    all.sort((a, b) => {
      if (!this._isStaff) {
        if (a.kind === 'support') return -1;
        if (b.kind === 'support') return 1;
      }
      return new Date(b.last_at || b.created_at || 0) - new Date(a.last_at || a.created_at || 0);
    });
    this._threads = all;
  },

  async _loadMessages(convId, kind, opts) {
    const t = TABLES[kind];
    const r = await fetch(`${SUPABASE_URL}/${t.msg}?conversation_id=eq.${convId}&order=created_at.asc&select=*`, {headers: SB});
    const msgs = await r.json();
    this._renderMessages(Array.isArray(msgs) ? msgs : []);
    const unreadIds = (Array.isArray(msgs) ? msgs : []).filter(m => m.sender_agent_id !== this._agent.id && !m.read_at).map(m => m.id);
    if (unreadIds.length) {
      fetch(`${SUPABASE_URL}/${t.msg}?id=in.(${unreadIds.join(',')})`, {
        method: 'PATCH', headers: {...SB, 'Content-Type':'application/json'},
        body: JSON.stringify({read_at: new Date().toISOString()}),
      }).catch(()=>{});
    }
    if (!opts || !opts.silent) this._scrollMsgsBottom();
  },

  async _sendMessage(convId, kind, body, attachment) {
    const t = TABLES[kind];
    const payload = {conversation_id: convId, sender_agent_id: this._agent.id, body: body || null};
    if (attachment) { payload.attachment_url = attachment.url; payload.attachment_name = attachment.name; }
    await fetch(`${SUPABASE_URL}/${t.msg}`, {
      method: 'POST', headers: {...SB, 'Content-Type':'application/json'},
      body: JSON.stringify(payload),
    });
    await this._loadMessages(convId, kind);
    await this._loadAllThreads();
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

  // ── Переписка с новым агентом (поиск по имени) ────────────────────────
  async _ensureDMConversation(otherAgentId) {
    const [a, b] = pairSorted(this._agent.id, otherAgentId);
    const r = await fetch(`${SUPABASE_URL}/agent_conversations?agent_a_id=eq.${a}&agent_b_id=eq.${b}&select=id`, {headers: SB});
    const rows = await r.json();
    if (Array.isArray(rows) && rows.length) return rows[0].id;
    try {
      const cr = await fetch(`${SUPABASE_URL}/agent_conversations`, {
        method: 'POST',
        headers: {...SB, 'Content-Type':'application/json', 'Prefer':'return=representation'},
        body: JSON.stringify({agent_a_id: a, agent_b_id: b}),
      });
      const created = await cr.json();
      if (Array.isArray(created) && created.length) return created[0].id;
    } catch(e) {}
    // гонка — партиционный уникальный индекс не дал создать дубль, перечитываем
    const r2 = await fetch(`${SUPABASE_URL}/agent_conversations?agent_a_id=eq.${a}&agent_b_id=eq.${b}&select=id`, {headers: SB});
    const rows2 = await r2.json();
    return rows2[0]?.id;
  },

  async _searchAgentsDirectory(q) {
    // 26.07.26, по новой правке Ильи ("до сих пор не работает"): прошлый
    // вариант (группировка нескольких ilike-условий через and=(...)) прошёл
    // мои тесты на мок-бэкенде, но не сработал в бою на реальном Supabase —
    // из песочницы нет сетевого доступа к настоящему PostgREST, поэтому я не
    // могу проверить, в чём именно там дело (кодирование URL, сам ли
    // and=(...) синтаксис — что угодно). Раз это непроверяемо отсюда,
    // безопаснее не полагаться на непроверенный серверный синтаксис вовсе:
    // просим у сервера только ОДИН простой ilike-фильтр (по первому слову
    // запроса — уже проверенный, надёжный вид фильтра, тот же, что и раньше
    // прекрасно работал для одиночных слов) с запасом по limit, а дальше
    // ВСЮ логику "каждое слово запроса должно быть подстрокой ФИО, в любом
    // порядке слов, без учёта регистра" считаем прямо здесь, в обычном JS —
    // это можно гарантированно проверить в этой же песочнице.
    // Заодно снижен порог: раньше нужно было минимум 2 символа, теперь
    // подсказки показываются уже с первого введённого символа (в любом
    // регистре — ilike и так регистронезависим, а сравнение оставшихся слов
    // на клиенте тоже идёт через toLowerCase()).
    const terms = (q || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) { this._searchAgentsRaw = []; this._renderList(); return; }
    try {
      const r = await fetch(`${SUPABASE_URL}/agents?full_name=ilike.*${encodeURIComponent(terms[0])}*&id=neq.${this._agent.id}&select=id,full_name,agency&limit=30`, {headers: SB});
      const rows = await r.json();
      const candidates = Array.isArray(rows) ? rows : [];
      this._searchAgentsRaw = candidates
        .filter(a => {
          const name = (a.full_name || '').toLowerCase();
          return terms.every(t => name.includes(t));
        })
        .slice(0, 8);
    } catch(e) { this._searchAgentsRaw = []; }
    this._renderList();
  },

  async _startDM(agentId, name, agency) {
    document.getElementById('fcSearchInput').value = '';
    this._searchAgentsRaw = [];
    // 24.07.26, фикс бага "чат задваивается": если чат с этим агентом уже
    // есть в списке, просто открываем его напрямую, без похода на сервер —
    // раньше в редком случае (гонка: поиск отработал раньше, чем успел
    // прогрузиться список тредов) уже существующий собеседник мог мелькнуть
    // в разделе "Начать новый чат", и клик по нему создавал вторую видимую
    // строку с тем же чатом.
    const existing = this._threads.find(t => t.kind === 'dm' && String(t.agent_id) === String(agentId));
    if (existing) { this._renderList(); this._selectThread(existing.id, 'dm'); return; }
    const convId = await this._ensureDMConversation(agentId);
    if (!convId) { this._renderList(); return; }
    await this._loadAllThreads();
    this._renderList();
    this._selectThread(convId, 'dm');
  },

  // ── DOM / рендер ──────────────────────────────────────────────────────
  _buildDOM() {
    const fab = document.createElement('button');
    fab.className = 'fc-fab'; fab.id = 'fcFab';
    fab.innerHTML = `<span class="fc-fab-bg"></span><span class="fc-badge" id="fcBadge"></span>`;
    fab.onclick = () => this._togglePanel();
    document.body.appendChild(fab);

    const panel = document.createElement('div');
    panel.className = 'fc-panel'; panel.id = 'fcPanel';
    panel.innerHTML = `
      <div class="fc-list-col">
        <div class="fc-list-head">
          <div class="fc-search">${SVG_SEARCH}<input id="fcSearchInput" placeholder="Поиск по чатам или агентам"></div>
        </div>
        <div class="fc-tabs">
          <button class="fc-tab act" id="fcTabAll">Все</button>
          <button class="fc-tab" id="fcTabUnread">Непрочитанные</button>
        </div>
        <div class="fc-list" id="fcList"></div>
      </div>
      <div class="fc-chat-col" id="fcChatCol">
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
          <div class="fc-emoji-pop" id="fcEmojiPop">
            <div id="fcEmojiBody"></div>
          </div>
          <button class="fc-send" id="fcSendBtn" aria-label="Отправить">${SVG_SEND}</button>
        </div>
      </div>`;
    document.body.appendChild(panel);

    const lightbox = document.createElement('div');
    lightbox.className = 'fc-lightbox'; lightbox.id = 'fcLightbox';
    lightbox.innerHTML = `<img id="fcLightboxImg" src="">`;
    lightbox.onclick = () => lightbox.classList.remove('vis');
    document.body.appendChild(lightbox);

    // 24.07.26, по правке Ильи: пока открыт СВОЙ лайтбокс страницы (просмотр
    // "Рендеры и фото"/"Поэтажный план" — элемент #lightbox в project.html и
    // unit.html, не путать с нашим #fcLightbox для картинок из чата), кнопка
    // саппорта не нужна и мешает — прячем её (и закрываем своё окно, если
    // было открыто), пока их лайтбокс открыт. На floxweb.html такого
    // элемента нет — просто ничего не делаем.
    const pageLightbox = document.getElementById('lightbox');
    if (pageLightbox) {
      const syncWithPageLightbox = () => {
        const hide = pageLightbox.classList.contains('open');
        fab.classList.toggle('fc-hidden-by-page', hide);
        if (hide && this._panelOpen) this._togglePanel(false);
      };
      new MutationObserver(syncWithPageLightbox).observe(pageLightbox, { attributes: true, attributeFilter: ['class'] });
      syncWithPageLightbox();
    }

    document.getElementById('fcCloseBtn').onclick = () => this._togglePanel(false);
    document.getElementById('fcTabAll').onclick = () => this._setTab('all');
    document.getElementById('fcTabUnread').onclick = () => this._setTab('unread');

    const searchInput = document.getElementById('fcSearchInput');
    const doSearch = debounce(() => this._searchAgentsDirectory(searchInput.value.trim()), SEARCH_DEBOUNCE_MS);
    searchInput.oninput = () => { this._renderList(); doSearch(); };

    const input = document.getElementById('fcInput');
    // 24.07.26, по правке Ильи: пока выбраны сообщения (см. _bindMessageSelection
    // ниже), клик по этой кнопке удаляет их вместо отправки текста — сама
    // иконка при этом меняется на корзину (см. _updateSendButtonMode). Enter
    // в поле ввода всегда означает "отправить" — это про сам текст, не про
    // выделение.
    document.getElementById('fcSendBtn').onclick = () => {
      if (this._selectedMsgIds.size > 0) this._deleteSelectedMessages();
      else this._handleSend();
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._handleSend(); } });

    document.getElementById('fcAttachBtn').onclick = () => document.getElementById('fcFileInput').click();
    document.getElementById('fcFileInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) await this._handleFileSend(file);
    });

    // ── Перетаскивание файла в область переписки ──
    const chatCol = document.getElementById('fcChatCol');
    let dragDepth = 0;
    chatCol.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; chatCol.classList.add('fc-dragover'); });
    chatCol.addEventListener('dragover', (e) => e.preventDefault());
    chatCol.addEventListener('dragleave', (e) => { e.preventDefault(); dragDepth = Math.max(0, dragDepth-1); if (!dragDepth) chatCol.classList.remove('fc-dragover'); });
    chatCol.addEventListener('drop', async (e) => {
      e.preventDefault(); dragDepth = 0; chatCol.classList.remove('fc-dragover');
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) await this._handleFileSend(file);
    });

    // ── Эмодзи (24.07.26: поле поиска убрано — просто сетка по категориям) ──
    const emojiBtn = document.getElementById('fcEmojiBtn');
    const emojiPop = document.getElementById('fcEmojiPop');
    this._renderEmojiBody();
    emojiBtn.onclick = (e) => { e.stopPropagation(); emojiPop.classList.toggle('vis'); };
    document.getElementById('fcEmojiBody').addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') { input.value += e.target.textContent; input.focus(); }
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.fc-emoji-pop') && e.target !== emojiBtn) emojiPop.classList.remove('vis');
    });

    // 24.07.26, по просьбе Ильи: клик вне всплывающего окна — закрывает его
    // (сам fcFab и лайтбокс исключены, чтобы не конфликтовать с их
    // собственными обработчиками клика). Нарочно слушаем mousedown, а не
    // click: клик по пункту списка (например, выбор другого чата) сам
    // синхронно перерисовывает #fcList (см. _selectThread → _renderList),
    // из-за чего исходный e.target у события click успевает отсоединиться от
    // документа ещё до того, как всплытие дойдёт до document — closest()
    // на отсоединённом узле не находит '#fcPanel', и клик по своему же
    // списку внутри окна ошибочно закрывал бы его. mousedown происходит
    // раньше любых таких перерисовок, поэтому e.target на этот момент ещё
    // точно живой и внутри панели.
    // 26.07.26, по правке Ильи: переключение темы (тёмная/светлая) больше не
    // должно закрывать открытое окно саппорта. Сам переключатель темы живёт
    // внутри общего топбара — контейнер #flox-topbar, куда его рендерит
    // topbar.js (проверено напрямую в floxweb.html/project.html/unit.html —
    // везде один и тот же <div id="flox-topbar">...</div>, см. комментарии
    // рядом с ним про topbar.js). Само переключение темы — это просто
    // document.body.classList.toggle('light') без перезагрузки страницы, так
    // что наше окно и так пережило бы его; закрывалось оно только потому,
    // что клик по любой кнопке топбара (в т.ч. по переключателю темы)
    // технически происходит вне #fcPanel/#fcFab/#fcLightbox и раньше
    // засчитывался как "клик снаружи". Добавили #flox-topbar в исключения
    // целиком — так это работает независимо от того, как именно устроена
    // кнопка темы внутри topbar.js.
    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // правая кнопка обрабатывается отдельно, см. _bindMessageSelection
      if (!this._panelOpen) return;
      if (e.target.closest('#fcPanel') || e.target.closest('#fcFab') || e.target.closest('#fcLightbox') || e.target.closest('#flox-topbar')) return;
      this._togglePanel(false);
    });

    // Клики внутри переписки (левая кнопка): картинка → лайтбокс, файл → скачивание
    document.getElementById('fcMsgs').addEventListener('click', (e) => {
      const img = e.target.closest('.fc-bubble-img');
      if (img) {
        document.getElementById('fcLightboxImg').src = img.src;
        lightbox.classList.add('vis');
        return;
      }
      const fileBtn = e.target.closest('.fc-bubble-file');
      if (fileBtn && fileBtn.dataset.url) {
        const a = document.createElement('a');
        a.href = fileBtn.dataset.url + (fileBtn.dataset.url.includes('?') ? '&' : '?') + 'download=' + encodeURIComponent(fileBtn.dataset.name || '');
        a.download = fileBtn.dataset.name || '';
        document.body.appendChild(a); a.click(); a.remove();
      }
    });

    this._bindMessageSelection(document.getElementById('fcMsgs'));
  },

  // 24.07.26, по правке Ильи: удаление сообщений теперь через выделение
  // правой кнопкой мыши — щёлкнуть по своему сообщению (выделяет/снимает
  // выделение), либо зажать правую кнопку и провести по нескольким подряд.
  // Пока выделено хотя бы одно — кнопка "отправить" превращается в корзину
  // (см. _updateSendButtonMode); повторный правый клик по уже выделенному
  // сообщению снимает с него выделение. Своё подтверждение убрано по явной
  // просьбе Ильи — клик по кнопке-корзине удаляет сразу.
  _bindMessageSelection(msgsEl) {
    let dragging = false;
    let touched = new Set();

    msgsEl.addEventListener('contextmenu', (e) => { e.preventDefault(); });

    msgsEl.addEventListener('mousedown', (e) => {
      if (e.button !== 2) return;
      const bubble = e.target.closest('.fc-bubble.out');
      if (!bubble || !bubble.dataset.msgid) return;
      dragging = true;
      touched = new Set([bubble.dataset.msgid]);
      this._toggleMsgSelected(bubble.dataset.msgid);
    });

    msgsEl.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const bubble = under && under.closest('.fc-bubble.out');
      if (!bubble || !bubble.dataset.msgid) return;
      const id = bubble.dataset.msgid;
      if (touched.has(id)) return;
      touched.add(id);
      this._toggleMsgSelected(id);
    });

    const endDrag = () => { dragging = false; touched = new Set(); };
    document.addEventListener('mouseup', (e) => { if (e.button === 2) endDrag(); });
    document.addEventListener('mouseleave', endDrag);
  },

  _toggleMsgSelected(msgId) {
    if (this._selectedMsgIds.has(msgId)) this._selectedMsgIds.delete(msgId);
    else this._selectedMsgIds.add(msgId);
    document.querySelectorAll('#fcMsgs .fc-bubble').forEach(el => {
      el.classList.toggle('sel', this._selectedMsgIds.has(el.dataset.msgid));
    });
    this._updateSendButtonMode();
  },

  _updateSendButtonMode() {
    const btn = document.getElementById('fcSendBtn');
    if (!btn) return;
    const hasSel = this._selectedMsgIds.size > 0;
    btn.classList.toggle('fc-send-delete', hasSel);
    btn.innerHTML = hasSel ? SVG_TRASH : SVG_SEND;
    btn.setAttribute('aria-label', hasSel ? 'Удалить выбранные сообщения' : 'Отправить');
  },

  // Удаляет все выбранные сообщения (и их вложения из Storage, best-effort)
  // одним разом — без модального подтверждения, по прямой просьбе Ильи.
  async _deleteSelectedMessages() {
    const ids = Array.from(this._selectedMsgIds);
    if (!ids.length) return;
    const kind = this._activeThreadKind;
    const t = TABLES[kind];
    const urls = (this._lastRenderedMsgs || [])
      .filter(m => ids.includes(m.id) && m.attachment_url)
      .map(m => m.attachment_url);
    try {
      await fetch(`${SUPABASE_URL}/${t.msg}?id=in.(${ids.join(',')})`, { method: 'DELETE', headers: SB });
    } catch(e) { console.error('[floxSupportChat] bulk delete error', e); }
    for (const url of urls) {
      try {
        const marker = '/storage/v1/object/public/';
        const idx = url.indexOf(marker);
        if (idx !== -1) {
          const objectPath = url.slice(idx + marker.length);
          await fetch(`${SUPABASE_BASE}/storage/v1/object/${objectPath}`, { method: 'DELETE', headers: SB });
        }
      } catch(e) { /* тихо */ }
    }
    this._selectedMsgIds.clear();
    this._updateSendButtonMode();
    await this._loadMessages(this._activeThreadId, this._activeThreadKind, {silent:true});
    await this._loadAllThreads();
    this._renderList();
  },

  // 24.07.26: поле поиска по эмодзи убрано по просьбе Ильи — рендерим сразу
  // всю категоризированную сетку целиком, без фильтра.
  _renderEmojiBody() {
    const el = document.getElementById('fcEmojiBody');
    el.innerHTML = EMOJI_CATS.map(cat => `
      <div class="fc-emoji-cat">${cat.name}</div>
      <div class="fc-emoji-grid">${cat.items.map(e => `<button type="button">${e}</button>`).join('')}</div>
    `).join('');
  },

  async _handleFileSend(file) {
    const thread = this._threads.find(t => t.id === this._activeThreadId);
    if (!thread) return;
    try {
      const uploaded = await this._uploadAttachment(file);
      await this._sendMessage(thread.id, thread.kind, null, uploaded);
    } catch(err) { console.error('[floxSupportChat] upload error', err); }
  },

  _togglePanel(force) {
    const panel = document.getElementById('fcPanel');
    this._panelOpen = force !== undefined ? force : !panel.classList.contains('open');
    panel.classList.toggle('open', this._panelOpen);
    if (this._panelOpen && this._activeThreadId) this._loadMessages(this._activeThreadId, this._activeThreadKind);
  },

  _setTab(tab) {
    this._tab = tab;
    document.getElementById('fcTabAll').classList.toggle('act', tab === 'all');
    document.getElementById('fcTabUnread').classList.toggle('act', tab === 'unread');
    this._renderList();
  },

  _selectThread(id, kind) {
    this._activeThreadId = id;
    this._activeThreadKind = kind;
    // 24.07.26: выделение для удаления — только в рамках одного открытого
    // чата, при переключении на другой сбрасываем.
    this._selectedMsgIds.clear();
    // 26.07.26: тоже сбрасываем при смене чата — иначе анимация появления
    // (fc-appear) не проигралась бы для сообщений уже открытого раньше чата,
    // если открыть его снова.
    this._seenMsgIds = new Set();
    this._updateSendButtonMode();
    this._updateActiveHeader();
    this._renderList();
    this._loadMessages(id, kind);
  },

  // 24.07.26: вынесено из _selectThread отдельно, чтобы можно было обновлять
  // заголовок открытого чата и без повторного выбора — например, когда СЕО
  // поменял ФИО собеседнику, пока чат с ним уже открыт (см. вызов в _poll).
  _updateActiveHeader() {
    if (!this._activeThreadId) return;
    const t = this._threads.find(x => x.id === this._activeThreadId && x.kind === this._activeThreadKind);
    if (!t) return;
    const av = document.getElementById('fcChatAvatar');
    av.textContent = initials(t.name);
    av.classList.toggle('fc-avatar-support', !!t.isSupportIcon);
    document.getElementById('fcChatTitle').textContent = t.name;
    document.getElementById('fcChatSub').textContent = t.sub;
  },

  _handleSend() {
    const input = document.getElementById('fcInput');
    const body = input.value.trim();
    const thread = this._threads.find(t => t.id === this._activeThreadId);
    if (!body || !thread) return;
    input.value = '';
    this._sendMessage(thread.id, thread.kind, body);
  },

  _renderList() {
    const q = (document.getElementById('fcSearchInput')?.value || '').trim().toLowerCase();
    let list = this._threads.slice();
    // 24.07.26, по правке Ильи: личный чат с агентом (не техподдержка)
    // показывается слева, только если в нём реально есть хоть одно
    // сообщение — иначе просто открыть чей-то профиль через поиск (или
    // случайно кликнуть) навсегда оставляло пустую "плашку" в списке; если
    // все сообщения потом удалить, чат таким же образом пропадёт из списка
    // сам. Тред с техподдержкой закреплён и виден всегда, даже пустой —
    // это осознанно (подсказка новым агентам, куда писать).
    list = list.filter(c => c.kind === 'support' || !!c.last_at);
    if (this._tab === 'unread') list = list.filter(c => c.unread > 0);
    if (q) list = list.filter(c => c.name.toLowerCase().includes(q));

    // 24.07.26, фикс "чат задваивается": исключаем из результатов поиска по
    // справочнику тех, с кем чат уже есть — пересчитываем здесь, при каждом
    // рендере (а не один раз в момент запроса к серверу), чтобы не зависеть
    // от того, что успело подгрузиться раньше — список тредов или ответ
    // поиска.
    const knownIds = new Set(this._threads.map(t => String(t.agent_id)));
    this._searchAgents = (this._searchAgentsRaw || []).filter(a => !knownIds.has(String(a.id)));

    const el = document.getElementById('fcList');
    let html = '';

    if (!list.length && !this._searchAgents.length) {
      html = `<div class="fc-empty">${q ? 'Ничего не найдено' : 'Пока нет диалогов'}</div>`;
    } else {
      html += list.map(c => `
        <div class="fc-item ${c.id === this._activeThreadId && c.kind === this._activeThreadKind ? 'act' : ''}" data-id="${c.id}" data-kind="${c.kind}">
          <div class="fc-avatar ${c.isSupportIcon ? 'fc-avatar-support' : ''}">${initials(c.name)}</div>
          <div class="fc-item-body">
            <div class="fc-item-top"><span class="fc-item-name">${esc(c.name)}</span><span class="fc-item-time">${c.last_at ? fmtTime(c.last_at) : ''}</span></div>
            <div class="fc-item-msg">${c.last_body ? (c.last_from_me ? 'Вы: ' : '') + esc(c.last_body) : '<span style="opacity:.7">Напишите, если будут вопросы</span>'}</div>
          </div>
          ${c.unread ? `<span class="fc-item-badge">${c.unread}</span>` : ''}
        </div>`).join('');
    }

    if (this._searchAgents.length) {
      html += `<div class="fc-list-section-title">Начать новый чат</div>`;
      html += this._searchAgents.map(a => `
        <div class="fc-item" data-newagent="${a.id}" data-name="${esc(a.full_name)}" data-agency="${esc(a.agency || '')}">
          <div class="fc-avatar">${initials(a.full_name)}</div>
          <div class="fc-item-body">
            <div class="fc-item-top"><span class="fc-item-name">${esc(a.full_name)}</span></div>
            <div class="fc-item-msg">${esc(a.agency || 'Агент Flox')}</div>
          </div>
        </div>`).join('');
    }

    el.innerHTML = html;
    el.querySelectorAll('.fc-item[data-id]').forEach(node => {
      node.onclick = () => this._selectThread(node.dataset.id, node.dataset.kind);
    });
    el.querySelectorAll('.fc-item[data-newagent]').forEach(node => {
      node.onclick = () => this._startDM(node.dataset.newagent, node.dataset.name, node.dataset.agency);
    });
  },

  _renderMessages(msgs) {
    const el = document.getElementById('fcMsgs');
    // 24.07.26: нужно для _deleteSelectedMessages (искать вложения выбранных
    // сообщений) и для сохранения подсветки выделения между опросами.
    this._lastRenderedMsgs = msgs;
    if (!msgs.length) {
      el.innerHTML = `<div class="fc-hint">👋 Напишите, если возникнут вопросы — мы обязательно ответим.</div>`;
      return;
    }
    let html = '';
    let lastDay = null;
    for (const m of msgs) {
      const day = fmtDayLabel(m.created_at);
      if (day !== lastDay) { html += `<div class="fc-day">${day}</div>`; lastDay = day; }
      const out = m.sender_agent_id === this._agent.id;
      const sel = this._selectedMsgIds.has(m.id) ? ' sel' : '';
      // 26.07.26, по просьбе Ильи: анимация появления — только для
      // ДЕЙСТВИТЕЛЬНО новых сообщений (ещё не было в _seenMsgIds), иначе
      // при каждом опросе (POLL_MS) весь #fcMsgs перерисовывается целиком и
      // анимация проигрывалась бы заново на всех старых сообщениях тоже.
      const appear = this._seenMsgIds.has(m.id) ? '' : ' fc-appear';
      html += `<div class="fc-bubble ${out ? 'out' : 'in'}${sel}${appear}" data-msgid="${esc(m.id)}">`;
      if (m.body) html += esc(m.body);
      if (m.attachment_url) {
        if (isImageFile(m.attachment_name)) {
          html += `<img class="fc-bubble-img" src="${esc(m.attachment_url)}" alt="${esc(m.attachment_name || '')}">`;
        } else {
          html += `<button type="button" class="fc-bubble-file" data-url="${esc(m.attachment_url)}" data-name="${esc(m.attachment_name || 'файл')}">${SVG_FILE}${esc(m.attachment_name || 'файл')}</button>`;
        }
      }
      html += `<span class="fc-bubble-time">${fmtTime(m.created_at)}</span></div>`;
    }
    el.innerHTML = html;
    msgs.forEach(m => this._seenMsgIds.add(m.id));
    this._scrollMsgsBottom();
  },

  _scrollMsgsBottom() {
    const el = document.getElementById('fcMsgs');
    if (el) el.scrollTop = el.scrollHeight;
  },

  _updateBadge() {
    const total = this._threads.reduce((s,c) => s + (c.unread || 0), 0);
    const badge = document.getElementById('fcBadge');
    if (!badge) return;
    badge.textContent = total > 9 ? '9+' : String(total);
    badge.classList.toggle('vis', total > 0);
  },
};

})();
