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
// Версия 4 (26.07.26, по новой правке Ильи — поиск всё ещё не работал):
//   1. Поиск по ФИО так и не заработал в бою даже после версии 3 (хотя все
//      мои тесты на мок-бэкенде проходили) — раз уже ВТОРАЯ по счёту версия
//      логики фильтра не помогла, дело, вероятно, не в синтаксисе запроса, а
//      в чём-то, чего мок-бэкенд просто не может воспроизвести (ошибка
//      самого запроса на реальном Supabase — RLS, HTTP-статус и т.п.). Раньше
//      такая ошибка тихо проглатывалась в catch. Теперь подробно логируется
//      в консоль браузера (URL запроса, HTTP-статус, тело ответа при ошибке)
//      — см. _searchAgentsDirectory. Нужно открыть консоль (F12 → Console),
//      повторить неудачный поиск и прислать то, что выведется строкой
//      "[floxSupportChat] search" — по этому будет видно точную причину.
//   2. Цвет анимации выделения сообщения (#FF6B6B) показался слишком ярким —
//      заменён на приглушённый --sel-pink (#C97F80), тот же цвет теперь и у
//      кнопки-корзины в режиме удаления.
//   3. Всплывающее окно эмодзи: убран нежелательный горизонтальный скролл
//      (был из-за отсутствия явного overflow-x:hidden — CSS сам переводит
//      "visible" по одной оси в "auto", если у другой оси overflow не
//      visible), добавлено пространство между эмодзи (gap/padding). Плюс
//      исправлено "зависание" эмодзи в верхних рядах при наведении — при
//      тесной сетке увеличенный (scale) эмодзи из верхнего ряда визуально
//      подрезался следующим рядом снизу (тот идёт позже в разметке и
//      рисуется поверх) — добавлен z-index при наведении, поднимающий
//      наведённый эмодзи над соседями независимо от порядка в разметке.
//
// Версия 5 (26.07.26, поиск — НАЙДЕНА и исправлена настоящая причина):
//   Илья прислал лог из консоли (добавленный в версии 4) — он показал, что
//   запрос к серверу отрабатывал ПРАВИЛЬНО (serverReturnedRows:1,
//   afterClientFilter:1 — Дмитрий Сергеев реально находился). Значит, всё
//   это время проблема была вообще не в запросе к базе, а в самом
//   _renderList(): если с найденным агентом уже существовал ПУСТОЙ тред
//   (например, его раньше открывали через поиск, но не написали, либо
//   позже удалили все сообщения через выделение правой кнопкой), такой
//   тред всегда скрывался из общего списка (нет last_at) — а сам агент
//   ОДНОВРЕМЕННО исключался из результатов поиска по справочнику как уже
//   "известный" (см. knownIds ниже). В сумме — пропадал отовсюду, хотя
//   поиск на сервере всё время находил его верно. Теперь фильтр "скрывать
//   пустые не-support-треды" применяется только когда поиск СЕЙЧАС не
//   идёт — во время активного поиска такой тред остаётся видимым в общем
//   списке (без дублирования в "Начать новый чат"), и по нему можно сразу
//   открыть уже существующую переписку. Этот баг воспроизведён и покрыт
//   тестом (test_support_chat_v6.js).
//
// Версия 6 (26.07.26, по новой правке Ильи):
//   1. Цвет выделения сообщения вернули обратно на чистый брендовый
//      #FF6B6B (пробовали приглушённый вариант — не подошёл).
//   2. Часть попапа эмодзи обрезалась справа. Настоящая причина: у
//      элементов CSS Grid по умолчанию есть неявный min-width:auto — они не
//      сжимаются меньше своего "минимального содержимого". Кнопка-эмодзи
//      (24px эмодзи + отступы) на практике оказалась шире, чем реально
//      доступное место в колонке при 6 колонках в узком попапе — сетка не
//      помещалась целиком, а поставленный в прошлый раз overflow-x:hidden
//      (для другого бага — лишнего горизонтального скролла) как раз и
//      обрезал то, что не поместилось. Исправлено явным
//      grid-template-columns: repeat(6, minmax(0,1fr)) — теперь колонки
//      обязаны сжиматься под заданную ширину трека, а не под содержимое.
//      Плюс сам попап расширен (300→350px) и увеличены зазоры между
//      эмодзи — то самое "пространство", о котором просил Илья.
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
:root{ --chat-pill-bg: var(--surface-2); --sel-pink: #FF6B6B; }
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
.fc-avatar{width:40px;height:40px;border-radius:50%;background:var(--surface-3);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:var(--muted);flex-shrink:0;overflow:hidden;background-size:cover;background-position:center;}
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

/* 26.07.26, по правке Ильи: position:relative тут нужен, чтобы подсветка
   при перетаскивании файла (.fc-dragover::after, см. ниже) рисовалась
   именно в границах области сообщений, а не всего .fc-chat-col целиком
   (раньше контур перетаскивания растягивался и на шапку чата — см. правку
   ниже). */
.fc-msgs{flex:1;overflow-y:auto;padding:18px 20px;display:flex;flex-direction:column;gap:10px;position:relative;
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
   выше).
   26.07.26 (2): пробовали приглушённый оттенок вместо брендового #FF6B6B —
   по просьбе Ильи вернули обратно чистый #FF6B6B (переменная --sel-pink
   используется тут и для кнопки-корзины ниже, см. .fc-send.fc-send-delete,
   чтобы оба состояния выделения были визуально согласованы). */
.fc-bubble.sel{transform:scale(1.045);}
.fc-bubble.out.sel{background:var(--sel-pink);}

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

