// 27.07.26, по просьбе Ильи: единый экран загрузки для ВСЕХ страниц (флокс
// веб, проджект, юнит — оба формата, оффер), чтобы устранить мелькание
// контента при заходе на страницу. Тот же принцип, что у topbar.js/
// support-chat.js — один общий файл, подключается через <script src>.
//
// Как это работает:
// 1. Скрипт нужно подключать САМЫМ ПЕРВЫМ тегом в <head> (до основного
//    <style> страницы и уж тем более до остального контента) — тогда
//    экран загрузки появляется раньше, чем успевает мелькнуть что-либо
//    ещё. Он вставляется в document.documentElement напрямую (не ждёт
//    <body>), поэтому виден с первого же кадра.
// 2. Страница сама вызывает floxPageLoader.hide() ровно в тот момент,
//    когда её основной контент уже отрисован (у каждой страницы это
//    свой момент — конец renderUnit()/renderProject()/первого рендера
//    списка и т.д.). Без этого вызова лоадер провисит максимум 8 секунд
//    (safety-net на случай, если что-то в загрузке страницы сломалось) и
//    сам скроется — так пользователь не застрянет за ним навсегда даже
//    при ошибке.
// 3. Цвета — НЕ через var(--surface)/var(--accent): эти переменные зависят
//    от класса body.light, который навешивает topbar.js уже ПОЗЖЕ, при
//    разборе <body> — к моменту показа лоадера (первый тег в <head>) его
//    ещё нет, поэтому var(--surface) всегда резолвился в тёмное значение
//    :root, даже у агента с сохранённой светлой темой (баг, который нашёл
//    Илья: "лоадер по умолчанию должен быть в белой теме"). Читаем
//    localStorage.flox-theme напрямую и синхронно (localStorage доступен
//    мгновенно, никаких таймингов) — той же самой проверкой, что и в
//    topbar.js (_applyTheme): dark = (flox-theme === 'dark'). По умолчанию
//    (ничего не сохранено, свежий агент) — светлая тема, ровно как и должно
//    быть; если тема была явно переключена на тёмную — лоадер сразу её
//    подхватывает, без промежуточной вспышки светлым.
(function () {
  var isDark = localStorage.getItem('flox-theme') === 'dark';
  var bg = isDark ? '#0d0d18' : '#fff';
  var accent = '#5E17EB';
  var CSS =
    // 2147483646 — на единицу меньше, чем у мобильной заглушки в flox-web.html
    // (#mobileRedirectStub, z-index:2147483647) — если человек зашёл с
    // телефона, заглушка должна быть поверх этого лоадера гарантированно, а
    // не в зависимости от порядка отрисовки/момента вставки в DOM.
    '#floxPageLoader{position:fixed;inset:0;z-index:2147483646;' +
    'background:' + bg + ';display:flex;align-items:center;' +
    'justify-content:center;transition:opacity .25s ease;}' +
    '#floxPageLoader.flox-loader-hide{opacity:0;pointer-events:none;}' +
    '#floxPageLoader .flox-loader-dot{width:8px;height:8px;border-radius:50%;' +
    'background:' + accent + ';animation:floxLoaderDot 1.1s ease-in-out infinite;}' +
    '#floxPageLoader .flox-loader-dot:nth-child(2){animation-delay:.15s;}' +
    '#floxPageLoader .flox-loader-dot:nth-child(3){animation-delay:.3s;background:#FF6B6B;}' +
    '@keyframes floxLoaderDot{0%,80%,100%{opacity:.3;transform:translateY(0);}' +
    '40%{opacity:1;transform:translateY(-4px);}}';

  var style = document.createElement('style');
  style.id = 'flox-page-loader-css';
  style.textContent = CSS;
  document.head.appendChild(style);

  var el = document.createElement('div');
  el.id = 'floxPageLoader';
  el.innerHTML =
    '<div style="display:flex;gap:8px;">' +
    '<span class="flox-loader-dot"></span>' +
    '<span class="flox-loader-dot"></span>' +
    '<span class="flox-loader-dot"></span>' +
    '</div>';
  document.documentElement.appendChild(el);

  var hidden = false;
  function hide() {
    if (hidden) return;
    hidden = true;
    el.classList.add('flox-loader-hide');
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 300);
  }

  window.floxPageLoader = { hide: hide };

  // Safety-net: если страница по какой-то причине не позвала hide() сама
  // (баг, необработанная ошибка загрузки данных) — не оставляем человека
  // навсегда за экраном загрузки.
  setTimeout(hide, 8000);
})();
