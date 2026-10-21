(() => {
  // ================================================================
  // ART-XAOS — МНОГОКАРУСЕЛЬНАЯ СИСТЕМА
  //
  // Каждая .carousel[data-carousel] работает независимо.
  //
  // Возможности:
  // - несколько каруселей на одной странице
  // - разные фотографии
  // - бесконечная прокрутка
  // - autoplay
  // - двойная полоса прогресса
  // - клики по краям
  // - миниатюры
  // - свайпы
  // - независимые таймеры
  // ================================================================

  // ================================================================
  // НАСТРОЙКИ
  // ================================================================

  const AUTOPLAY_DELAY = 5000;

  const FREEZE_DELAY = 5000;

  const TRANSITION_MS = 450;

  const FADE_MS = 1000;

  const THUMB_COPIES = 5;

  const SWIPE_THRESHOLD = 50;

  // ================================================================
  // ИНИЦИАЛИЗАЦИЯ ВСЕХ КАРУСЕЛЕЙ
  // ================================================================

  document.querySelectorAll("[data-carousel]").forEach(initCarousel);

  // ================================================================
  // ИНИЦИАЛИЗАЦИЯ ОДНОЙ КАРУСЕЛИ
  // ================================================================

  function initCarousel(carouselEl) {
    // ==============================================================
    // DOM ЭТОЙ КОНКРЕТНОЙ КАРУСЕЛИ
    // ==============================================================

    const slidesEl = carouselEl.querySelector(".slides");

    const progressFrontEl = carouselEl.querySelector(".progress-bar--front");

    const progressBackEl = carouselEl.querySelector(".progress-bar--back");

    const thumbsTrackEl = carouselEl.querySelector(".thumbs-track");

    const thumbsViewEl = carouselEl.querySelector(".thumbs");

    const imagesEl = carouselEl.querySelector(".carousel-images");

    // ==============================================================
    // ПРОВЕРКА СТРУКТУРЫ
    // ==============================================================

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
    // ПОЛУЧАЕМ ФОТОГРАФИИ ИЗ HTML
    // ==============================================================

    const sourceImages = Array.from(imagesEl.querySelectorAll("img"));

    const images = sourceImages
      .map((img) => ({
        src: img.getAttribute("src"),
        alt: img.getAttribute("alt") || "Изображение",
      }))
      .filter((image) => image.src && image.src.trim() !== "");

    const N = images.length;

    if (!N) {
      console.warn("ART-XAOS: у карусели нет фотографий", carouselEl);

      return;
    }

    // ==============================================================
    // ИСХОДНЫЙ СПИСОК ФОТОГРАФИЙ СКРЫВАЕМ
    // ==============================================================

    imagesEl.style.display = "none";

    // ==============================================================
    // СОЗДАЁМ БЕСКОНЕЧНУЮ ЛЕНТУ СЛАЙДОВ
    // ==============================================================

    const extended = [images[N - 1], ...images, images[0]];

    extended.forEach((imageData) => {
      const slide = document.createElement("div");

      slide.className = "slide";

      const img = document.createElement("img");

      img.src = imageData.src;

      img.alt = imageData.alt;

      img.draggable = false;

      slide.appendChild(img);

      slidesEl.appendChild(slide);
    });

    // ==============================================================
    // СОЗДАЁМ МИНИАТЮРЫ
    // ==============================================================

    const MID_COPY = Math.floor(THUMB_COPIES / 2);

    for (let copy = 0; copy < THUMB_COPIES; copy++) {
      images.forEach((imageData, index) => {
        const thumb = document.createElement("div");

        thumb.className = "thumb";

        thumb.dataset.realIndex = index;

        const img = document.createElement("img");

        img.src = imageData.src;

        img.alt = imageData.alt;

        img.draggable = false;

        thumb.appendChild(img);

        thumbsTrackEl.appendChild(thumb);
      });
    }

    const thumbEls = Array.from(thumbsTrackEl.querySelectorAll(".thumb"));

    // ==============================================================
    // СОСТОЯНИЕ
    // ==============================================================

    let slideIndex = 1;

    let thumbIndex = MID_COPY * N;

    let currentSlidePercent = -slideIndex * 100;

    let currentThumbPx = 0;

    let isAnimating = false;

    let posAnimFrame = null;

    let timer = null;

    let progressRaf = null;

    // ==============================================================
    // ДВЕ ПОЛОСЫ ПРОГРЕССА
    // ==============================================================

    let activeProgressBar = progressFrontEl;

    let fadingProgressBar = progressBackEl;

    // ==============================================================
    // ПОЗИЦИЯ СЛАЙДОВ
    // ==============================================================

    function setSlideTransform(percent) {
      slidesEl.style.transform = `translateX(${percent}%)`;
    }

    // ==============================================================
    // ПОЗИЦИЯ МИНИАТЮР
    // ==============================================================

    function setThumbTransform(px) {
      thumbsTrackEl.style.transform = `translateX(${-px}px)`;
    }

    // ==============================================================
    // ЦЕНТРИРОВАНИЕ МИНИАТЮРЫ
    // ==============================================================

    function centerOffsetFor(index) {
      const thumb = thumbEls[index];

      if (!thumb) {
        return 0;
      }

      return (
        thumb.offsetLeft - (thumbsViewEl.clientWidth - thumb.clientWidth) / 2
      );
    }

    // ==============================================================
    // АКТИВНАЯ МИНИАТЮРА
    // ==============================================================

    function setActiveThumb(index) {
      thumbEls.forEach((thumb, i) => {
        thumb.classList.toggle("active", i === index);
      });
    }

    // ==============================================================
    // МГНОВЕННАЯ УСТАНОВКА
    // ==============================================================

    function snapTo(newSlideIndex, newThumbIndex) {
      slideIndex = newSlideIndex;

      thumbIndex = newThumbIndex;

      currentSlidePercent = -slideIndex * 100;

      currentThumbPx = centerOffsetFor(thumbIndex);

      setSlideTransform(currentSlidePercent);

      setThumbTransform(currentThumbPx);

      setActiveThumb(thumbIndex);
    }

    // ==============================================================
    // ПЛАВНАЯ АНИМАЦИЯ
    // ==============================================================

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

    // ==============================================================
    // НОРМАЛИЗАЦИЯ БЕСКОНЕЧНОЙ ПРОКРУТКИ
    // ==============================================================

    function normalizeAfterMove() {
      let newSlideIndex = slideIndex;

      if (slideIndex === N + 1) {
        newSlideIndex = 1;
      }

      if (slideIndex === 0) {
        newSlideIndex = N;
      }

      let newThumbIndex = thumbIndex;

      const middleStart = MID_COPY * N;

      const middleEnd = middleStart + N;

      if (thumbIndex < middleStart || thumbIndex >= middleEnd) {
        newThumbIndex = middleStart + (((thumbIndex % N) + N) % N);
      }

      if (newSlideIndex !== slideIndex || newThumbIndex !== thumbIndex) {
        snapTo(newSlideIndex, newThumbIndex);
      }
    }

    // ==============================================================
    // ОСТАНОВКА ТАЙМЕРОВ
    // ==============================================================

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

    // ==============================================================
    // СБРОС ПРОГРЕССА
    // ==============================================================

    function resetProgressBars() {
      stopClock();

      [progressFrontEl, progressBackEl].forEach((bar) => {
        bar.style.transition = "none";

        bar.style.opacity = "1";

        bar.style.width = "0%";
      });

      progressFrontEl.style.zIndex = "2";

      progressBackEl.style.zIndex = "1";

      activeProgressBar = progressFrontEl;

      fadingProgressBar = progressBackEl;
    }

    // ==============================================================
    // AUTOPLAY + ПРОГРЕСС
    // ==============================================================

    function runProgress() {
      if (progressRaf) {
        cancelAnimationFrame(progressRaf);
      }

      const bar = activeProgressBar;

      const oldBar = fadingProgressBar;

      // ------------------------------------------------------------
      // Подготавливаем новую полосу
      // ------------------------------------------------------------

      bar.style.transition = "none";

      bar.style.opacity = "1";

      bar.style.width = "0%";

      bar.style.zIndex = "2";

      oldBar.style.zIndex = "1";

      void bar.offsetWidth;

      const startTime = performance.now();

      function animate(now) {
        const elapsed = now - startTime;

        const progress = Math.min(elapsed / AUTOPLAY_DELAY, 1);

        bar.style.width = `${progress * 100}%`;

        if (progress < 1) {
          progressRaf = requestAnimationFrame(animate);

          return;
        }

        // ----------------------------------------------------------
        // Полоса закончилась
        // ----------------------------------------------------------

        bar.style.width = "100%";

        // ----------------------------------------------------------
        // Старая полоса плавно исчезает
        // ----------------------------------------------------------

        bar.style.zIndex = "1";

        bar.style.transition = `opacity ${FADE_MS}ms ease`;

        void bar.offsetWidth;

        bar.style.opacity = "0";

        // ----------------------------------------------------------
        // Вторая полоса становится активной
        // ----------------------------------------------------------

        const nextBar = oldBar;

        nextBar.style.transition = "none";

        nextBar.style.opacity = "1";

        nextBar.style.width = "0%";

        nextBar.style.zIndex = "2";

        activeProgressBar = nextBar;

        fadingProgressBar = bar;

        // ----------------------------------------------------------
        // Следующая фотография
        // ----------------------------------------------------------

        advance(1, false);

        void nextBar.offsetWidth;

        // ----------------------------------------------------------
        // Следующий цикл
        // ----------------------------------------------------------

        runProgress();

        // ----------------------------------------------------------
        // Возвращаем старую полосу в исходное состояние
        // ----------------------------------------------------------

        setTimeout(() => {
          bar.style.transition = "none";

          bar.style.opacity = "1";

          bar.style.width = "0%";

          bar.style.zIndex = "1";
        }, FADE_MS);
      }

      progressRaf = requestAnimationFrame(animate);
    }

    // ==============================================================
    // AUTOPLAY
    // ==============================================================

    function scheduleAutoplay() {
      stopClock();

      runProgress();
    }

    // ==============================================================
    // ПАУЗА ПОСЛЕ РУЧНОГО ПЕРЕКЛЮЧЕНИЯ
    // ==============================================================

    function freezeThenResume() {
      stopClock();

      [progressFrontEl, progressBackEl].forEach((bar) => {
        bar.style.transition = "none";

        bar.style.opacity = "1";

        bar.style.width = "0%";
      });

      activeProgressBar.style.zIndex = "2";

      fadingProgressBar.style.zIndex = "1";

      timer = setTimeout(() => {
        timer = null;

        runProgress();
      }, FREEZE_DELAY);
    }

    // ==============================================================
    // ПЕРЕХОД
    // ==============================================================

    function goTo(newSlideIndex, newThumbIndex, manual) {
      if (isAnimating) {
        return;
      }

      isAnimating = true;

      animateTo(newSlideIndex, newThumbIndex, () => {
        normalizeAfterMove();

        isAnimating = false;

        if (manual) {
          freezeThenResume();
        }
      });
    }

    // ==============================================================
    // NEXT / PREVIOUS
    // ==============================================================

    function advance(direction = 1, manual = false) {
      goTo(slideIndex + direction, thumbIndex + direction, manual);
    }

    // ==============================================================
    // НАЧАЛЬНАЯ ПОЗИЦИЯ
    // ==============================================================

    snapTo(slideIndex, thumbIndex);

    resetProgressBars();

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

    thumbsTrackEl.addEventListener("click", (event) => {
      const thumb = event.target.closest(".thumb");

      if (!thumb) {
        return;
      }

      const realIndex = parseInt(thumb.dataset.realIndex, 10);

      const newSlideIndex = realIndex + 1;

      // Уже открытая фотография

      if (newSlideIndex === slideIndex) {
        freezeThenResume();

        return;
      }

      // ----------------------------------------------------------
      // Ищем ближайшую копию миниатюры
      // ----------------------------------------------------------

      let nearestThumbIndex = realIndex;

      let bestDistance = Infinity;

      for (let copy = 0; copy < THUMB_COPIES; copy++) {
        const candidate = copy * N + realIndex;

        const distance = Math.abs(candidate - thumbIndex);

        if (distance < bestDistance) {
          bestDistance = distance;

          nearestThumbIndex = candidate;
        }
      }

      goTo(newSlideIndex, nearestThumbIndex, true);
    });

    // ==============================================================
    // СВАЙПЫ
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

      // Слишком маленькое движение

      if (Math.abs(dx) < SWIPE_THRESHOLD) {
        return;
      }

      // Вертикальный скролл

      if (Math.abs(dx) < Math.abs(dy)) {
        return;
      }

      // Влево → следующая
      // Вправо → предыдущая

      advance(dx < 0 ? 1 : -1, true);
    });

    slidesEl.addEventListener("pointercancel", () => {
      pointerActive = false;
    });

    // ==============================================================
    // RESIZE
    //
    // После изменения размера окна активная миниатюра снова
    // центрируется.
    // ==============================================================

    window.addEventListener("resize", () => {
      currentThumbPx = centerOffsetFor(thumbIndex);

      setThumbTransform(currentThumbPx);
    });

    // ==============================================================
    // ЗАПУСК
    // ==============================================================

    scheduleAutoplay();
  }
})();
