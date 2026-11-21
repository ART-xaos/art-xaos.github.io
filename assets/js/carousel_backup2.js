(() => {
  "use strict";

  // ================================================================
  // ART-XAOS — МНОГОКАРУСЕЛЬНАЯ СИСТЕМА (v2)
  //
  // Каждая .carousel[data-carousel] работает независимо.
  //
  // Возможности:
  // - несколько каруселей на одной странице
  // - бесконечная прокрутка слайдов и миниатюр
  // - autoplay с двойной полосой прогресса
  // - клики по краям, свайпы по слайдам
  // - миниатюры: перетаскивание как в iOS (инерция + примагничивание
  //   к ближайшей миниатюре, большое фото меняется «вживую»)
  //
  // Что оптимизировано:
  // - полоса прогресса — transform + Web Animations (без layout и без rAF)
  // - autoplay ставится на паузу, если карусель вне экрана / вкладка скрыта
  // - позиции миниатюр измеряются один раз (кэш), а не на каждый кадр
  // - количество копий миниатюр считается по ширине ленты (а не всегда 5)
  // - lazy-загрузка слайдов: грузятся только видимый и соседние,
  //   остальные — по мере перелистывания, decoding="async"
  // - опционально: уменьшенные превью через data-thumb="..." у <img>
  // ================================================================

  // ================================================================
  // НАСТРОЙКИ
  // ================================================================

  const AUTOPLAY_DELAY = 5000;
  const FREEZE_DELAY = 5000;
  const TRANSITION_MS = 450;
  const FADE_MS = 1000;
  const SWIPE_THRESHOLD = 50;

  // --- перетаскивание миниатюр ---

  // Сколько px надо провести, чтобы жест стал перетаскиванием (а не кликом)
  const DRAG_THRESHOLD = 6;

  // «Дальнобойность» броска: на сколько мс вперёд проецируется скорость
  const FLING_PROJECT_MS = 180;

  // Ограничение скорости броска, px/мс
  const FLING_MAX_SPEED = 4;

  // Жёсткость примагничивания (больше — быстрее и резче)
  const SETTLE_OMEGA = 0.012;

  // Окно, по которому считается скорость отпускания, мс
  const VELOCITY_WINDOW_MS = 100;

  // Максимум копий ленты с каждой стороны (защита от слишком маленьких превью)
  const MAX_COPIES_EACH_SIDE = 10;

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
    //
    // Адреса читаются из data-src / data-thumb, чтобы браузер не скачивал
    // фотографии до того, как их запросит скрипт (src в разметке нет):
    //   <img data-src="big.jpg" data-thumb="small.jpg" alt="...">
    // Для обратной совместимости поддерживается и обычный src.
    // Если data-thumb нет — используется основной адрес.
    // ==============================================================

    const images = Array.from(imagesEl.querySelectorAll("img"))
      .map((img) => {
        const src = img.dataset.src || img.getAttribute("src");

        return {
          src,
          thumb: img.getAttribute("data-thumb") || src,
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

    // слайды
    let slideIndex = 1;
    let currentSlidePercent = -100;

    // анимации/жесты
    let motionFrame = null; // rAF текущего перехода/доводки
    let isAnimating = false; // идёт переход слайдов (клик/autoplay)
    let scrubbing = false; // лента ведёт за собой большое фото

    // миниатюры
    const thumbEls = [];
    let midCopy = 1; // индекс «средней» копии
    let thumbIndex = 0; // глобальный индекс активной (центральной) миниатюры
    let pos = 0; // x-координата в ленте, которая сейчас под центром окна
    let viewW = 0;
    let centers = []; // центры всех миниатюр (кэш измерений)
    let period = 0; // ширина одной копии ленты
    let midLo = 0; // pos всегда держим в [midLo, midHi) — это ровно средняя копия
    let midHi = 0;
    let ready = false; // false, пока лента не видна/не измерена

    // перетаскивание
    let drag = null;
    let pendingDelta = 0;
    let dragFrame = null;
    let suppressClick = false;

    // autoplay
    let progressAnim = null;
    let activeBar = progressFrontEl;
    let idleBar = progressBackEl;
    let inView = true;
    let tabVisible = !document.hidden;
    let measureQueued = false;

    // ==============================================================
    // СЛАЙДЫ: [последний, ...все, первый] — для бесконечной прокрутки
    // ==============================================================

    const extended = [images[N - 1], ...images, images[0]];
    const slideImgs = [];
    const slidesFragment = document.createDocumentFragment();

    extended.forEach((imageData) => {
      const slide = document.createElement("div");
      slide.className = "slide";

      const img = document.createElement("img");
      img.alt = imageData.alt;
      img.draggable = false;
      img.decoding = "async";
      img.loading = "lazy";

      // Адрес лежит в data-src: src появится только у видимых слайдов
      img.dataset.src = imageData.src;

      slide.appendChild(img);
      slidesFragment.appendChild(slide);
      slideImgs.push(img);
    });

    slidesEl.appendChild(slidesFragment);

    // Ленивая загрузка: src подставляем «рабочему» слайду и его соседям,
    // остальные подтягиваются по мере перелистывания
    const totalSlides = slideImgs.length;

    function hydrateSlide(index) {
      const img = slideImgs[index];

      if (img && !img.getAttribute("src") && img.dataset.src) {
        img.src = img.dataset.src;
      }
    }

    function hydrateAround(index) {
      for (let offset = -1; offset <= 1; offset++) {
        let i = index + offset;

        if (i < 0) {
          i += totalSlides;
        } else if (i >= totalSlides) {
          i -= totalSlides;
        }

        hydrateSlide(i);
      }
    }

    snapSlide(1);

    // Одно фото — листать и тянуть нечего
    if (N === 1) {
      thumbsViewEl.style.display = "none";
      return;
    }

    // ==============================================================
    // ПОДГОТОВКА СТИЛЕЙ ДЛЯ ЖЕСТОВ И КОМПОЗИТИНГА
    // ==============================================================

    slidesEl.style.touchAction = "pan-y";
    slidesEl.style.willChange = "transform";

    thumbsViewEl.style.touchAction = "pan-y"; // горизонталь — наша
    thumbsViewEl.style.userSelect = "none";
    thumbsViewEl.style.webkitUserSelect = "none";
    thumbsViewEl.style.cursor = "grab";
    thumbsTrackEl.style.willChange = "transform";

    [progressFrontEl, progressBackEl].forEach((bar) => {
      bar.style.width = "100%";
      bar.style.transformOrigin = "0 50%";
      bar.style.transform = "scaleX(0)";
      bar.style.transition = "none";
      bar.style.willChange = "transform, opacity";
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

          // Если размеры превью зависят от файла — перемерим после загрузки
          img.addEventListener("load", requestMeasure, { once: true });

          img.src = imageData.thumb;

          thumb.appendChild(img);
          fragment.appendChild(thumb);
          thumbEls.push(thumb);
        });
      }

      thumbsTrackEl.appendChild(fragment);
    }

    // Минимум 3 копии; недостающие докинет measure() по ширине окна
    addThumbCopies(3);
    thumbIndex = midCopy * N;
    thumbEls[thumbIndex].classList.add("active");

    // ==============================================================
    // ИЗМЕРЕНИЯ (кэшируются, перемеряем только при изменении размеров)
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

      // Сколько копий нужно с каждой стороны, чтобы окно всегда было заполнено
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

      // Если ничего не двигается — вернуть активную миниатюру в центр
      if (!drag && !scrubbing && !isAnimating) {
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
    // ПОЗИЦИЯ ЛЕНТЫ
    // ==============================================================

    function applyThumbTransform() {
      thumbsTrackEl.style.transform = `translate3d(${viewW / 2 - pos}px,0,0)`;
    }

    // Ближайшая к координате p миниатюра (бинарный поиск по кэшу)
    function nearestIndex(p) {
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

      return p - centers[lo] < centers[hi] - p ? lo : hi;
    }

    // Активная миниатюра переезжает на соседнюю (с анимацией из CSS)
    function activateThumb(index) {
      thumbEls[thumbIndex].classList.remove("active");
      thumbEls[index].classList.add("active");
      thumbIndex = index;
    }

    // Та же миниатюра, но в другой копии ленты — без анимации,
    // чтобы при «перескоке» ленты не было мигания
    function relocateActive(index) {
      const prev = thumbEls[thumbIndex];
      const next = thumbEls[index];

      thumbIndex = index;

      if (prev === next) {
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

    // Единственная точка, где двигается лента.
    // Бесконечность: как только pos вышел за среднюю копию — переносим
    // его на период назад/вперёд (визуально неотличимо).
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
          syncSlideToThumb();
        }
      }
    }

    // ==============================================================
    // СЛАЙДЫ: ПОЗИЦИЯ
    // ==============================================================

    function setSlidePercent(percent) {
      currentSlidePercent = percent;
      slidesEl.style.transform = `translate3d(${percent}%,0,0)`;
    }

    function snapSlide(index) {
      slideIndex = index;
      setSlidePercent(-index * 100);
      hydrateAround(index);
    }

    function normalizeSlides() {
      if (slideIndex === N + 1) {
        snapSlide(1);
      } else if (slideIndex === 0) {
        snapSlide(N);
      }
    }

    // Большое фото = фото той миниатюры, что сейчас в центре
    function syncSlideToThumb() {
      const wanted = (thumbIndex % N) + 1;

      if (wanted !== slideIndex || currentSlidePercent !== -wanted * 100) {
        snapSlide(wanted);
      }
    }

    // ==============================================================
    // ПЕРЕХОД (клик по миниатюре / края / autoplay)
    // ==============================================================

    function cancelFrame() {
      if (motionFrame) {
        cancelAnimationFrame(motionFrame);
        motionFrame = null;
      }
    }

    function animateTo(newSlideIndex, targetThumbIndex, onDone) {
      cancelFrame();
      scrubbing = false;

      const slideFrom = currentSlidePercent;
      const slideTo = -newSlideIndex * 100;
      const thumbDelta = ready ? centers[targetThumbIndex] - pos : 0;

      let prevRaw = 0;

      const start = performance.now();

      function step(now) {
        const t = Math.min(1, Math.max(0, (now - start) / TRANSITION_MS));
        const eased = 1 - Math.pow(1 - t, 3);

        setSlidePercent(slideFrom + (slideTo - slideFrom) * eased);

        if (ready && thumbDelta) {
          const raw = thumbDelta * eased;

          moveBy(raw - prevRaw);
          prevRaw = raw;
        }

        if (t < 1) {
          motionFrame = requestAnimationFrame(step);
        } else {
          motionFrame = null;
          slideIndex = newSlideIndex;
          onDone();
        }
      }

      motionFrame = requestAnimationFrame(step);
    }

    function goTo(newSlideIndex, targetThumbIndex, manual) {
      if (isAnimating) {
        return;
      }

      // Подтягиваем целевой слайд и соседей заранее, чтобы переход
      // не показывал пустой кадр
      hydrateAround(newSlideIndex);

      isAnimating = true;

      animateTo(newSlideIndex, targetThumbIndex, () => {
        normalizeSlides();

        // Лента была скрыта — просто запоминаем, какая миниатюра активна
        if (!ready) {
          relocateActive(midCopy * N + slideIndex - 1);
        }

        isAnimating = false;

        if (manual) {
          freezeThenResume();
        }
      });
    }

    function advance(direction = 1, manual = false) {
      goTo(slideIndex + direction, thumbIndex + direction, manual);
    }

    // ==============================================================
    // ДОВОДКА ПОСЛЕ ПЕРЕТАСКИВАНИЯ
    //
    // Критически задемпфированная пружина: стартует с текущей скоростью
    // пальца (поэтому нет «рывка» при отпускании) и приходит ровно в
    // центр миниатюры, ближайшей к «проекции» броска.
    // ==============================================================

    function settle(velocity) {
      cancelFrame();
      scrubbing = true;

      const projected = pos + velocity * FLING_PROJECT_MS;
      const k = Math.floor((projected - midLo) / period);
      const snapPos = centers[nearestIndex(projected - k * period)] + k * period;

      const A = pos - snapPos;
      const B = velocity + SETTLE_OMEGA * A;

      const start = performance.now();
      let prevRaw = pos;

      function step(now) {
        const t = Math.max(0, now - start);
        const decay = Math.exp(-SETTLE_OMEGA * t);

        const u = (A + B * t) * decay;
        const du = (B - SETTLE_OMEGA * (A + B * t)) * decay;

        const finished =
          t > 1500 || (Math.abs(u) < 0.2 && Math.abs(du) < 0.005);

        const raw = finished ? snapPos : snapPos + u;

        moveBy(raw - prevRaw);
        prevRaw = raw;

        if (!finished) {
          motionFrame = requestAnimationFrame(step);
          return;
        }

        motionFrame = null;
        scrubbing = false;
        syncSlideToThumb();
        freezeThenResume();
      }

      motionFrame = requestAnimationFrame(step);
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

    // Пауза, когда карусель не видна или вкладка в фоне
    function applyPlayState() {
      if (!progressAnim) {
        return;
      }

      if (inView && tabVisible) {
        progressAnim.play();
      } else {
        progressAnim.pause();
      }
    }

    function runProgress(delay = 0) {
      stopProgress();

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

      // Заполненная полоса плавно гаснет...
      bar.style.zIndex = "1";

      const fade = bar.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: FADE_MS,
        easing: "ease",
        fill: "forwards",
      });

      fade.onfinish = () => {
        bar.getAnimations().forEach((animation) => animation.cancel());
      };

      // ...а вторая становится активной
      activeBar = other;
      idleBar = bar;

      advance(1, false);
      runProgress();
    }

    // Пауза после ручного переключения
    function freezeThenResume() {
      resetBars();
      runProgress(FREEZE_DELAY);
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

      const newSlideIndex = parseInt(thumb.dataset.realIndex, 10) + 1;

      // Уже открытая фотография
      if (newSlideIndex === slideIndex) {
        freezeThenResume();
        return;
      }

      // Кликнутая миниатюра и так на экране — едем прямо к ней
      goTo(newSlideIndex, thumbEls.indexOf(thumb), true);
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

      // Палец «ловит» ленту, если она ещё едет
      const wasMoving = motionFrame !== null;

      if (wasMoving) {
        cancelFrame();
        isAnimating = false;
        scrubbing = true;
        syncSlideToThumb();
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

      // Окно для расчёта скорости отпускания
      const samples = drag.samples;

      samples.push({ x: event.clientX, t: event.timeStamp });

      while (samples.length > 2 && event.timeStamp - samples[0].t > VELOCITY_WINDOW_MS) {
        samples.shift();
      }

      // Не чаще одного обновления DOM на кадр
      if (!dragFrame) {
        dragFrame = requestAnimationFrame(flushDrag);
      }
    });

    thumbsViewEl.addEventListener("pointerup", endDrag);
    thumbsViewEl.addEventListener("pointercancel", endDrag);
    thumbsViewEl.addEventListener("lostpointercapture", endDrag);

    function startDrag(event) {
      drag.active = true;

      cancelFrame();
      isAnimating = false;
      scrubbing = true;

      try {
        thumbsViewEl.setPointerCapture(event.pointerId);
      } catch (error) {
        // не критично
      }

      thumbsViewEl.style.cursor = "grabbing";

      // Пока тянем — autoplay стоит
      resetBars();
      syncSlideToThumb();
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

      // Палец остановился перед тем, как его убрали
      if (endTime - last.t > 80) {
        return 0;
      }

      const dt = last.t - first.t;

      if (dt < 1) {
        return 0;
      }

      const v = -(last.x - first.x) / dt; // в координатах ленты
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

      // Просто тап: клик обработается отдельно, но если мы «поймали»
      // едущую ленту — её надо довести до ближайшей миниатюры
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

      // Клик, который браузер отправит после перетаскивания, игнорируем
      suppressClick = true;
      setTimeout(() => {
        suppressClick = false;
      }, 50);

      const velocity =
        event.type === "pointerup"
          ? releaseVelocity(finished.samples, event.timeStamp)
          : 0;

      settle(velocity);
    }

    // ==============================================================
    // СВАЙПЫ ПО СЛАЙДАМ
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

      // Влево → следующая, вправо → предыдущая
      advance(dx < 0 ? 1 : -1, true);
    });

    slidesEl.addEventListener("pointercancel", () => {
      pointerActive = false;
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

    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        inView = entries[entries.length - 1].isIntersecting;
        applyPlayState();
      }).observe(carouselEl);
    }

    document.addEventListener("visibilitychange", () => {
      tabVisible = !document.hidden;
      applyPlayState();
    });

    // ==============================================================
    // ЗАПУСК
    // ==============================================================

    measure();
    resetBars();
    runProgress();
  }
})();