/* 26.07.26, по правке Ильи: align-items был center — при растущем поле
   ввода (см. .fc-input ниже) это держало бы иконки/кнопку по центру уже
   выросшей высокой области, а не у её низа, как это выглядит в обычных
   мессенджерах. flex-end держит их у нижнего края независимо от того,
   сколько строк сейчас в поле ввода. */
.fc-input-row{display:flex;align-items:flex-end;gap:8px;padding:12px 16px;border-top:1px solid var(--line);position:relative;}
/* 26.07.26, по правке Ильи: серый круг при наведении убран — вместо него
   лёгкое увеличение (scale); смена цвета по наведению осталась как была
   ("Изменение цвета оставь как есть"). */
.fc-icon-btn{width:28px;height:28px;border-radius:50%;border:none;background:none;color:var(--muted);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform .15s cubic-bezier(.34,1.56,.64,1),color .15s;}
.fc-icon-btn:hover{background:none;color:var(--text);transform:scale(1.18);}
.fc-icon-btn svg{width:16px;height:16px;}
/* 26.07.26, по правке Ильи: раньше это был однострочный <input>, теперь —
   растущий <textarea> (см. разметку в _buildDOM и autoResizeInput в
   привязке событий): поле плавно увеличивается по высоте по мере набора
   текста, вплоть до max-height, а дальше — свой внутренний скролл (текст
   просто уходит вверх, сама область ввода дальше не растёт). resize:none —
   чтобы нельзя было вручную растянуть за уголок, как в обычном textarea. */
/* 27.07.26, по правке Ильи: скролл-бар убирали во всех трёх областях
   саппорта (список тредов, сообщения, эмодзи) — оказалось, что нужно было
   убрать только тут, в самом поле ввода (там, где печатается текст) —
   поэтому выше список/сообщения/эмодзи вернули обратно с обычным тонким
   скроллом, а скрыт скролл теперь только у .fc-input. */
.fc-input{flex:1;background:var(--chat-pill-bg);border:1px solid var(--line-2);border-radius:20px;padding:10px 16px;color:var(--text);font-size:13px;outline:none;font-family:inherit;resize:none;overflow-y:auto;line-height:1.4;max-height:120px;
  scrollbar-width:none; -ms-overflow-style:none;}
.fc-input::-webkit-scrollbar{display:none;}
.fc-input::placeholder{color:var(--muted);}
.fc-send{width:32px;height:32px;border-radius:50%;border:none;background:var(--accent);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform .15s,background .15s;}
.fc-send:hover{transform:scale(1.06);}
.fc-send svg{width:14px;height:14px;}
.fc-send:disabled{opacity:.5;cursor:default;transform:none;}
.fc-send.fc-send-delete{background:var(--sel-pink);}

/* 25.07.26, по правке Ильи: без обводки, тень меньше, свой скролл внутри
   (набор эмодзи вырос — иначе попап рос бы бесконечно вниз/вверх и вылезал
   за рамки окна, что и было "вышли за рамку"). Ширина/позиция подобраны
   так, чтобы гарантированно не вылезать за правый край панели. */
.fc-emoji-pop{
  position:absolute; bottom:calc(100% + 8px); right:8px; width:350px; max-width:calc(100vw - 40px);
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
   ограничен по высоте (см. .fc-emoji-pop выше) — вылезти уже не может.
   26.07.26, по новой правке ("убери горизонтальный скролл"): раньше тут был
   задан только overflow-y:auto — по спеке CSS, если для одной оси overflow
   не visible, а для другой (overflow-x) явно не задан, браузер сам переводит
   её в auto, из-за чего при малейшем переполнении по ширине (например,
   некоторые составные эмодзи чуть шире обычных) вылезала ненужная
   горизонтальная полоса прокрутки. Явный overflow-x:hidden убирает её.
   26.07.26 (2), по правке "часть обрезалась": overflow-x:hidden сам по себе
   не проблема — проблема в том, что элементы CSS Grid по умолчанию не
   сжимаются меньше своего "минимального содержимого" (min-width:auto), а у
   кнопки-эмодзи это содержимое (24px эмодзи + внутренние отступы) оказалось
   шире, чем реально доступное место в узкой колонке — сетка не влезала
   целиком в ширину попапа и просто обрезалась справа тем самым
   overflow-x:hidden. Настоящий фикс — см. .fc-emoji-grid ниже
   (grid-template-columns: minmax(0,1fr) вместо голого 1fr, это явно
   разрешает колонкам сжиматься до заданной ширины трека). Плюс сам попап
   сделан шире (пространство, о котором просили). */
#fcEmojiBody{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;
  scrollbar-width:thin; scrollbar-color:var(--line-2) transparent;}
#fcEmojiBody::-webkit-scrollbar{width:6px;}
#fcEmojiBody::-webkit-scrollbar-track{background:transparent;}
#fcEmojiBody::-webkit-scrollbar-thumb{background:var(--line-2);border-radius:10px;}
/* 26.07.26, по правке Ильи: серый фон при наведении убран (тоже scale),
   сами эмодзи увеличены (было font-size:18px) — колонок в сетке стало
   меньше (6 вместо 7), чтобы бОльшим эмодзи не было тесно в той же ширине
   попапа.
   26.07.26, по новой правке ("добавь пространство" + "наверху виснут"): gap
   и внутренние отступы кнопок увеличены — было тесно, особенно заметно в
   первой категории "Смайлы" (там эмодзи больше всего, ~70 штук). Из-за
   тесноты увеличение по наведению (scale) у эмодзи в верхних рядах визуально
   "подрезалось" следующим рядом снизу — тот идёт позже в разметке и поэтому
   рисуется поверх (стандартный порядок наложения элементов без z-index),
   перекрывая нижнюю часть увеличенного эмодзи. У последних категорий (там
   эмодзи меньше, "Еда" — всего 8 штук) рядов под текущим меньше или нет
   вовсе, перекрывать нечем — поэтому там и казалось, что реакция "быстрее".
   Добавленный z-index при наведении поднимает конкретно наведённый эмодзи
   НАД всеми соседями независимо от порядка в разметке — теперь увеличение
   всегда видно целиком, в любом ряду. */
