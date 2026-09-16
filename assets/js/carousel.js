(() => {
  // ================================================================
  // ART-XAOS — КАРУСЕЛЬ
  // Крупное фото + лента миниатюр
  // Бесконечная прокрутка + autoplay + двойная полоса прогресса
  // ================================================================

  const images = [
    "assets/images/studio/lq/5.jpg",
    "assets/images/studio/lq/3.jpg",
    "assets/images/studio/lq/8.jpg",
    "assets/images/studio/lq/4.jpg",
    "assets/images/studio/lq/1.jpg",
    "assets/images/studio/lq/6.jpg",
    "assets/images/studio/lq/7.jpg",
    "assets/images/studio/lq/2.jpg",
    "assets/images/studio/lq/9.jpg",
  ];

  const AUTOPLAY_DELAY = 5000;
  const FREEZE_DELAY = 5000;
  const TRANSITION_MS = 450;
  const FADE_MS = 1000;

  const slidesEl = document.getElementById("slides");
  const progressFrontEl = document.getElementById("progressFront");
  const progressBackEl = document.getElementById("progressBack");
  const thumbsTrackEl = document.getElementById("thumbsTrack");

  // Если на странице нет карусели — ничего не делаем.
  if (!slidesEl || !progressFrontEl || !progressBackEl || !thumbsTrackEl) {
    return;
  }

  const thumbsViewEl = thumbsTrackEl.parentElement;
  const N = images.length;

  if (!N) return;

  // ================================================================
  // СЛАЙДЫ
  // ================================================================

  const extended = [images[N - 1], ...images, images[0]];

  extended.forEach((src) => {
    const slide = document.createElement("div");
    slide.className = "slide";

    const img = document.createElement("img");
    img.src = src;
    img.alt = "Изображение";
    img.draggable = false;

    slide.appendChild(img);
    slidesEl.appendChild(slide);
  });

  // ================================================================
  // МИНИАТЮРЫ
  // ================================================================

  const THUMB_COPIES = 5;
  const MID_COPY = Math.floor(THUMB_COPIES / 2);

  for (let copy = 0; copy < THUMB_COPIES; copy++) {
    images.forEach((src, i) => {
      const thumb = document.createElement("div");

      thumb.className = "thumb";
      thumb.dataset.realIndex = i;

      const img = document.createElement("img");
      img.src = src;
      img.alt = "Миниатюра " + (i + 1);
      img.draggable = false;

      thumb.appendChild(img);
      thumbsTrackEl.appendChild(thumb);
    });
  }

  const thumbEls = Array.from(thumbsTrackEl.querySelectorAll(".thumb"));

  // ================================================================
  // СОСТОЯНИЕ
  // ================================================================

  let slideIndex = 1;
  let thumbIndex = MID_COPY * N;

  let currentSlidePercent = -slideIndex * 100;
  let currentThumbPx = 0;

  let isAnimating = false;

  let posAnimFrame = null;
  let timer = null;
  let progressRaf = null;

  // ================================================================
  // ДВЕ ПОЛОСЫ ПРОГРЕССА
  // ================================================================

  let activeProgressBar = progressFrontEl;
  let fadingProgressBar = progressBackEl;

  // ================================================================
  // TRANSFORM
  // ================================================================

  function setSlideTransform(percent) {
    slidesEl.style.transform = "translateX(" + percent + "%)";
  }

  function setThumbTransform(px) {
    thumbsTrackEl.style.transform = "translateX(" + -px + "px)";
  }

  // ================================================================
  // ЦЕНТРИРОВАНИЕ МИНИАТЮРЫ
  // ================================================================

  function centerOffsetFor(i) {
    const el = thumbEls[i];

    if (!el) return 0;

    return el.offsetLeft - (thumbsViewEl.clientWidth - el.clientWidth) / 2;
  }

  // ================================================================
  // АКТИВНАЯ МИНИАТЮРА
  // ================================================================

  function setActiveThumb(i) {
    thumbEls.forEach((thumb, index) => {
      thumb.classList.toggle("active", index === i);
    });
  }

  // ================================================================
  // МГНОВЕННАЯ УСТАНОВКА ПОЗИЦИИ
  // ================================================================

  function snapTo(newSlideIndex, newThumbIndex) {
    slideIndex = newSlideIndex;
    thumbIndex = newThumbIndex;

    currentSlidePercent = -slideIndex * 100;
    currentThumbPx = centerOffsetFor(thumbIndex);

    setSlideTransform(currentSlidePercent);
    setThumbTransform(currentThumbPx);
    setActiveThumb(thumbIndex);
  }

  // ================================================================
  // АНИМАЦИЯ ПЕРЕХОДА
  // ================================================================

  function animateTo(newSlideIndex, newThumbIndex, onDone) {
    if (posAnimFrame) {
      cancelAnimationFrame(posAnimFrame);
    }

    const slideFrom = currentSlidePercent;
    const slideTo = -newSlideIndex * 100;

    const thumbFrom = currentThumbPx;
    const thumbTo = centerOffsetFor(newThumbIndex);

    setActiveThumb(newThumbIndex);

    const start = performance.now();

    function step(now) {
      const t = Math.min(1, (now - start) / TRANSITION_MS);

      const eased = 1 - Math.pow(1 - t, 3);

      currentSlidePercent = slideFrom + (slideTo - slideFrom) * eased;

      currentThumbPx = thumbFrom + (thumbTo - thumbFrom) * eased;

      setSlideTransform(currentSlidePercent);
      setThumbTransform(currentThumbPx);

      if (t < 1) {
        posAnimFrame = requestAnimationFrame(step);
      } else {
        posAnimFrame = null;

        slideIndex = newSlideIndex;
        thumbIndex = newThumbIndex;

        onDone();
      }
    }

    posAnimFrame = requestAnimationFrame(step);
  }

  // ================================================================
  // НОРМАЛИЗАЦИЯ БЕСКОНЕЧНОЙ КАРУСЕЛИ
  // ================================================================

  function normalizeAfterMove() {
    let newSlideIndex = slideIndex;

    if (slideIndex === N + 1) {
      newSlideIndex = 1;
    } else if (slideIndex === 0) {
      newSlideIndex = N;
    }

    let newThumbIndex = thumbIndex;

    const midStart = MID_COPY * N;
    const midEnd = midStart + N;

    if (thumbIndex < midStart || thumbIndex >= midEnd) {
      newThumbIndex = midStart + (((thumbIndex % N) + N) % N);
    }

    if (newSlideIndex !== slideIndex || newThumbIndex !== thumbIndex) {
      snapTo(newSlideIndex, newThumbIndex);
    }
  }

  // ================================================================
  // ОСТАНОВКА AUTOPLAY
  // ================================================================

  function stopClock() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    if (progressRaf) {
      cancelAnimationFrame(progressRaf);
      progressRaf = null;
    }
  }

  // ================================================================
  // ПОДГОТОВКА ПОЛОС
  // ================================================================

  function resetProgressBars() {
    stopClock();

    [progressFrontEl, progressBackEl].forEach((bar) => {
      bar.classList.remove("is-fading");

      bar.style.transition = "none";
      bar.style.opacity = "1";
      bar.style.width = "0%";
    });

    /*
     * Front начинает первым.
     */
    progressFrontEl.style.zIndex = "2";
    progressBackEl.style.zIndex = "1";

    activeProgressBar = progressFrontEl;
    fadingProgressBar = progressBackEl;
  }

  // ================================================================
  // ЗАПУСК ПРОГРЕСС-БАРА
  // ================================================================

  function runProgress() {
    if (progressRaf) {
      cancelAnimationFrame(progressRaf);
    }

    const bar = activeProgressBar;
    const oldBar = fadingProgressBar;

    /*
     * ------------------------------------------------------------
     * НОВАЯ ПОЛОСА
     * ------------------------------------------------------------
     */

    bar.classList.remove("is-fading");

    bar.style.transition = "none";
    bar.style.opacity = "1";
    bar.style.width = "0%";

    /*
     * Новая полоса ВСЕГДА находится поверх старой.
     */
    bar.style.zIndex = "2";
    oldBar.style.zIndex = "1";

    /*
     * Принудительная перерисовка.
     */
    void bar.offsetWidth;

    const startTime = performance.now();

    function animate(now) {
      const elapsed = now - startTime;

      const progress = Math.min(elapsed / AUTOPLAY_DELAY, 1);

      /*
       * Заполняем новую полосу.
       */
      bar.style.width = `${progress * 100}%`;

      if (progress < 1) {
        progressRaf = requestAnimationFrame(animate);
        return;
      }

      // ==========================================================
      // ПОЛОСА ДОШЛА ДО 100%
      // ==========================================================

      bar.style.width = "100%";

      /*
       * Теперь эта полоса становится старой.
       *
       * Она остаётся на 100% и начинает
       * ПЛАВНО исчезать.
       */
      bar.style.zIndex = "1";

      /*
       * ВАЖНО:
       * сначала включаем transition,
       * затем opacity 0.
       */
      bar.style.transition = `opacity ${FADE_MS}ms ease`;

      void bar.offsetWidth;

      bar.style.opacity = "0";

      /*
       * ==========================================================
       * ВТОРАЯ ПОЛОСА
       * ==========================================================
       */

      const nextBar = oldBar;

      /*
       * Она полностью непрозрачна.
       */
      nextBar.classList.remove("is-fading");

      nextBar.style.transition = "none";
      nextBar.style.opacity = "1";
      nextBar.style.width = "0%";

      /*
       * Она находится ПОВЕРХ исчезающей полосы.
       */
      nextBar.style.zIndex = "2";

      /*
       * Теперь меняем роли.
       */
      activeProgressBar = nextBar;
      fadingProgressBar = bar;

      /*
       * Переключаем фотографию.
       */
      advance(1, false);

      /*
       * Принудительно фиксируем состояние 0%.
       */
      void nextBar.offsetWidth;

      /*
       * Запускаем НОВЫЙ цикл.
       */
      runProgress();

      /*
       * Старую полосу НЕ трогаем в течение секунды.
       *
       * Она спокойно исчезает под новой.
       */
      setTimeout(() => {
        bar.classList.remove("is-fading");

        bar.style.transition = "none";
        bar.style.opacity = "1";
        bar.style.width = "0%";
        bar.style.zIndex = "1";
      }, FADE_MS);
    }

    progressRaf = requestAnimationFrame(animate);
  }

  // ================================================================
  // AUTOPLAY
  // ================================================================

  function scheduleAutoplay() {
    stopClock();
    runProgress();
  }

  // ================================================================
  // ПАУЗА ПОСЛЕ РУЧНОГО ДЕЙСТВИЯ
  // ================================================================

  function freezeThenResume() {
    stopClock();

    /*
     * При ручном переключении:
     *
     * обе полосы полностью сбрасываются;
     * никакой старой прозрачности не остаётся.
     */

    [progressFrontEl, progressBackEl].forEach((bar) => {
      bar.classList.remove("is-fading");

      bar.style.transition = "none";
      bar.style.opacity = "1";
      bar.style.width = "0%";
    });

    /*
     * Активная полоса снова сверху.
     */
    activeProgressBar.style.zIndex = "2";
    fadingProgressBar.style.zIndex = "1";

    /*
     * Ждём FREEZE_DELAY.
     */
    timer = setTimeout(() => {
      timer = null;
      runProgress();
    }, FREEZE_DELAY);
  }

  // ================================================================
  // ПЕРЕКЛЮЧЕНИЕ
  // ================================================================

  function goTo(newSlideIndex, newThumbIndex, manual) {
    if (isAnimating) return;

    isAnimating = true;

    animateTo(newSlideIndex, newThumbIndex, () => {
      normalizeAfterMove();

      isAnimating = false;

      if (manual) {
        freezeThenResume();
      }
    });
  }

  function advance(dir = 1, manual = false) {
    goTo(slideIndex + dir, thumbIndex + dir, manual);
  }

  // ================================================================
  // НАЧАЛЬНОЕ СОСТОЯНИЕ
  // ================================================================

  snapTo(slideIndex, thumbIndex);
  resetProgressBars();

  // ================================================================
  // КЛИКИ ПО КРАЯМ
  // ================================================================

  document.querySelectorAll(".zone").forEach((zone) => {
    zone.addEventListener("click", () => {
      const dir = parseInt(zone.dataset.dir, 10);

      if (!dir) return;

      advance(dir, true);
    });
  });

  // ================================================================
  // КЛИКИ ПО МИНИАТЮРАМ
  // ================================================================

  thumbsTrackEl.addEventListener("click", (e) => {
    const thumb = e.target.closest(".thumb");

    if (!thumb) return;

    const realIndex = parseInt(thumb.dataset.realIndex, 10);

    const newSlideIndex = realIndex + 1;

    if (newSlideIndex === slideIndex) {
      freezeThenResume();
      return;
    }

    /*
     * Ищем ближайшую копию миниатюры.
     */
    let nearestThumbIndex = realIndex;
    let bestDist = Infinity;

    for (let copy = 0; copy < THUMB_COPIES; copy++) {
      const candidate = copy * N + realIndex;

      const dist = Math.abs(candidate - thumbIndex);

      if (dist < bestDist) {
        bestDist = dist;
        nearestThumbIndex = candidate;
      }
    }

    goTo(newSlideIndex, nearestThumbIndex, true);
  });

  // ================================================================
  // СВАЙПЫ
  // ================================================================

  let pointerStartX = 0;
  let pointerStartY = 0;
  let pointerActive = false;

  const SWIPE_THRESHOLD = 50;

  slidesEl.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) {
      return;
    }

    pointerStartX = e.clientX;
    pointerStartY = e.clientY;
    pointerActive = true;
  });

  slidesEl.addEventListener("pointerup", (e) => {
    if (!pointerActive) return;

    pointerActive = false;

    const dx = e.clientX - pointerStartX;

    const dy = e.clientY - pointerStartY;

    if (Math.abs(dx) < SWIPE_THRESHOLD) {
      return;
    }

    if (Math.abs(dx) < Math.abs(dy)) {
      return;
    }

    /*
     * Влево — следующий.
     * Вправо — предыдущий.
     */
    advance(dx < 0 ? 1 : -1, true);
  });

  slidesEl.addEventListener("pointercancel", () => {
    pointerActive = false;
  });

  // ================================================================
  // ЗАПУСК
  // ================================================================

  scheduleAutoplay();
})();
