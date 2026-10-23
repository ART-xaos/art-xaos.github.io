(() => {
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