.fc-emoji-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;}
.fc-emoji-grid button{position:relative;z-index:1;border:none;background:none;font-size:24px;padding:8px;border-radius:8px;cursor:pointer;line-height:1;transition:transform .12s cubic-bezier(.34,1.56,.64,1);}
.fc-emoji-grid button:hover{background:none;transform:scale(1.25);z-index:2;}

/* Лайтбокс для картинок из чата */
.fc-lightbox{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:2147483200;display:none;align-items:center;justify-content:center;cursor:pointer;padding:40px;}
.fc-lightbox.vis{display:flex;}
.fc-lightbox img{max-width:100%;max-height:100%;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.5);}

/* 24.07.26: кнопка саппорта не нужна поверх собственного лайтбокса
   страницы (просмотр "Рендеры и фото"/"Поэтажный план" в project.html и
   unit.html) — прячем её на время просмотра, см. синхронизацию в _buildDOM. */
.fc-fab.fc-hidden-by-page{display:none !important;}

/* Подсветка зоны переписки при перетаскивании файла.
   26.07.26, по правке Ильи: раньше подсветка растягивалась на весь
   .fc-chat-col (шапка чата + сообщения + строка ввода сразу все вместе,
   поскольку именно на этот общий контейнер вешался класс fc-dragover) —
   получался контур сильно больше, чем сама область переписки. Слушатели
   drag-событий остались на всём .fc-chat-col (так удобнее — файл можно
   бросить в любом месте чата), а вот САМА подсветка теперь ограничена
   только областью сообщений (#fcMsgs) — класс fc-dragover при перетаскивании
   переключается именно на ней, см. _buildDOM. */
