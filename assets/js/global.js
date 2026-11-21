(() => {
  const loader = document.querySelector(".page-loader");
  if (loader) {
    let revealed = false;
    const revealPage = () => {
      if (revealed) return;
      revealed = true;
      clearTimeout(fallbackTimer);
      const fontsReady = document.fonts?.ready ?? Promise.resolve();
      const fontFallback = new Promise((resolve) => setTimeout(resolve, 1500));
      const showPage = () => {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          document.documentElement.classList.remove("is-loading");
          setTimeout(() => loader.remove(), 350);
        }));
      };
      Promise.race([fontsReady, fontFallback]).then(showPage, showPage);
    };
    const fallbackTimer = setTimeout(revealPage, 10000);
    window.addEventListener("load", revealPage, { once: true });
  }

  // Подзаголовки логотипа точно повторяют ширину надписи «АРТ-ХАОС».
  document.querySelectorAll(".logo-text").forEach((logo) => {
    const title = logo.querySelector(".logo-title");
    if (!title) return;

    const syncWidth = () => {
      const tracking = parseFloat(getComputedStyle(title).letterSpacing) || 0;
      const width = `${Math.max(0, title.getBoundingClientRect().width - tracking)}px`;
      logo.querySelectorAll("small").forEach((subtitle) => {
        subtitle.style.fontSize = "";
        subtitle.style.width = width;
        // Measure the text at its natural width; justified spacing otherwise
        // hides overflow and makes narrow captions look stretched on refresh.
        subtitle.style.textAlign = "left";
        subtitle.style.textAlignLast = "left";
        if (subtitle.scrollWidth > subtitle.clientWidth) {
          const baseSize = parseFloat(getComputedStyle(subtitle).fontSize);
          subtitle.style.fontSize = `${baseSize * subtitle.clientWidth / subtitle.scrollWidth}px`;
        }
        subtitle.style.textAlign = "justify";
        subtitle.style.textAlignLast = "justify";
      });
    };

    let resizeFrame = 0;
    window.addEventListener(
      "resize",
      () => {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(syncWidth);
      },
      { passive: true },
    );
    if ("ResizeObserver" in window) {
      const titleObserver = new ResizeObserver(() => {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(syncWidth);
      });
      titleObserver.observe(title);
    }
    syncWidth();
    if (document.fonts) {
      const style = getComputedStyle(logo);
      const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      document.fonts.load(font, title.textContent).then(() => {
        syncWidth();
      });
    }
  });

  document.querySelectorAll("p, h1, h2, h3, li").forEach((el) => {
    // Находим предлоги/союзы от 1 до 3 букв и числа,
    // а затем меняем обычный пробел ПОСЛЕ них на неразрывный (\u00A0)
    el.innerHTML = el.innerHTML.replace(
      /(?<=^|\s)([а-яА-ЯёЁ]{1,3}|\d+)\s/g,
      "$1\u00A0",
    );
  });

  // Общий эффект для основных кнопок на всех страницах, включая 404.
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (!prefersReducedMotion && window.matchMedia("(hover: hover)").matches) {
    document.querySelectorAll(".btn:not(.no-magnetic)").forEach((button) => {
      const strength = 10;
      let frame = 0;
      let pointerX = 0;
      let pointerY = 0;
      let currentX = 0;
      let currentY = 0;
      let active = false;

      button.addEventListener("pointermove", (event) => {
        const rect = button.getBoundingClientRect();
        pointerX = ((event.clientX - rect.left) / rect.width - 0.5) * strength;
        pointerY = ((event.clientY - rect.top) / rect.height - 0.5) * strength;
        active = true;
        button.classList.add("is-magnetic-active");
        if (!frame) frame = requestAnimationFrame(animate);
      });
      const animate = () => {
        const targetX = active ? pointerX : 0;
        const targetY = active ? pointerY : 0;
        currentX += (targetX - currentX) * 0.18;
        currentY += (targetY - currentY) * 0.18;
        const settled = Math.abs(targetX - currentX) < 0.08 && Math.abs(targetY - currentY) < 0.08;
        if (settled) {
          currentX = targetX;
          currentY = targetY;
        }
        button.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
        if (!settled) {
          frame = requestAnimationFrame(animate);
        } else if (!active) {
          frame = 0;
          button.classList.remove("is-magnetic-active");
          button.style.transform = "";
        } else {
          frame = 0;
        }
      };
      button.addEventListener("pointerleave", () => {
        active = false;
        if (!frame) frame = requestAnimationFrame(animate);
      });
    });
  }
})();
