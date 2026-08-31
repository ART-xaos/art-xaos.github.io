(() => {
  // Студийная сетка 3×3: выбранное фото раскрывается поверх неизменной сетки.
  const studioGrid = document.getElementById("studio-grid");
  const studioOverlay = document.getElementById("studio-overlay");
  if (studioGrid && studioOverlay) {
    const studioReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const tiles = Array.from(studioGrid.querySelectorAll(".studio-tile"));
    const overlayImage = studioOverlay.querySelector(".studio-overlay__image");
    const overlayCaption = studioOverlay.querySelector(
      ".studio-overlay__caption",
    );
    const EASE = "cubic-bezier(.22, 1, .36, 1)";
    let openTile = null;

    function overlayTransformFor(tile) {
      const tileRect = tile.getBoundingClientRect();
      const gridRect = studioGrid.getBoundingClientRect();
      return `translate(${tileRect.left - gridRect.left}px, ${tileRect.top - gridRect.top}px) scale(${tileRect.width / gridRect.width}, ${tileRect.height / gridRect.height})`;
    }

    function animateOverlay(from, to, onFinish) {
      studioOverlay.getAnimations().forEach((animation) => animation.cancel());
      if (studioReducedMotion) {
        onFinish?.();
        return;
      }
      const animation = studioOverlay.animate(
        [{ transform: from }, { transform: to }],
        { duration: 250, easing: EASE, fill: "both" },
      );
      animation.onfinish = () => {
        studioOverlay.style.transform = "";
        onFinish?.();
      };
    }

    function setOverlayContent(tile) {
      const image = tile.querySelector(".studio-photo");
      overlayImage.src = image.currentSrc || image.src;
      overlayImage.alt = image.alt;
      overlayCaption.textContent = tile.querySelector("figcaption").textContent;
    }

    function closeTile() {
      if (!openTile) return;
      const tile = openTile;
      animateOverlay(
        "translate(0, 0) scale(1, 1)",
        overlayTransformFor(tile),
        () => {
          studioOverlay.hidden = true;
          studioGrid.classList.remove("has-open");
          tile.setAttribute("aria-expanded", "false");
          openTile = null;
        },
      );
    }

    function openTileEl(tile) {
      if (openTile === tile) {
        closeTile();
        return;
      }
      if (openTile) openTile.setAttribute("aria-expanded", "false");
      setOverlayContent(tile);
      studioOverlay.hidden = false;
      studioGrid.classList.add("has-open");
      tile.setAttribute("aria-expanded", "true");
      openTile = tile;
      animateOverlay(overlayTransformFor(tile), "translate(0, 0) scale(1, 1)");
    }

    function goToTile(direction) {
      if (!openTile) return;
      const index = tiles.indexOf(openTile);
      const next =
        tiles[
          (index + (direction === "next" ? 1 : -1) + tiles.length) %
            tiles.length
        ];
      openTile.setAttribute("aria-expanded", "false");
      openTile = next;
      next.setAttribute("aria-expanded", "true");
      setOverlayContent(next);
      if (!studioReducedMotion)
        overlayImage.animate([{ opacity: 0.35 }, { opacity: 1 }], {
          duration: 250,
          easing: EASE,
        });
    }

    tiles.forEach((tile) => {
      tile.addEventListener("click", () => openTileEl(tile));
    });

    studioOverlay.addEventListener("click", closeTile);

    document.addEventListener("keydown", (e) => {
      if (!openTile) return;
      if (e.key === "Escape") closeTile();
      if (e.key === "ArrowLeft") goToTile("prev");
      if (e.key === "ArrowRight") goToTile("next");
    });

    // свайп: влево — назад, вправо — вперёд
    let studioTouchX = 0,
      studioTouchY = 0;
    studioOverlay.addEventListener(
      "touchstart",
      (e) => {
        if (!openTile) return;
        studioTouchX = e.changedTouches[0].clientX;
        studioTouchY = e.changedTouches[0].clientY;
      },
      { passive: true },
    );
    studioOverlay.addEventListener(
      "touchend",
      (e) => {
        if (!openTile) return;
        const dx = e.changedTouches[0].clientX - studioTouchX;
        const dy = e.changedTouches[0].clientY - studioTouchY;
        if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
        goToTile(dx < 0 ? "prev" : "next");
      },
      { passive: true },
    );
  }

  // появление секций при скролле + подпись-росчерк в hero
  const toReveal = document.querySelectorAll(
    ".reveal, .reveal-group, .hero-signature .sig-draw",
  );
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
  );
  toReveal.forEach((el) => io.observe(el));

  // подпись в hero дорисовывается сразу после загрузки
  window.addEventListener("load", () => {
    document
      .querySelector(".hero-signature .sig-draw")
      ?.classList.add("in-view");
  });

  // фон меняет цвет вслед за текущим разделом
  const washEl = document.querySelector(".bg-wash");
  const accentColors = {
    blue: "rgba(46,67,116,0.7)",
    red: "rgba(180,67,42,0.7)",
    green: "rgba(82,99,59,0.7)",
  };
  const accentSections = document.querySelectorAll("section[data-accent]");
  const colorObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const accent = entry.target.dataset.accent;
          if (washEl && accentColors[accent])
            washEl.style.color = accentColors[accent];
        }
      });
    },
    { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
  );
  accentSections.forEach((s) => colorObserver.observe(s));

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  // счётчики-цифры при попадании в область просмотра
  function animateCount(el) {
    const target = parseInt(el.dataset.target, 10);
    if (prefersReducedMotion) {
      el.textContent = target;
      return;
    }
    const duration = 2000;
    const start = performance.now();
    function step(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(eased * target);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  const countObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          countObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.6 },
  );
  document.querySelectorAll(".count").forEach((c) => countObserver.observe(c));

  // медленный плавный скролл к якорям навигации
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  function smoothScrollTo(targetY, duration) {
    const startY = window.scrollY;
    const diff = targetY - startY;
    let startTime = null;
    function step(ts) {
      if (startTime === null) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      window.scrollTo(0, startY + diff * easeInOutCubic(progress));
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  const headerOffset = 84;
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    const href = link.getAttribute("href");
    if (!href || href.length < 2) return;
    const target = document.querySelector(href);
    if (!target) return;
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const targetY =
        target.getBoundingClientRect().top + window.scrollY - headerOffset;
      if (prefersReducedMotion) {
        window.scrollTo(0, targetY);
      } else {
        smoothScrollTo(targetY, 1500);
      }
      history.pushState(null, "", href);
      document.getElementById("tabs")?.classList.remove("open");
    });
  });

  // отправка заявки на почту через Web3Forms
  const contactForm = document.getElementById("contact-form");
  if (contactForm) {
    const statusEl = document.getElementById("form-status");
    const submitBtn = document.getElementById("form-submit-btn");
    const nameInput = document.getElementById("f-name");
    const phoneInput = document.getElementById("f-phone");
    const errName = document.getElementById("err-name");
    const errPhone = document.getElementById("err-phone");
    const consentInput = document.getElementById("f-consent");
    const errConsent = document.getElementById("err-consent");

    function showError(input, errEl, message) {
      input.classList.add("invalid");
      input.setAttribute("aria-invalid", "true");
      errEl.textContent = message;
      errEl.classList.add("visible");
    }
    function clearError(input, errEl) {
      input.classList.remove("invalid");
      input.setAttribute("aria-invalid", "false");
      errEl.textContent = "";
      errEl.classList.remove("visible");
    }

    function validateName() {
      const value = nameInput.value.trim();
      if (value.length < 2) {
        showError(
          nameInput,
          errName,
          "Укажите, пожалуйста, имя (минимум 2 символа)",
        );
        return false;
      }
      clearError(nameInput, errName);
      return true;
    }

    function validateContact() {
      const value = phoneInput.value.trim();
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
      const digitsOnly = value.replace(/[^\d]/g, "");
      const looksLikePhone = digitsOnly.length >= 10 && digitsOnly.length <= 11;
      const looksLikeEmail = emailRe.test(value);
      if (!value) {
        showError(phoneInput, errPhone, "Укажите телефон или почту для связи");
        return false;
      }
      if (!looksLikePhone && !looksLikeEmail) {
        showError(
          phoneInput,
          errPhone,
          "Похоже на опечатку — проверьте номер или почту",
        );
        return false;
      }
      clearError(phoneInput, errPhone);
      return true;
    }

    function validateConsent() {
      if (!consentInput.checked) {
        showError(
          consentInput,
          errConsent,
          "Нужно согласие на обработку данных",
        );
        return false;
      }
      clearError(consentInput, errConsent);
      return true;
    }

    nameInput.addEventListener("blur", validateName);
    nameInput.addEventListener("input", () => {
      if (nameInput.classList.contains("invalid")) validateName();
    });
    phoneInput.addEventListener("blur", validateContact);
    phoneInput.addEventListener("input", () => {
      if (phoneInput.classList.contains("invalid")) validateContact();
    });
    consentInput.addEventListener("change", validateConsent);

    // эвристика склонения русского имени в родительный падеж («от кого?»)
    // покрывает типовые окончания; для нестандартных/нерусских имён возвращает как есть
    const genitiveExceptions = {
      павел: "Павла",
      пётр: "Петра",
      петр: "Петра",
      лев: "Льва",
      любовь: "Любови",
      марья: "Марьи",
    };
    function toGenitive(name) {
      const trimmed = name.trim();
      if (!trimmed) return trimmed;
      const lower = trimmed.toLowerCase();
      if (genitiveExceptions[lower]) return genitiveExceptions[lower];
      if (!/^[А-ЯЁа-яё\- ]+$/.test(trimmed)) return trimmed; // не кириллица — не трогаем
      const first = trimmed.split(/[\s-]/)[0];
      const rest = trimmed.slice(first.length);
      const lowerFirst = first.toLowerCase();
      let stem, ending;
      if (lowerFirst.endsWith("ия")) {
        stem = first.slice(0, -1);
        ending = "и";
      } else if (lowerFirst.endsWith("ья")) {
        stem = first.slice(0, -1);
        ending = "и";
      } else if (lowerFirst.endsWith("я")) {
        stem = first.slice(0, -1);
        ending = "и";
      } else if (/[гкхжчшщ]а$/i.test(lowerFirst)) {
        stem = first.slice(0, -1);
        ending = "и";
      } else if (lowerFirst.endsWith("а")) {
        stem = first.slice(0, -1);
        ending = "ы";
      } else if (lowerFirst.endsWith("й")) {
        stem = first.slice(0, -1);
        ending = "я";
      } else if (lowerFirst.endsWith("ь")) {
        stem = first.slice(0, -1);
        ending = "я";
      } else if (/[бвгджзклмнпрстфхцчшщ]$/i.test(lowerFirst)) {
        stem = first;
        ending = "а";
      } else return trimmed; // необычное окончание — не гадаем
      return stem + ending + rest;
    }

    contactForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nameOk = validateName();
      const contactOk = validateContact();
      const consentOk = validateConsent();
      if (!nameOk || !contactOk || !consentOk) {
        (nameOk ? (contactOk ? consentInput : phoneInput) : nameInput).focus();
        statusEl.className = "form-status form-status--error";
        return;
      }
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = "Отправляю…";
      statusEl.textContent = "";
      statusEl.className = "form-status";
      try {
        const formData = new FormData(contactForm);
        const payload = Object.fromEntries(formData);
        payload.subject = `Новая заявка от ${toGenitive(nameInput.value)}`;
        const response = await fetch(contactForm.action, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        });
        const result = await response.json();
        if (!response.ok || !result.success)
          throw new Error(result.message || "bad response");
        statusEl.textContent =
          "Спасибо! Заявка отправлена, скоро свяжусь с вами.";
        statusEl.classList.add("form-status--ok");
        contactForm.reset();
      } catch (err) {
        statusEl.innerHTML =
          'Не получилось отправить автоматически. Напишите, пожалуйста, напрямую: <a href="mailto:art.xaos.studio@gmail.com">art.xaos.studio@gmail.com</a>';
        statusEl.classList.add("form-status--error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
  }

  // полоска прогресса прокрутки + кнопка «наверх»
  const progressBar = document.getElementById("scroll-progress-bar");
  const toTopBtn = document.getElementById("to-top");
  function updateScrollUi() {
    const scrollTop = window.scrollY;
    const docHeight =
      document.documentElement.scrollHeight - window.innerHeight;
    const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    if (progressBar) progressBar.style.width = progress + "%";
    if (toTopBtn) toTopBtn.classList.toggle("visible", scrollTop > 500);
  }
  window.addEventListener("scroll", updateScrollUi, { passive: true });
  updateScrollUi();

  if (toTopBtn) {
    toTopBtn.addEventListener("click", () => {
      if (prefersReducedMotion) {
        window.scrollTo(0, 0);
      } else {
        smoothScrollTo(0, 1200);
      }
    });
  }
})();
