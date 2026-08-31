(() => {
  const burger = document.getElementById('burger');
  const tabs = document.getElementById('tabs');
  if (burger && tabs) {
    const closeMenu = () => {
      tabs.classList.remove('open');
      burger.setAttribute('aria-expanded', 'false');
    };
    const openMenu = () => {
      tabs.classList.add('open');
      burger.setAttribute('aria-expanded', 'true');
    };

    burger.addEventListener('click', () => {
      tabs.classList.contains('open') ? closeMenu() : openMenu();
    });
    tabs.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
    document.addEventListener('click', event => {
      if (tabs.classList.contains('open') && !tabs.contains(event.target) && !burger.contains(event.target)) closeMenu();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && tabs.classList.contains('open')) {
        closeMenu();
        burger.focus();
      }
    });
  }

  // Общий эффект для основных кнопок на всех страницах, включая 404.
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!prefersReducedMotion && window.matchMedia('(hover: hover)').matches) {
    document.querySelectorAll('.btn').forEach(button => {
      const strength = 16;
      button.addEventListener('mousemove', event => {
        const rect = button.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width - .5) * strength;
        const y = ((event.clientY - rect.top) / rect.height - .5) * strength;
        button.style.transform = `translate(${x}px, ${y}px)`;
      });
      button.addEventListener('mouseleave', () => { button.style.transform = ''; });
    });
  }
})();
