(() => {
  "use strict";

  // ================================================================
  // ART-XAOS — МНОГОКАРУСЕЛЬНАЯ СИСТЕМА (v3)
  //
  // Каждая .carousel[data-carousel] работает независимо.
  //
  // Возможности:
  // - бесконечная прокрутка слайдов и миниатюр
  // - переходы наслаиваются: быстрые клики/свайпы накапливаются,
  //   движение не прерывается, а плавно «довозит» до новой цели
  // - миниатюры тянутся как в iOS (инерция + примагничивание)
  // - горизонтальный скролл трекпадом, колесо мыши листает фото
  // - autoplay с двойной полосой прогресса; пауза при наведении,
  //   вне экрана и в фоновой вкладке; отключается при
  //   prefers-reduced-motion
  // - предзагрузка соседних фото, blur-плейсхолдер на время загрузки
  //
  // Фото задаются в .carousel-images: <img data-src="big.jpg"> (или src).
  // Необязательные атрибуты у <img>:
  //   data-thumb="small.jpg"        маленькое превью для ленты
  //   data-placeholder="tiny.jpg"   крошечная картинка для blur-подложки
  //                                 (если не задан — берётся data-thumb)
  // ================================================================

  // ================================================================
  // НАСТРОЙКИ
  // ================================================================

  const AUTOPLAY_DELAY = 5000;
  const FREEZE_DELAY = 5000;

  // «Скорость» всех переходов: за это время пружина проходит ~99% пути
  const TRANSITION_MS = 450;

  const FADE_MS = 1000;
  const SWIPE_THRESHOLD = 50;

  // --- перетаскивание миниатюр ---
  const DRAG_THRESHOLD = 6; // px до начала перетаскивания

  // Инерция после отпускания. Больше FLING_PROJECT_MS — дальше «летит» лента,
  // больше SETTLE_MS — плавнее и дольше гасится скорость
  const FLING_PROJECT_MS = 240;
  const SETTLE_MS = 560;
  const FLING_MAX_SPEED = 5; // px/мс

  // Пока лента едет под пальцем, большое фото меняется не чаще, чем раз в N мс
  // (на телефонах частая смена тяжёлых фото = лаги). 0 — без ограничения
  const SCRUB_SLIDE_MIN_MS = 80;
  const VELOCITY_WINDOW_MS = 100;
  const MAX_COPIES_EACH_SIDE = 10;

  // --- колесо / трекпад ---
  const WHEEL_IDLE_MS = 140; // пауза, после которой лента примагничивается
  const WHEEL_VERTICAL_STEPS = true; // «щелчок» колеса мыши листает фото

  // --- загрузка фото ---
  const PLACEHOLDER_FADE_MS = 400;

  // ================================================================
  // ВНУТРЕННИЕ КОНСТАНТЫ
  // ================================================================

  // Критически задемпфированная пружина: (1+ωt)·e^(−ωt) ≈ 0.01 при ωt ≈ 6.64
  const OMEGA = 6.64 / TRANSITION_MS;
  const OMEGA_SETTLE = 6.64 / SETTLE_MS;
  const REST_DISTANCE = 0.002; // в «фото»
  const REST_SPEED = 0.00004; // в «фото»/мс

  const mod = (a, n) => ((a % n) + n) % n;

  // ================================================================
  // ОБЩИЕ ДЛЯ ВСЕХ КАРУСЕЛЕЙ (один observer и по одному слушателю)
  // ================================================================

  const motionQuery =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;

  let reduceMotion = !!(motionQuery && motionQuery.matches);

  const instances = new Set();

  const visibilityCallbacks = new WeakMap();

  const intersectionObserver =
    "IntersectionObserver" in window
      ? new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            const callback = visibilityCallbacks.get(entry.target);

            if (callback) {
              callback(entry.isIntersecting);
            }
          });
        })
      : null;

  document.addEventListener("visibilitychange", () => {
    instances.forEach((instance) => instance.applyPlayState());
  });

  if (motionQuery) {
    const onMotionChange = (event) => {
      reduceMotion = event.matches;
      instances.forEach((instance) => instance.refreshAutoplay());
    };

    if (motionQuery.addEventListener) {
      motionQuery.addEventListener("change", onMotionChange);
    } else if (motionQuery.addListener) {
      motionQuery.addListener(onMotionChange);
    }
  }

  // ================================================================
  // ИНИЦИАЛИЗАЦИЯ ВСЕХ КАРУСЕЛЕЙ
  // ================================================================

  document.querySelectorAll("[data-carousel]").forEach(initCarousel);

  // ================================================================
  // ИНИЦИАЛИЗАЦИЯ ОДНОЙ КАРУСЕЛИ
  // ================================================================

  function initCarousel(carouselEl) {
    // ==============================================================
    // DOM
    // ==============================================================

    const slidesEl = carouselEl.querySelector(".slides");
    const progressFrontEl = carouselEl.querySelector(".progress-bar--front");
    const progressBackEl = carouselEl.querySelector(".progress-bar--back");
    const thumbsTrackEl = carouselEl.querySelector(".thumbs-track");
    const thumbsViewEl = carouselEl.querySelector(".thumbs");
    const imagesEl = carouselEl.querySelector(".carousel-images");

    if (
      !slidesEl ||
      !progressFrontEl ||
      !progressBackEl ||
      !thumbsTrackEl ||
      !thumbsViewEl ||
      !imagesEl
    ) {
      console.warn("ART-XAOS: неправильная структура карусели", carouselEl);
      return;
    }

    // ==============================================================
    // ФОТОГРАФИИ ИЗ HTML
    // ==============================================================

    const images = Array.from(imagesEl.querySelectorAll("img"))
      .map((img) => {
        // Адрес берём из data-src (если картинки не грузятся сами) или из src
        const src = img.getAttribute("data-src") || img.getAttribute("src");
        const thumb = img.getAttribute("data-thumb") || src;

        return {
          src,
          thumb,
          placeholder:
            img.getAttribute("data-placeholder") ||
            (thumb !== src ? thumb : null),
          alt: img.getAttribute("alt") || "Изображение",
        };
      })
      .filter((image) => image.src && image.src.trim() !== "");

    const N = images.length;

    if (!N) {
      console.warn("ART-XAOS: у карусели нет фотографий", carouselEl);
      return;
    }

    imagesEl.style.display = "none";

    // ==============================================================
    // СОСТОЯНИЕ
    // ==============================================================

    // слайды: текущая позиция в «слайдах» (в пределах [0.5, N+0.5))
    let currentSlidePercent = -100;

    // --- движок переходов ---
    // Две пружины (лента и слайды) тянутся к одной цели T.
    // T — целое число в «индексах фото», не ограничено диапазоном 0..N-1.
    // Новый клик/свайп = T ± 1: скорость сохраняется, переходы наслаиваются.
    const th = { x: 0, v: 0 }; // лента, в «фото»
    const sl = { x: 0, v: 0 }; // слайды, в «фото»
    let T = 0;
    let moving = false;
    let thActive = false;
    let scrubbing = false; // большое фото «прилипает» к центру ленты
    let manualMotion = false;
    let engineRaf = null;
    let engineLast = 0;
    let posRaw = 0;
    let omega = OMEGA;
    let lastSlideSync = 0;
    let slideSyncTimer = null;

    // --- миниатюры ---
    const thumbEls = [];
    let midCopy = 1;
    let thumbIndex = 0;
    let pos = 0; // x в ленте под центром окна, всегда в [midLo, midHi)
    let viewW = 0;
    let centers = [];
    let period = 0;
    let midLo = 0;
    let midHi = 0;
    let ready = false;
    let measureQueued = false;

    // --- перетаскивание ---
    let drag = null;
    let pendingDelta = 0;
    let dragFrame = null;
    let suppressClick = false;

    // --- колесо ---
    let wheelActive = false;
    let wheelTimer = null;
    let wheelDelta = 0;
    let wheelFrame = null;

    // --- autoplay ---
    let progressAnim = null;
    let activeBar = progressFrontEl;
    let idleBar = progressBackEl;
    let inView = true;
    let hovered = false;

    // --- предзагрузка ---
    const slidesByReal = Array.from({ length: N }, () => []);
    const boostedReal = new Set();

    // ==============================================================
    // СЛАЙДЫ: [последний, ...все, первый] — для бесконечной прокрутки
    // ==============================================================

    const extended = [images[N - 1], ...images, images[0]];
    const slidesFragment = document.createDocumentFragment();
    const allSlideImgs = [];

    extended.forEach((imageData, i) => {
      const real = i === 0 ? N - 1 : i === N + 1 ? 0 : i - 1;

      const slide = document.createElement("div");
      slide.className = "slide";

      const img = document.createElement("img");
      img.alt = imageData.alt;
      img.draggable = false;
      img.decoding = "async";
      img.style.opacity = "0";
      img.style.transition = reduceMotion
        ? "none"
        : `opacity ${PLACEHOLDER_FADE_MS}ms ease`;

      // Размытая подложка, пока грузится полноразмерное фото
      let placeholderEl = null;

      if (imageData.placeholder) {
        placeholderEl = document.createElement("div");
        placeholderEl.setAttribute("aria-hidden", "true");
        placeholderEl.style.cssText =
          "position:absolute;inset:0;z-index:-1;pointer-events:none;" +
          "background-position:center;background-size:cover;" +
          "filter:blur(18px);transform:scale(1.1);" +
          (reduceMotion ? "" : `transition:opacity ${PLACEHOLDER_FADE_MS}ms ease;`);
        placeholderEl.style.backgroundImage = `url("${imageData.placeholder.replace(/"/g, "%22")}")`;

        slide.style.position = "relative";
        slide.style.overflow = "hidden";
        slide.style.isolation = "isolate";
        slide.appendChild(placeholderEl);
      }

      slide.appendChild(img);
      slidesFragment.appendChild(slide);

      if (i === 1) {
        img.loading = "eager";
        img.setAttribute("fetchpriority", "high");
      } else {
        img.loading = "lazy";
      }

      const checkCached = prepareReveal(img, placeholderEl);

      img.src = imageData.src;
      checkCached();

      slidesByReal[real].push(img);
      allSlideImgs.push(img);
    });

    slidesEl.appendChild(slidesFragment);

    // Появление фото: ждём загрузку и декодирование, затем плавно показываем
    function prepareReveal(img, placeholderEl) {
      let shown = false;

      const reveal = () => {
        if (shown) {
          return;
        }

        shown = true;
        img.style.opacity = "1";

        if (placeholderEl) {
          placeholderEl.style.opacity = "0";

          setTimeout(
            () => placeholderEl.remove(),
            reduceMotion ? 0 : PLACEHOLDER_FADE_MS + 50,
          );
        }
      };

      img.addEventListener(
        "load",
        () => {
          if (img.decode) {
            img.decode().then(reveal, reveal);
          } else {
            reveal();
          }
        },
        { once: true },
      );

      img.addEventListener("error", reveal, { once: true });

      // Для картинок, которые уже лежат в кэше
      return () => {
        if (img.complete && img.naturalWidth) {
          reveal();
        }
      };
    }

    // ==============================================================
    // ПРЕДЗАГРУЗКА СОСЕДЕЙ
    //
    // ±1 — с высоким приоритетом, ±2 — обычным, остальные — в фоне
    // после загрузки страницы.
    // ==============================================================

    function boost(real, priority) {
      if (boostedReal.has(real)) {
        return;
      }

      boostedReal.add(real);

      slidesByReal[real].forEach((img) => {
        img.fetchPriority = priority;
        img.loading = "eager";
      });
    }

    function preloadAround(real) {
      boost(real, "high");
      boost(mod(real + 1, N), "high");
      boost(mod(real - 1, N), "high");
      boost(mod(real + 2, N), "auto");
      boost(mod(real - 2, N), "auto");
    }

    const whenIdle = window.requestIdleCallback
      ? (callback) => window.requestIdleCallback(callback)
      : (callback) => setTimeout(callback, 300);

    function warmUpRest() {
      for (let real = 0; real < N; real++) {
        boost(real, "low");
      }
    }

    if (document.readyState === "complete") {
      whenIdle(warmUpRest);
    } else {
      window.addEventListener("load", () => whenIdle(warmUpRest), {
        once: true,
      });
    }

    preloadAround(0);
    showSlideAt(1);

    // Одно фото — листать и тянуть нечего
    if (N === 1) {
      thumbsViewEl.style.display = "none";
      return;
    }

    // ==============================================================
    // СТИЛИ ДЛЯ ЖЕСТОВ И КОМПОЗИТИНГА
    // ==============================================================

    slidesEl.style.touchAction = "pan-y";
    slidesEl.style.willChange = "transform";

    thumbsViewEl.style.touchAction = "pan-y";
    thumbsViewEl.style.userSelect = "none";
    thumbsViewEl.style.webkitUserSelect = "none";
    thumbsViewEl.style.cursor = "grab";
    thumbsViewEl.style.webkitTouchCallout = "none";
    thumbsViewEl.style.webkitTapHighlightColor = "transparent";
    thumbsTrackEl.style.willChange = "transform";

    [progressFrontEl, progressBackEl].forEach((bar) => {
      bar.style.width = "100%";
      bar.style.transformOrigin = "0 50%";
      bar.style.transform = "scaleX(0)";
      bar.style.transition = "none";
    });

    // ==============================================================
    // МИНИАТЮРЫ: ЛЕНТА ИЗ КОПИЙ
    // ==============================================================

    function addThumbCopies(count) {
      const fragment = document.createDocumentFragment();

      for (let copy = 0; copy < count; copy++) {
        images.forEach((imageData, index) => {
          const thumb = document.createElement("div");
          thumb.className = "thumb";
          thumb.dataset.realIndex = index;

          const img = document.createElement("img");
          img.alt = imageData.alt;
          img.draggable = false;
          img.decoding = "async";
          img.addEventListener("load", requestMeasure, { once: true });
          img.src = imageData.thumb;

          thumb.appendChild(img);
          fragment.appendChild(thumb);
          thumbEls.push(thumb);
        });
      }

      thumbsTrackEl.appendChild(fragment);
    }

    addThumbCopies(3);
    thumbIndex = midCopy * N;
    thumbEls[thumbIndex].classList.add("active");

    // ==============================================================
    // ИЗМЕРЕНИЯ (кэшируются)
    // ==============================================================

    function measure() {
      viewW = thumbsViewEl.clientWidth;

      if (!viewW) {
        ready = false;
        return;
      }

      centers = thumbEls.map((el) => el.offsetLeft + el.offsetWidth / 2);
      period = centers[N] - centers[0];

      if (!(period > 0)) {
        ready = false;
        return;
      }

      const need = Math.min(
        MAX_COPIES_EACH_SIDE,
        Math.max(1, Math.ceil(viewW / 2 / period)),
      );

      if (need > midCopy) {
        const realIndex = thumbIndex % N;

        addThumbCopies(2 * (need - midCopy));
        midCopy = need;
        relocateActive(midCopy * N + realIndex);

        measure();
        return;
      }

      midLo = (centers[midCopy * N - 1] + centers[midCopy * N]) / 2;
      midHi = midLo + period;
      ready = true;

      if (!drag && !moving && !scrubbing && !wheelActive) {
        pos = centers[thumbIndex];
        applyThumbTransform();
      }
    }

    function requestMeasure() {
      if (measureQueued) {
        return;
      }

      measureQueued = true;

      requestAnimationFrame(() => {
        measureQueued = false;
        measure();
      });
    }

    // ==============================================================
    // ЛЕНТА: ПОЗИЦИЯ
    // ==============================================================

    function applyThumbTransform() {
      thumbsTrackEl.style.transform = `translate3d(${viewW / 2 - pos}px,0,0)`;
    }

    // Наибольший индекс lo, у которого centers[lo] <= p (но не последний)
    function lowerIndex(p) {
      let lo = 0;
      let hi = centers.length - 1;

      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;

        if (centers[mid] <= p) {
          lo = mid;
        } else {
          hi = mid;
        }
      }

      return lo;
    }

    function nearestIndex(p) {
      const lo = lowerIndex(p);

      return p - centers[lo] < centers[lo + 1] - p ? lo : lo + 1;
    }

    // Фото (дробное, не ограничено) → координата в ленте
    function posOf(photo) {
      const k = Math.floor(photo / N);
      const r = photo - k * N;
      const j = Math.min(N - 1, Math.floor(r));
      const a = centers[midCopy * N + j];
      const b = centers[midCopy * N + j + 1];

      return a + (b - a) * (r - j) + k * period;
    }

    // Координата в ленте → фото (дробное)
    function photoAt(p) {
      const k = Math.floor((p - midLo) / period);
      const w = p - k * period;
      const lo = lowerIndex(w);
      const a = centers[lo];
      const b = centers[lo + 1];

      return lo - midCopy * N + (w - a) / (b - a) + k * N;
    }

    function activateThumb(index) {
      if (thumbEls[thumbIndex]) {
        thumbEls[thumbIndex].classList.remove("active");
      }

      thumbEls[index].classList.add("active");
      thumbIndex = index;

      preloadAround(index % N);
    }

    // Та же миниатюра в другой копии ленты — без анимации (нет мигания)
    function relocateActive(index) {
      // При очень резком рывке (больше периода ленты за кадр) «эквивалентная»
      // миниатюра может оказаться за пределами существующих копий. Она всё
      // равно далеко за кадром, поэтому берём ту же фотографию в средней копии.
      if (!(index >= 0 && index < thumbEls.length)) {
        index = midCopy * N + mod(index, N);
      }

      const prev = thumbEls[thumbIndex];
      const next = thumbEls[index];

      thumbIndex = index;

      if (!next || prev === next) {
        return;
      }

      if (!prev) {
        next.classList.add("active");
        return;
      }

      prev.style.transition = "none";
      next.style.transition = "none";

      prev.classList.remove("active");
      next.classList.add("active");

      void getComputedStyle(next).transform;

      prev.style.transition = "";
      next.style.transition = "";
    }

    // Единственное место, где двигается лента (с «бесконечным» перескоком)
    function moveBy(delta) {
      let p = pos + delta;

      if (p < midLo || p >= midHi) {
        const k = Math.floor((p - midLo) / period);

        p -= k * period;
        relocateActive(thumbIndex - k * N);
      }

      pos = p;
      applyThumbTransform();

      const index = nearestIndex(pos);

      if (index !== thumbIndex) {
        activateThumb(index);

        if (scrubbing) {
          scheduleSlideSync();
        }
      }
    }

    // ==============================================================
    // СЛАЙДЫ: ПОЗИЦИЯ
    // ==============================================================

    // x — координата в «слайдах» (1 = первое фото); любое значение
    // сворачивается в [0.5, N+0.5): клоны по краям выглядят так же
    function showSlideAt(x) {
      const d = mod(x - 0.5, N) + 0.5;

      currentSlidePercent = -d * 100;
      slidesEl.style.transform = `translate3d(${currentSlidePercent}%,0,0)`;
    }

    function syncSlideToThumb() {
      const wanted = (thumbIndex % N) + 1;

      if (currentSlidePercent !== -wanted * 100) {
        showSlideAt(wanted);
      }
    }

    // Сразу (и сбрасывает отложенное обновление)
    function flushSlideSync() {
      clearTimeout(slideSyncTimer);
      slideSyncTimer = null;

      lastSlideSync = performance.now();
      syncSlideToThumb();
    }

    // Пока лента едет под пальцем: не чаще раза в SCRUB_SLIDE_MIN_MS
    function scheduleSlideSync() {
      if (!SCRUB_SLIDE_MIN_MS) {
        syncSlideToThumb();
        return;
      }

      const wait = SCRUB_SLIDE_MIN_MS - (performance.now() - lastSlideSync);

      if (wait <= 0) {
        flushSlideSync();
      } else if (!slideSyncTimer) {
        slideSyncTimer = setTimeout(() => {
          slideSyncTimer = null;

          if (scrubbing) {
            flushSlideSync();
          }
        }, wait);
      }
    }

    // ==============================================================
    // ДВИЖОК
    // ==============================================================

    function stepSpring(s, target, dt) {
      const u0 = s.x - target;
      const B = s.v + omega * u0;
      const e = Math.exp(-omega * dt);

      s.x = target + (u0 + B * dt) * e;
      s.v = (B - omega * (u0 + B * dt)) * e;
    }

    function isRest(s) {
      return Math.abs(s.x - T) < REST_DISTANCE && Math.abs(s.v) < REST_SPEED;
    }

    function slideSpringFromDisplay() {
      sl.x = -currentSlidePercent / 100 - 1;

      // выбираем «ветку» так, чтобы лента и слайды не разошлись на круг
      if (thActive) {
        sl.x += N * Math.round((th.x - sl.x) / N);
      }

      sl.v = 0;
    }

    // Безопасно вызывать повторно (в том числе во время движения)
    function beginMotion(live) {
      if (!moving) {
        moving = true;
        thActive = ready;

        if (thActive) {
          th.x = photoAt(pos);
          th.v = 0;
          posRaw = posOf(th.x);
        }

        slideSpringFromDisplay();
        T = Math.round(thActive ? th.x : sl.x);
        engineLast = performance.now();
      } else if (scrubbing && !live) {
        // слайды перестают «прилипать» к ленте — их пружина стартует
        // с того места, где они сейчас стоят
        slideSpringFromDisplay();
      }

      scrubbing = live;
      omega = live ? OMEGA_SETTLE : OMEGA;

      if (!engineRaf) {
        engineRaf = requestAnimationFrame(tick);
      }
    }

    function stopMotion() {
      if (engineRaf) {
        cancelAnimationFrame(engineRaf);
        engineRaf = null;
      }

      moving = false;
    }

    function tick(now) {
      engineRaf = null;

      const dt = reduceMotion
        ? 1e6
        : Math.min(64, Math.max(0, now - engineLast));

      engineLast = now;

      let rest = true;

      if (thActive) {
        stepSpring(th, T, dt);

        const raw = posOf(th.x);

        moveBy(raw - posRaw);
        posRaw = raw;

        rest = isRest(th);
      }

      if (!scrubbing) {
        stepSpring(sl, T, dt);
        showSlideAt(sl.x + 1);

        rest = rest && isRest(sl);
      }

      if (rest) {
        finishMotion();
      } else {
        engineRaf = requestAnimationFrame(tick);
      }
    }

    function finishMotion() {
      moving = false;

      // Точно в центр целевой миниатюры
      relocateActive(midCopy * N + mod(T, N));

      if (ready) {
        pos = centers[thumbIndex];
        applyThumbTransform();
      }

      if (scrubbing) {
        scrubbing = false;
        flushSlideSync();
      } else {
        showSlideAt(mod(T, N) + 1);
      }

      if (manualMotion) {
        manualMotion = false;
        freezeThenResume();
      }
    }

    // Переход на ±1: если движение уже идёт — просто сдвигаем цель
    function stepTo(direction, manual) {
      cancelWheel();
      beginMotion(false);

      T += direction;

      if (manual) {
        manualMotion = true;
        resetBars();
      }

      preloadAround(mod(T, N));
    }

    function advance(direction = 1, manual = false) {
      stepTo(direction, manual);
    }

    // Доводка после перетаскивания: старт с текущей скорости пальца,
    // цель — миниатюра, ближайшая к «проекции» броска
    function settle(velocityPx) {
      beginMotion(true);

      th.v = velocityPx / (period / N);
      T = Math.round(th.x + th.v * FLING_PROJECT_MS);

      manualMotion = true;

      preloadAround(mod(T, N));
    }

    // ==============================================================
    // ПРОГРЕСС + AUTOPLAY (Web Animations API: transform, без layout)
    // ==============================================================

    function stopProgress() {
      if (progressAnim) {
        progressAnim.onfinish = null;
        progressAnim.cancel();
        progressAnim = null;
      }
    }

    function resetBars() {
      stopProgress();

      [progressFrontEl, progressBackEl].forEach((bar) => {
        bar.getAnimations().forEach((animation) => animation.cancel());
        bar.style.transform = "scaleX(0)";
        bar.style.opacity = "1";
      });

      activeBar.style.zIndex = "2";
      idleBar.style.zIndex = "1";
    }

    function applyPlayState() {
      if (!progressAnim) {
        return;
      }

      if (inView && !document.hidden && !hovered) {
        progressAnim.play();
      } else {
        progressAnim.pause();
      }
    }

    function runProgress(delay = 0) {
      stopProgress();

      if (reduceMotion) {
        return;
      }

      const bar = activeBar;
      const other = idleBar;

      bar.style.zIndex = "2";
      other.style.zIndex = "1";

      progressAnim = bar.animate(
        [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }],
        {
          duration: AUTOPLAY_DELAY,
          delay,
          easing: "linear",
          fill: "forwards",
        },
      );

      progressAnim.onfinish = () => onProgressDone(bar, other);

      applyPlayState();
    }

    function onProgressDone(bar, other) {
      progressAnim = null;

      bar.style.zIndex = "1";

      const fade = bar.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: FADE_MS,
        easing: "ease",
        fill: "forwards",
      });

      fade.onfinish = () => {
        bar.getAnimations().forEach((animation) => animation.cancel());
      };

      activeBar = other;
      idleBar = bar;

      advance(1, false);
      runProgress();
    }

    function freezeThenResume() {
      resetBars();
      runProgress(FREEZE_DELAY);
    }

    // Пользователь включил/выключил «уменьшение движения» на лету
    function refreshAutoplay() {
      if (reduceMotion) {
        resetBars();
      } else if (!progressAnim && !moving && !drag) {
        runProgress();
      }
    }

    // ==============================================================
    // КЛИКИ ПО КРАЯМ
    // ==============================================================

    carouselEl.querySelectorAll(".zone").forEach((zone) => {
      zone.addEventListener("click", () => {
        const direction = parseInt(zone.dataset.dir, 10);

        if (!direction) {
          return;
        }

        advance(direction, true);
      });
    });

    // ==============================================================
    // КЛИК ПО МИНИАТЮРЕ
    // ==============================================================

    thumbsViewEl.addEventListener("click", (event) => {
      if (suppressClick) {
        return;
      }

      const thumb = event.target.closest(".thumb");

      if (!thumb || !ready) {
        return;
      }

      const real = parseInt(thumb.dataset.realIndex, 10);
      const currentTarget = moving ? T : thumbIndex - midCopy * N;

      // Уже открытая (или уже выбранная целью) фотография
      if (mod(currentTarget, N) === real) {
        freezeThenResume();
        return;
      }

      cancelWheel();
      beginMotion(false);

      // Кликнутая миниатюра на экране — едем прямо к ней
      const branch = Math.round((th.x - photoAt(pos)) / N) * N;

      T = thumbEls.indexOf(thumb) - midCopy * N + branch;

      manualMotion = true;
      resetBars();
      preloadAround(real);
    });

    // ==============================================================
    // ПЕРЕТАСКИВАНИЕ МИНИАТЮР
    // ==============================================================

    thumbsViewEl.addEventListener("dragstart", (event) => {
      event.preventDefault();
    });

    thumbsViewEl.addEventListener("pointerdown", (event) => {
      if (!ready) {
        return;
      }

      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      // Палец «ловит» ленту, если она ещё едет (в том числе от колеса)
      const wasMoving = moving || wheelActive;

      cancelWheel();

      if (wasMoving) {
        stopMotion();
        scrubbing = true;
        flushSlideSync();
      }

      drag = {
        id: event.pointerId,
        startX: event.clientX,
        lastX: event.clientX,
        active: false,
        wasMoving,
        samples: [{ x: event.clientX, t: event.timeStamp }],
      };
    });

    thumbsViewEl.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.id) {
        return;
      }

      if (!drag.active) {
        if (Math.abs(event.clientX - drag.startX) < DRAG_THRESHOLD) {
          return;
        }

        startDrag(event);
      }

      pendingDelta += drag.lastX - event.clientX;
      drag.lastX = event.clientX;

      const samples = drag.samples;

      samples.push({ x: event.clientX, t: event.timeStamp });

      while (
        samples.length > 2 &&
        event.timeStamp - samples[0].t > VELOCITY_WINDOW_MS
      ) {
        samples.shift();
      }

      if (!dragFrame) {
        dragFrame = requestAnimationFrame(flushDrag);
      }
    });

    thumbsViewEl.addEventListener("pointerup", endDrag);
    thumbsViewEl.addEventListener("pointercancel", endDrag);

    // lostpointercapture всплывает от дочерних элементов: на touch браузер
    // «снимает» неявный захват с миниатюры, на которой начался жест, — это не
    // конец жеста. Учитываем только потерю захвата самой лентой.
    thumbsViewEl.addEventListener("lostpointercapture", (event) => {
      if (event.target === thumbsViewEl) {
        endDrag(event);
      }
    });

    function startDrag(event) {
      drag.active = true;

      stopMotion();
      scrubbing = true;

      // Мышь/перо: «приклеиваем» указатель к ленте. У касания неявный
      // захват уже есть — там он не нужен
      if (event.pointerType !== "touch") {
        try {
          thumbsViewEl.setPointerCapture(event.pointerId);
        } catch (error) {
          // не критично
        }
      }

      thumbsViewEl.style.cursor = "grabbing";

      resetBars();
      flushSlideSync();
    }

    function flushDrag() {
      dragFrame = null;

      if (pendingDelta) {
        moveBy(pendingDelta);
        pendingDelta = 0;
      }
    }

    function releaseVelocity(samples, endTime) {
      if (samples.length < 2) {
        return 0;
      }

      const first = samples[0];
      const last = samples[samples.length - 1];

      if (endTime - last.t > 80) {
        return 0;
      }

      const dt = last.t - first.t;

      if (dt < 1) {
        return 0;
      }

      const v = -(last.x - first.x) / dt;

      return Math.max(-FLING_MAX_SPEED, Math.min(FLING_MAX_SPEED, v));
    }

    function endDrag(event) {
      if (!drag || event.pointerId !== drag.id) {
        return;
      }

      const finished = drag;

      drag = null;

      if (dragFrame) {
        cancelAnimationFrame(dragFrame);
        dragFrame = null;
      }

      if (pendingDelta) {
        moveBy(pendingDelta);
        pendingDelta = 0;
      }

      // Просто тап. Если «поймали» едущую ленту — довести до миниатюры
      if (!finished.active) {
        if (finished.wasMoving) {
          settle(0);
        }

        return;
      }

      thumbsViewEl.style.cursor = "grab";

      try {
        thumbsViewEl.releasePointerCapture(event.pointerId);
      } catch (error) {
        // уже отпущен
      }

      suppressClick = true;

      setTimeout(() => {
        suppressClick = false;
      }, 50);

      // pointercancel (браузер забрал жест) — тоже продолжаем с инерцией
      settle(
        event.type === "lostpointercapture"
          ? 0
          : releaseVelocity(finished.samples, event.timeStamp),
      );
    }

    // ==============================================================
    // ТРЕКПАД И КОЛЕСО НАД ЛЕНТОЙ
    //
    // - горизонтальный жест (трекпад, Shift+колесо) — лента едет за
    //   пальцем, затем примагничивается
    // - «щелчок» колеса обычной мыши — следующее/предыдущее фото
    //   (быстрая прокрутка наслаивается, как и клики)
    // - обычный вертикальный скролл трекпадом не трогаем
    // ==============================================================

    thumbsViewEl.addEventListener("wheel", onWheel, { passive: false });

    function isMouseNotch(event) {
      return (
        event.deltaMode === 1 ||
        (event.wheelDeltaY !== undefined &&
          event.wheelDeltaY !== 0 &&
          event.wheelDeltaY % 120 === 0)
      );
    }

    function onWheel(event) {
      if (!ready || drag) {
        return;
      }

      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        event.preventDefault();
        wheelScrub(event.deltaX * (event.deltaMode === 1 ? 16 : 1));
        return;
      }

      if (WHEEL_VERTICAL_STEPS && isMouseNotch(event)) {
        event.preventDefault();
        stepTo(event.deltaY > 0 ? 1 : -1, true);
      }
    }

    function wheelScrub(delta) {
      if (!wheelActive) {
        wheelActive = true;

        stopMotion();
        scrubbing = true;
        resetBars();
        flushSlideSync();
      }

      wheelDelta += delta;

      if (!wheelFrame) {
        wheelFrame = requestAnimationFrame(() => {
          wheelFrame = null;

          if (wheelDelta) {
            moveBy(wheelDelta);
            wheelDelta = 0;
          }
        });
      }

      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(endWheel, WHEEL_IDLE_MS);
    }

    function endWheel() {
      wheelTimer = null;

      if (!wheelActive) {
        return;
      }

      wheelActive = false;

      if (wheelFrame) {
        cancelAnimationFrame(wheelFrame);
        wheelFrame = null;
      }

      if (wheelDelta) {
        moveBy(wheelDelta);
        wheelDelta = 0;
      }

      settle(0);
    }

    // Прерываем «колёсную» прокрутку, если пользователь начал другое действие
    function cancelWheel() {
      if (!wheelActive) {
        return;
      }

      wheelActive = false;
      scrubbing = false;
      wheelDelta = 0;

      clearTimeout(wheelTimer);
      wheelTimer = null;

      if (wheelFrame) {
        cancelAnimationFrame(wheelFrame);
        wheelFrame = null;
      }
    }

    // ==============================================================
    // СВАЙПЫ ПО СЛАЙДАМ (работают и во время анимации — переходы
    // наслаиваются)
    // ==============================================================

    let pointerStartX = 0;
    let pointerStartY = 0;
    let pointerActive = false;

    slidesEl.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      pointerStartX = event.clientX;
      pointerStartY = event.clientY;
      pointerActive = true;
    });

    slidesEl.addEventListener("pointerup", (event) => {
      if (!pointerActive) {
        return;
      }

      pointerActive = false;

      const dx = event.clientX - pointerStartX;
      const dy = event.clientY - pointerStartY;

      if (Math.abs(dx) < SWIPE_THRESHOLD) {
        return;
      }

      if (Math.abs(dx) < Math.abs(dy)) {
        return;
      }

      advance(dx < 0 ? 1 : -1, true);
    });

    slidesEl.addEventListener("pointercancel", () => {
      pointerActive = false;
    });

    // ==============================================================
    // НАВЕДЕНИЕ МЫШИ: пауза autoplay
    // ==============================================================

    carouselEl.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "mouse") {
        hovered = true;
        applyPlayState();
      }
    });

    carouselEl.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "mouse") {
        hovered = false;
        applyPlayState();
      }
    });

    // ==============================================================
    // РАЗМЕРЫ, ВИДИМОСТЬ
    // ==============================================================

    if ("ResizeObserver" in window) {
      const resizeObserver = new ResizeObserver(requestMeasure);

      resizeObserver.observe(thumbsViewEl);
      resizeObserver.observe(thumbsTrackEl);
    } else {
      window.addEventListener("resize", requestMeasure);
    }

    if (intersectionObserver) {
      visibilityCallbacks.set(carouselEl, (visible) => {
        inView = visible;
        applyPlayState();
      });

      intersectionObserver.observe(carouselEl);
    }

    instances.add({ applyPlayState, refreshAutoplay });

    // ==============================================================
    // ЗАПУСК
    // ==============================================================

    measure();
    resetBars();
    runProgress();
  }
})();