.fc-msgs.fc-dragover::after{
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
    const r = await fetch(`${SUPABASE_URL}/support_conversations?agent_id=eq.${this._agent.id}&project_code=is.null&select=id,created_at`, {headers: SB});
    const rows = await r.json();
    // 26.07.26, диагностика по правке Ильи ("техподдержка все ещё
    // задваивается"): если тут уже больше одного треда — это симптом того,
    // что где-то создание всё-таки проскочило мимо частичного уникального
    // индекса support_conversations_general_uniq (или дубль появился ещё до
    // того, как индекс был применён). Логируем сразу здесь, при загрузке —
    // это самое раннее место, где можно поймать факт задвоения.
    if (Array.isArray(rows) && rows.length > 1) {
      console.warn('[floxSupportChat] задвоение треда поддержки — уже больше одного треда у агента', {
        agentId: this._agent.id,
        conversations: rows.map(x => ({id: x.id, created_at: x.created_at})),
      });
    }
    if (Array.isArray(rows) && rows.length) return;
    try {
      await fetch(`${SUPABASE_URL}/support_conversations`, {
        method: 'POST',
        headers: {...SB, 'Content-Type':'application/json', 'Prefer':'return=minimal'},
        body: JSON.stringify({agent_id: this._agent.id, project_code: null}),
      });
    } catch(e) {
      console.warn('[floxSupportChat] _ensureOwnConversation: ошибка создания (возможно, гонка — партиционный индекс не даст дубль)', e && e.message);
    }
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

    // 27.07.26 (6), по новому скриншоту Ильи ("Илья Коныгин задвоился" —
    // на этот раз со стороны СОТРУДНИКА поддержки, который видит чаты ВСЕХ
    // агентов): предыдущая защита (см. историю ниже — "26.07.26") убирала
    // задвоение только для СВОЕГО треда обычного (не staff) агента — условие
    // было буквально `!this._isStaff && convRows.length > 1`. Если же
    // задвоение сидит в самой таблице support_conversations (несколько строк
    // с одним и тем же agent_id), у обычного агента это корректно
    // схлопывалось (там в выборке и так только его собственные строки), а
    // сотрудник поддержки, у которого в выборке ВСЕ агенты сразу, видел все
    // задвоенные строки по отдельности — ровно то, что на новом скриншоте.
    // Теперь дедуплицируем ПО agent_id одинаково для обоих случаев (группа
    // из одной строки — просто показываем как есть, ничего не меняется по
    // сравнению со старым поведением).
    const groups = new Map();
    convRows.forEach(c => {
      if (!groups.has(c.agent_id)) groups.set(c.agent_id, []);
      groups.get(c.agent_id).push(c);
    });

    return Promise.all([...groups.values()].map(async rows => {
      let chosen, hiddenIds = [];
      if (rows.length === 1) {
        chosen = { c: rows[0], meta: await this._loadThreadMeta('support', rows[0].id) };
      } else {
        // Несколько строк с одним и тем же agent_id — задвоение в самой
        // базе. Показываем одну — ту, где реально есть хоть одно сообщение
        // (если сообщения есть в нескольких — самый недавно активный; если
        // ни в одном нет — самый старый по created_at), про остальные явно
        // предупреждаем в консоли с их id и датой создания, чтобы можно было
        // найти и вручную объединить/удалить в самой базе.
        const withMeta = await Promise.all(rows.map(async c => ({c, meta: await this._loadThreadMeta('support', c.id)})));
        const withMsgs = withMeta.filter(x => !!x.meta.last_at);
        if (withMsgs.length) {
          withMsgs.sort((a, b) => new Date(b.meta.last_at) - new Date(a.meta.last_at));
          chosen = withMsgs[0];
        } else {
          withMeta.sort((a, b) => new Date(a.c.created_at) - new Date(b.c.created_at));
          chosen = withMeta[0];
        }
        hiddenIds = withMeta.filter(x => x.c.id !== chosen.c.id).map(x => x.c.id);
        console.warn('[floxSupportChat] показываем только один тред поддержки на agent_id, остальные — задвоение в support_conversations (нужно почистить в базе вручную):', {
          agentId: rows[0].agent_id, shown: chosen.c.id, hidden: hiddenIds,
        });
      }
      return {
        id: chosen.c.id, kind: 'support', agent_id: chosen.c.agent_id,
        // 25.07.26, по просьбе Ильи: раньше было "Поддержка Flox".
        name: this._isStaff ? (chosen.c.agents?.full_name || 'Агент') : 'Техподдержка Агентов',
        sub: this._isStaff ? (chosen.c.agents?.agency || '—') : 'Ответим как можно скорее',
        isSupportIcon: !this._isStaff,
        // 25.07.26 (снова): Илья хочет видеть в кружке ровно то фото, что
        // загружено самому аккаунту поддержки через топбар — а не безликую
        // иконку. agent_id тут для не-staff — это ОН САМ (владелец треда),
        // поэтому для аватарки используем отдельное поле: реальный id
        // аккаунта поддержки (staff_role='support'). У staff в этом поле —
        // как и раньше, id конкретного агента-собеседника.
        photoAgentId: this._isStaff ? chosen.c.agent_id : await this._getSupportStaffId(),
        ...chosen.meta,
      };
    }));
  },

  // 25.07.26: единственный настоящий аккаунт поддержки (staff_role='support')
  // — его id нужен, чтобы показать ЕГО РЕАЛЬНОЕ фото (agents.avatar_url) в
  // кружке "Техподдержка Агентов" у обычных агентов, вместо статичной иконки.
  // Кешируем — это не меняется в рамках одной открытой вкладки.
  _supportStaffId: undefined,
  async _getSupportStaffId() {
    if (this._supportStaffId !== undefined) return this._supportStaffId;
    try {
      const r = await fetch(`${SUPABASE_URL}/agents?staff_role=eq.support&select=id&limit=1`, {headers: SB});
      const rows = await r.json();
      this._supportStaffId = (Array.isArray(rows) && rows[0] && rows[0].id) || null;
    } catch(e) { this._supportStaffId = null; }
    return this._supportStaffId;
  },

  // ── Данные: переписка между агентами ──────────────────────────────────
  async _loadDMThreads() {
    const r = await fetch(`${SUPABASE_URL}/agent_conversations?or=(agent_a_id.eq.${this._agent.id},agent_b_id.eq.${this._agent.id})&select=id,agent_a_id,agent_b_id,created_at`, {headers: SB});
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) return [];

    const otherIds = [...new Set(rows.map(c => c.agent_a_id === this._agent.id ? c.agent_b_id : c.agent_a_id))];
    const namesR = await fetch(`${SUPABASE_URL}/agents?id=in.(${otherIds.join(',')})&select=id,full_name,agency,staff_role`, {headers: SB});
    const names = await namesR.json();
    const nameMap = {};
    (Array.isArray(names) ? names : []).forEach(a => { nameMap[a.id] = a; });

    const built = await Promise.all(rows.map(async c => {
      const otherId = c.agent_a_id === this._agent.id ? c.agent_b_id : c.agent_a_id;
      const other = nameMap[otherId] || {};
      const otherIsSupport = other.staff_role === 'support';
      // 25.07.26 (снова, по прямой правке Ильи — "это нихуя не личные
      // сообщения, это отправка в учётку поддержки, убери всё что в
      // скобках"): личная переписка (agent_conversations) между обычным
      // агентом и аккаунтом поддержки — это НЕ отдельный самостоятельный
      // чат, это и есть тот же самый служебный тред поддержки (он уже
      // показан через support_conversations, см. _loadSupportThreads).
      // Прошлая правка только переименовывала такую личку и показывала
      // ВТОРОЙ строкой, если в ней были сообщения — из-за этого и
      // получалось "2 техподдержки"/"2 Ильи Коныгина" с обеих сторон. Теперь
      // такие пары (ровно одна сторона — staff_role='support', другая нет)
      // исключаем из списка целиком и безусловно, даже если в них уже есть
      // сообщения — они больше никогда не показываются отдельной строкой,
      // независимо от того, когда и как были созданы (включая уже
      // существующие в базе "хвосты" от старого бага, без ручной чистки).
      if (this._isStaff !== otherIsSupport) return null;
      const meta = await this._loadThreadMeta('dm', c.id);
      return {
        id: c.id, kind: 'dm', agent_id: otherId,
        name: other.full_name || 'Агент',
        sub: other.agency || '—',
        isSupportIcon: false,
        ...meta,
      };
    }));
    return built.filter(Boolean);
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
    // 27.07.26 (6), тот же баг, что нашли в топбаре (см. topbar.js
    // _onPhotoSelected): Supabase Storage требует ASCII-ключ, а название
    // файла с кириллицей (или вообще произвольными символами) в пути
    // приводило к ошибке 400 "InvalidKey" и вложение просто не грузилось.
    // Оригинальное имя файла не участвует в самом ключе объекта — оно и так
    // отдельно сохраняется в attachment_name (см. вызов ниже), только сам
    // путь в Storage теперь целиком ASCII-безопасный.
    const extMatch = /\.([a-zA-Z0-9]+)$/.exec(file.name || '');
    const ext = extMatch ? extMatch[1].toLowerCase() : ((file.type && file.type.split('/')[1]) || 'bin').replace(/[^a-z0-9]/gi, '');
    const path = `${this._agent.id}/${Date.now()}.${ext || 'bin'}`;
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
    // 26.07.26, по новой правке Ильи ("так и не решился, нужно диагностировать
    // по-другому"): предыдущий вариант (упрощённый одиночный ilike + фильтр
    // всех слов на клиенте) прошёл все мои тесты на мок-бэкенде, но по факту
    // всё равно не заработал в бою. Раз уже ВТОРОЙ по счёту вариант логики
    // фильтра не помогает, это явный сигнал, что дело, скорее всего, вообще
    // не в синтаксисе фильтра — а в чём-то, чего мок-бэкенд просто не может
    // воспроизвести (ошибка самого запроса — например RLS на таблице agents
    // не пускает анонимный ключ читать чужие строки; реальный HTTP-статус
    // с ошибкой; сетевая проблема и т.п.). Раньше любая такая ошибка тихо
    // проглатывалась в catch и превращалась в "результатов нет" — то есть ни
    // я, ни Илья не могли увидеть, что именно происходит на самом деле.
    // Поэтому вместо третьей слепой догадки — подробное логирование в
    // консоль на каждом шаге (сам URL запроса, HTTP-статус, тело ответа
    // сервера при ошибке). В следующий раз, когда поиск не найдёт агента,
    // нужно открыть консоль браузера (F12 → Console) и прислать мне то, что
    // там выведется строкой "[floxSupportChat] search" — по этому будет
    // видно точную причину, а не гадать вслепую в четвёртый раз.
    const terms = (q || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) { this._searchAgentsRaw = []; this._renderList(); return; }
    const url = `${SUPABASE_URL}/agents?full_name=ilike.*${encodeURIComponent(terms[0])}*&id=neq.${this._agent.id}&select=id,full_name,agency,staff_role&limit=30`;
    try {
      const r = await fetch(url, {headers: SB});
      const text = await r.text();
      if (!r.ok) {
        console.error('[floxSupportChat] search: сервер вернул ошибку', {url, status: r.status, statusText: r.statusText, body: text});
        this._searchAgentsRaw = [];
        this._renderList();
        return;
      }
      let rows;
      try { rows = JSON.parse(text); } catch(parseErr) {
        console.error('[floxSupportChat] search: ответ сервера — не JSON', {url, status: r.status, body: text});
        this._searchAgentsRaw = [];
        this._renderList();
        return;
      }
      const candidates = Array.isArray(rows) ? rows : [];
      this._searchAgentsRaw = candidates
        .filter(a => {
          const name = (a.full_name || '').toLowerCase();
          return terms.every(t => name.includes(t));
        })
        .slice(0, 8);
      console.log('[floxSupportChat] search debug', {
        url, term: terms[0], allTerms: terms,
        agentIdUsedInFilter: this._agent && this._agent.id,
        serverReturnedRows: candidates.length,
        afterClientFilter: this._searchAgentsRaw.length,
      });
    } catch(e) {
      console.error('[floxSupportChat] search: сетевая ошибка (fetch упал)', {url, error: e && e.message});
      this._searchAgentsRaw = [];
    }
    this._renderList();
  },

  async _startDM(agentId, name, agency, isSupportStaff) {
    document.getElementById('fcSearchInput').value = '';
    this._searchAgentsRaw = [];
    // 27.07.26 (3), настоящая причина "задвоения" саппорта (найдено по
    // логу из консоли): это не дублировавшаяся строка в базе, а личная
    // переписка (agent_conversations), случайно начатая с самим аккаунтом
    // поддержки через обычный поиск по агентам — она выглядит в списке
    // ТОЧНО так же ("Техподдержка Агентов"), как и настоящий отдельный
    // служебный чат поддержки. Поэтому теперь если найденный в поиске
    // "агент" на самом деле staff_role='support' — личную переписку с ним
    // вообще не создаём, а просто открываем настоящий тред поддержки.
    if (isSupportStaff) {
      const support = this._threads.find(t => t.kind === 'support' && !this._isStaff);
      if (support) { this._renderList(); this._selectThread(support.id, 'support'); return; }
      // На всякий случай, если своего треда поддержки ещё почему-то нет —
      // создаём его (тот же путь, что и при обычной инициализации виджета).
      await this._ensureOwnConversation();
      await this._loadAllThreads();
      this._renderList();
      const created = this._threads.find(t => t.kind === 'support');
      if (created) this._selectThread(created.id, 'support');
      return;
    }
    // 25.07.26, настоящая (третья) причина "задвоения", найденная по свежему
    // скриншоту Ильи: два одинаковых пункта "Илья Коныгин" в списке у самого
    // аккаунта поддержки — один настоящий служебный тред (support_conversations,
    // "добрый день"), второй — личная переписка (agent_conversations,
    // "паораорапоа"), случайно созданная потому, что ветка выше защищала
    // только один из двух направлений: она не даёт ОБЫЧНОМУ агенту завести
    // личку с поддержкой, но ничего не мешало САМОЙ ПОДДЕРЖКЕ завести личку с
    // обычным агентом через поиск (вместо того, чтобы просто открыть его
    // настоящий тред поддержки). Симметричный фикс: если пишет staff, и
    // выбранный в поиске человек — обычный агент (не поддержка), никогда не
    // создаём agent_conversations, а открываем/создаём его служебный тред.
    if (this._isStaff) {
      const existingSupport = this._threads.find(t => t.kind === 'support' && String(t.agent_id) === String(agentId));
      if (existingSupport) { this._renderList(); this._selectThread(existingSupport.id, 'support'); return; }
      try {
        const cr = await fetch(`${SUPABASE_URL}/support_conversations`, {
          method: 'POST',
          headers: {...SB, 'Content-Type':'application/json', 'Prefer':'return=representation'},
          body: JSON.stringify({agent_id: agentId, project_code: null}),
        });
        await cr.json();
      } catch(e) {
        console.warn('[floxSupportChat] _startDM (staff → агент): не удалось создать служебный тред, возможно гонка/уже существует', e && e.message);
      }
      await this._loadAllThreads();
      this._renderList();
      const created = this._threads.find(t => t.kind === 'support' && String(t.agent_id) === String(agentId));
      if (created) this._selectThread(created.id, 'support');
      return;
    }
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
          <textarea class="fc-input" id="fcInput" rows="1" placeholder="Напишите сообщение…"></textarea>
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
    // 26.07.26, по правке Ильи: поле ввода стало растущим <textarea> —
    // обычный Enter по-прежнему отправляет сообщение, а Shift+Enter (и
    // любая другая модифицирующая клавиша — Ctrl/Alt/Meta+Enter, "и
    // аналоги") теперь переносит на новую строку. Для Shift+Enter это и
    // так стандартное поведение textarea — здесь просто не мешаем ему
    // (preventDefault только для голого Enter).
    input.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
      e.preventDefault();
      this._handleSend();
    });
    // Автоувеличение высоты по мере набора текста — растёт до max-height
    // (см. .fc-input в CSS), дальше просто свой внутренний скролл. Сохраняем
    // на this, чтобы можно было дозвать и после программной вставки текста
    // (эмодзи — см. ниже), для которой браузер сам событие input не шлёт.
    const autoResizeInput = () => {
      input.style.height = 'auto';
      input.style.height = input.scrollHeight + 'px';
    };
    input.addEventListener('input', autoResizeInput);
    this._autoResizeInput = autoResizeInput;
    this._resetInputHeight = () => { input.style.height = 'auto'; };

    document.getElementById('fcAttachBtn').onclick = () => document.getElementById('fcFileInput').click();
    document.getElementById('fcFileInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) await this._handleFileSend(file);
    });

    // ── Перетаскивание файла в область переписки ──
    // 26.07.26, по правке Ильи: слушатели остаются на всём .fc-chat-col
    // (файл можно бросить в любом месте чата, включая шапку и строку ввода
    // — так удобнее), но сама ВИЗУАЛЬНАЯ подсветка (.fc-dragover) теперь
    // включается только на #fcMsgs — раньше контур растягивался на весь
    // .fc-chat-col целиком, включая шапку, что и выглядело слишком крупно.
    const chatCol = document.getElementById('fcChatCol');
    const msgsForDrag = document.getElementById('fcMsgs');
    let dragDepth = 0;
    chatCol.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; msgsForDrag.classList.add('fc-dragover'); });
    chatCol.addEventListener('dragover', (e) => e.preventDefault());
    chatCol.addEventListener('dragleave', (e) => { e.preventDefault(); dragDepth = Math.max(0, dragDepth-1); if (!dragDepth) msgsForDrag.classList.remove('fc-dragover'); });
    chatCol.addEventListener('drop', async (e) => {
      e.preventDefault(); dragDepth = 0; msgsForDrag.classList.remove('fc-dragover');
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) await this._handleFileSend(file);
    });

    // ── Эмодзи (24.07.26: поле поиска убрано — просто сетка по категориям) ──
    const emojiBtn = document.getElementById('fcEmojiBtn');
    const emojiPop = document.getElementById('fcEmojiPop');
    this._renderEmojiBody();
    emojiBtn.onclick = (e) => { e.stopPropagation(); emojiPop.classList.toggle('vis'); };
    document.getElementById('fcEmojiBody').addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') {
        input.value += e.target.textContent;
        input.focus();
        // программная вставка не шлёт настоящее событие input — дозываем
        // автоувеличение высоты вручную (иначе несколько эмодзи подряд
        // могли бы перенестись на новую строку без подгонки высоты поля).
        this._autoResizeInput();
      }
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
    // 27.07.26 (6), баг у Ильи ("при нажатии на Дмитрий фото Ильи остаётся
    // в треде"): шапка чата — ОДИН и тот же DOM-элемент, переиспользуемый
    // для любого открытого треда. Раньше при переключении треда старое
    // фото (background-image) никогда явно не сбрасывалось — если у нового
    // треда фото нет (или оно ещё не проверено), полосу с чужим старым фото
    // было не видно за счёт того, что поверх встают только initials-текст,
    // а backgroundImage остаётся тем же. Теперь при каждом обновлении шапки
    // сначала сбрасываем и картинку, и метку "для какого агента она",
    // и только потом (если нужно) запускаем новую попытку применить фото.
    av.style.backgroundImage = '';
    av.textContent = initials(t.name);
    av.classList.toggle('fc-avatar-support', !!t.isSupportIcon);
    document.getElementById('fcChatTitle').textContent = t.name;
    document.getElementById('fcChatSub').textContent = t.sub;
    // 27.07.26, по просьбе Ильи: если у собеседника загружено своё фото
    // (через topbar.js), показываем его в кружке шапки чата вместо
    // инициалов. 25.07.26: для isSupportIcon (тред техподдержки у обычного
    // агента) это тоже применяется — только используем photoAgentId (id
    // реального аккаунта поддержки), а не agent_id (тот у такого треда —
    // это сам агент-владелец треда, а не собеседник).
    const photoId = t.photoAgentId || t.agent_id;
    if (photoId) {
      av.dataset.avatarFor = String(photoId);
      this._applyAvatarPhoto(av, photoId);
    } else {
      delete av.dataset.avatarFor;
    }
  },

  // 27.07.26: фото собеседника — отдельным best-effort запросом (не трогаем
  // основные select'ы threads/списка), с маленьким кешем в памяти. Если в
  // agents ещё нет колонки avatar_url или у агента нет фото — просто тихо
  // ничего не делаем, кружок остаётся с инициалами как раньше.
  _photoCache: {},
  // 27.07.26 (6): URL, которые уже один раз реально успешно загрузились —
  // для них повторную проверку через new Image() больше не гоняем, а сразу
  // применяем. Раньше даже уже проверенное фото при каждом переключении
  // треда на секунду показывало инициалы, пока шла повторная проверка —
  // это и была жалоба "на секунду мелькают инициалы вместо картинки".
  _verifiedPhotoUrls: new Set(),
  // 27.07.26 (2), по факту бага у Ильи (кружок в топбаре опустел от битой
  // ссылки): applyPhotoIfLoads НЕ ставит фото по одному факту непустого
  // URL — сперва реально пробует загрузить картинку (new Image()), и только
  // при успехе стирает инициалы и подставляет фон. При ошибке — молча
  // остаётся с тем, что уже было в кружке (инициалы), вместо пустого места.
  // 27.07.26 (6): добавлена проверка `agentId` в момент применения — если к
  // моменту завершения загрузки картинки элемент уже назначен ДРУГОМУ
  // собеседнику (пользователь успел переключиться на другой чат/строку
  // успела перерисоваться под другого агента), результат просто
  // отбрасывается, а не подставляется поверх уже актуального содержимого.
  _applyPhotoIfLoads(el, url, agentId) {
    if (!el || !url) return;
    const stillWanted = () => agentId === undefined || el.dataset.avatarFor === undefined || el.dataset.avatarFor === String(agentId);
    if (this._verifiedPhotoUrls.has(url)) {
      if (stillWanted()) { el.style.backgroundImage = `url('${url}')`; el.textContent = ''; }
      return;
    }
    const probe = new Image();
    probe.onload = () => {
      this._verifiedPhotoUrls.add(url);
      if (stillWanted()) { el.style.backgroundImage = `url('${url}')`; el.textContent = ''; }
    };
    probe.src = url;
  },
  async _applyAvatarPhoto(el, agentId) {
    if (this._photoCache[agentId] !== undefined) {
      this._applyPhotoIfLoads(el, this._photoCache[agentId], agentId);
      return;
    }
    try {
      const r = await fetch(`${SUPABASE_URL}/agents?id=eq.${agentId}&select=avatar_url`, {headers: SB});
      if (!r.ok) { this._photoCache[agentId] = null; return; }
      const rows = await r.json();
      const url = (rows[0] && rows[0].avatar_url) || null;
      this._photoCache[agentId] = url;
      // 27.07.26 (5), баг у Ильи ("фото в шапке есть, а в списке слева
      // нет"): раньше тут ПОСЛЕ загрузки (когда фото ещё не было в кеше)
      // результат всегда применялся жёстко к #fcChatAvatar (шапка чата),
      // даже если этот вызов пришёл из рендера СПИСКА для строки другого
      // собеседника — сама переданная сюда ссылка `el` игнорировалась. Из-за
      // этого фото подставлялось в список только если оно уже было в кеше
      // (например, после того как шапку уже открывали) — при первом же
      // показе списка фото там не появлялось. Теперь применяем к тому
      // элементу, который реально был передан в вызов, независимо от того,
      // шапка это или строка списка — а `el.isConnected` подстраховывает от
      // применения к уже удалённому из DOM элементу (список успел
      // перерисоваться, пока шёл запрос).
      if (url && el && el.isConnected) this._applyPhotoIfLoads(el, url, agentId);
    } catch(e) { this._photoCache[agentId] = null; }
  },

  _handleSend() {
    const input = document.getElementById('fcInput');
    const body = input.value.trim();
    const thread = this._threads.find(t => t.id === this._activeThreadId);
    if (!body || !thread) return;
    input.value = '';
    // 26.07.26: поле ввода теперь растущий textarea — после отправки
    // возвращаем его к однострочной высоте (иначе оставалось бы растянутым
    // на высоту последнего многострочного сообщения).
    if (this._resetInputHeight) this._resetInputHeight();
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
    //
    // 26.07.26, найдена настоящая причина "поиск ничего не находит" (по
    // диагностике из консоли — сервер СОВЕРШЕННО ВЕРНО находил агента по
    // ФИО, serverReturnedRows:1, afterClientFilter:1 — то есть проблема была
    // вообще не в запросе к базе): если с этим агентом уже существует пустой
    // тред (например, ранее случайно открыли его через поиск и не написали,
    // либо позже удалили все сообщения через выделение правой кнопкой — та
    // же самая фича, которую мы разбирали пару правок назад), то ДО этого
    // места такой тред всегда скрывался этим самым фильтром (нет last_at),
    // А СЛЕДОМ — этот же агент исключался из "Начать новый чат" ниже, как
    // "уже известный" (см. knownIds). В сумме агент пропадал ОТОВСЮДУ:
    // и из обычного списка (спрятан как пустой), и из результатов поиска
    // по справочнику (спрятан как уже существующий) — то есть найти его
    // было буквально невозможно, хотя сам запрос к серверу отрабатывал
    // правильно. Чинится тем, что фильтр "скрывать пустые не-support-треды"
    // применяется, только если поиск сейчас НЕ идёт (q пуст) — во время
    // активного поиска такой тред должен быть находим, чтобы можно было
    // открыть уже существующую (пусть пустую) переписку вместо того, чтобы
    // человек упирался в пустоту.
    // 27.07.26 (5), баг у Ильи: раньше kind==='support' были ВСЕГДА видны
    // без исключений — это было специально сделано для собственного (ещё
    // пустого) треда поддержки самого агента, чтобы он не пропадал сразу
    // после открытия панели (см. _ensureOwnConversation, создаётся ещё до
    // первого сообщения). Но для СОТРУДНИКА поддержки, который видит ЧУЖИЕ
    // support-треды (по одному на каждого агента), это же правило держало в
    // списке даже полностью очищенные (все сообщения удалены) переписки —
    // отсюда баг "переписка с Ильёй Коныгиным не исчезла после удаления всех
    // сообщений". Теперь "всегда показывать" действует только для СВОЕГО
    // собственного треда поддержки (agent_id === мой id), а чужие/просмотренные
    // сотрудником — по общему правилу (есть хоть одно сообщение).
    if (!q) list = list.filter(c => (c.kind === 'support' && String(c.agent_id) === String(this._agent.id)) || !!c.last_at);
    if (this._tab === 'unread') list = list.filter(c => c.unread > 0);
    if (q) list = list.filter(c => c.name.toLowerCase().includes(q));

    // 24.07.26, фикс "чат задваивается": исключаем из результатов поиска по
    // справочнику тех, с кем чат уже есть — пересчитываем здесь, при каждом
    // рендере (а не один раз в момент запроса к серверу), чтобы не зависеть
    // от того, что успело подгрузиться раньше — список тредов или ответ
    // поиска. Такой уже известный агент теперь не пропадает бесследно — при
    // активном поиске (см. выше) он остаётся виден через основной список
    // (list), просто не дублируется ещё и в "Начать новый чат".
    const knownIds = new Set(this._threads.map(t => String(t.agent_id)));
    // 27.07.26 (4), по замечанию Ильи: аккаунт поддержки (staff_role='support')
    // не должен появляться в "Начать новый чат" вообще, независимо от того,
    // есть ли с ним уже (пустая/скрытая) личка в knownIds — до поддержки и так
    // есть отдельный постоянный вход (иконка чата поддержки), а не через
    // поиск по агентам. Раньше это работало только "случайно" — за счёт того,
    // что пустая личка-двойник (см. фикс задвоения) держала 9999 в knownIds;
    // как только эту личку почистили из _threads, знак поддержки тут же
    // вернулся в список поиска. Теперь исключаем его явно, а не полагаемся
    // на побочный эффект.
    this._searchAgents = (this._searchAgentsRaw || []).filter(a => !knownIds.has(String(a.id)) && a.staff_role !== 'support');

    if (q) {
      // 26.07.26, по новой правке Ильи ("отправляю консоль с багом
      // задвоения"): предыдущая версия этого лога показывала только счётчики
      // (threadsTotal/matchedInThreadList), а не то, ЧТО именно совпало —
      // из одних счётчиков было не видно, два совпадения это два РАЗНЫХ
      // agent_id (например, реальный тред поддержки + отдельная личная
      // переписка с каким-то агентом, у которого в справочнике почему-то
      // тоже стоит имя "Техподдержка Агентов"), или же это буквально два
      // одинаковых support-треда с одним и тем же agent_id, которые должен
      // был отсеять фикс в _loadSupportThreads. Теперь лог показывает id,
      // kind и agent_id каждого совпадения — по нему сразу будет видно,
      // какая из двух гипотез верна.
      console.log('[floxSupportChat] renderList debug', {
        q, threadsTotal: this._threads.length, matchedInThreadList: list.length,
        matched: list.map(c => ({id: c.id, kind: c.kind, agent_id: c.agent_id, name: c.name, last_at: c.last_at})),
        searchAgentsRawCount: (this._searchAgentsRaw || []).length,
        searchAgentsAfterKnownFilter: this._searchAgents.length,
      });
    }

    const el = document.getElementById('fcList');
    let html = '';

    if (!list.length && !this._searchAgents.length) {
      html = `<div class="fc-empty">${q ? 'Ничего не найдено' : 'Пока нет диалогов'}</div>`;
    } else {
      html += list.map(c => `
        <div class="fc-item ${c.id === this._activeThreadId && c.kind === this._activeThreadKind ? 'act' : ''}" data-id="${c.id}" data-kind="${c.kind}">
          <div class="fc-avatar ${c.isSupportIcon ? 'fc-avatar-support' : ''}" data-avatar-for="${(c.photoAgentId || c.agent_id) || ''}">${initials(c.name)}</div>
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
        <div class="fc-item" data-newagent="${a.id}" data-name="${esc(a.full_name)}" data-agency="${esc(a.agency || '')}" data-staffrole="${a.staff_role === 'support' ? '1' : ''}">
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
    // 27.07.26 (5), баг у Ильи: фото собеседника подставлялось только в
    // шапку открытого чата (_updateActiveHeader), но не в сам кружок в
    // списке слева — теперь то же самое (best-effort, с кешем) применяем и
    // к каждой строке списка. 25.07.26: включая служебную иконку
    // "Техподдержка Агентов" — там data-avatar-for уже указывает не на
    // агента-владельца треда, а на реальный id аккаунта поддержки (см.
    // photoAgentId в _loadSupportThreads), так что фото показывает именно
    // то, что загружено самому аккаунту поддержки через топбар.
    el.querySelectorAll('.fc-avatar[data-avatar-for]').forEach(node => {
      const agentId = node.dataset.avatarFor;
      if (agentId) this._applyAvatarPhoto(node, agentId);
    });
    el.querySelectorAll('.fc-item[data-newagent]').forEach(node => {
      // 27.07.26 (3): если найденный в справочнике "агент" на самом деле
      // аккаунт поддержки (staff_role='support') — не создаём с ним личную
      // переписку (это и было причиной визуального "задвоения" — см.
      // _startDM ниже), а сразу открываем настоящий служебный чат поддержки.
      node.onclick = () => this._startDM(node.dataset.newagent, node.dataset.name, node.dataset.agency, node.dataset.staffrole === '1');
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
