(() => {
  document.querySelectorAll("p, h1, h2, h3, li").forEach((el) => {
    // Находим предлоги/союзы от 1 до 3 букв и числа,
    // а затем меняем обычный пробел ПОСЛЕ них на неразрывный (\u00A0)
    el.innerHTML = el.innerHTML.replace(
      /(?<=^|\s)([а-яА-ЯёЁ]{1,3}|\d+)\s/g,
      "$1\u00A0",
    );
  });

  const burger = document.getElementById("burger");
  const tabs = document.getElementById("tabs");
  if (burger && tabs) {
    const closeMenu = () => {
      tabs.classList.remove("open");
      burger.setAttribute("aria-expanded", "false");
    };
    const openMenu = () => {
      tabs.classList.add("open");
      burger.setAttribute("aria-expanded", "true");
    };

    burger.addEventListener("click", () => {
      tabs.classList.contains("open") ? closeMenu() : openMenu();
    });
    tabs
      .querySelectorAll("a")
      .forEach((link) => link.addEventListener("click", closeMenu));
    document.addEventListener("click", (event) => {
      if (
        tabs.classList.contains("open") &&
        !tabs.contains(event.target) &&
        !burger.contains(event.target)
      )
        closeMenu();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && tabs.classList.contains("open")) {
        closeMenu();
        burger.focus();
      }
    });
  }

  // Общий эффект для основных кнопок на всех страницах, включая 404.
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (!prefersReducedMotion && window.matchMedia("(hover: hover)").matches) {
    document.querySelectorAll(".btn").forEach((button) => {
      const strength = 16;
      button.addEventListener("mousemove", (event) => {
        const rect = button.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width - 0.5) * strength;
        const y = ((event.clientY - rect.top) / rect.height - 0.5) * strength;
        button.style.transform = `translate(${x}px, ${y}px)`;
      });
      button.addEventListener("mouseleave", () => {
        button.style.transform = "";
      });
    });
  }
})();
