  // мобильное меню
  const burger = document.getElementById('burger');
  const tabs = document.getElementById('tabs');
  function closeMenu() {
    tabs.classList.remove('open');
    burger.setAttribute('aria-expanded', 'false');
  }
  function openMenu() {
    tabs.classList.add('open');
    burger.setAttribute('aria-expanded', 'true');
  }
  burger.addEventListener('click', () => {
    tabs.classList.contains('open') ? closeMenu() : openMenu();
  });
  tabs.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
  document.addEventListener('click', (e) => {
    if (tabs.classList.contains('open') && !tabs.contains(e.target) && e.target !== burger && !burger.contains(e.target)) {
      closeMenu();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && tabs.classList.contains('open')) {
      closeMenu();
      burger.focus();
    }
  });

  // папки со студийными фото
  const folderBtns = document.querySelectorAll('.folder-btn');
  const folderOrder = Array.from(folderBtns).map(b => b.dataset.folder);
  const folderDots = document.querySelectorAll('.folder-dot');

  function selectFolder(name) {
    folderBtns.forEach(b => {
      const isActive = b.dataset.folder === name;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', String(isActive));
      b.tabIndex = isActive ? 0 : -1;
    });
    document.querySelectorAll('.folder-grid').forEach(g => g.classList.remove('active'));
    document.querySelector(`.folder-grid[data-folder-panel="${name}"]`).classList.add('active');
    folderDots.forEach(d => d.classList.toggle('active', d.dataset.folderDot === name));
  }

  folderBtns.forEach(btn => {
    btn.addEventListener('click', () => selectFolder(btn.dataset.folder));
  });
  // навигация между табами стрелками (стандартный паттерн ARIA tablist)
  const folderNav = document.querySelector('.folder-nav');
  if (folderNav) {
    folderNav.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const list = Array.from(folderBtns);
      const i = list.indexOf(document.activeElement);
      if (i === -1) return;
      e.preventDefault();
      const next = e.key === 'ArrowRight' ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
      list[next].focus();
      list[next].click();
    });
  }

  // свайп между папками на тачскрине
  const folderPanel = document.querySelector('.folder-panel');
  if (folderPanel) {
    let touchStartX = 0, touchStartY = 0;
    folderPanel.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].clientX;
      touchStartY = e.changedTouches[0].clientY;
    }, { passive: true });
    folderPanel.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
      const current = folderOrder.indexOf(document.querySelector('.folder-btn.active').dataset.folder);
      const next = dx < 0
        ? (current + 1) % folderOrder.length
        : (current - 1 + folderOrder.length) % folderOrder.length;
      selectFolder(folderOrder[next]);
    }, { passive: true });
  }

  // появление секций при скролле + подпись-росчерк в hero
  const toReveal = document.querySelectorAll('.reveal, .reveal-group, .hero-signature .sig-draw');
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  toReveal.forEach(el => io.observe(el));

  // подпись в hero дорисовывается сразу после загрузки
  window.addEventListener('load', () => {
    document.querySelector('.hero-signature .sig-draw')?.classList.add('in-view');
  });

  // фон меняет цвет вслед за текущим разделом
  const washEl = document.querySelector('.bg-wash');
  const accentColors = { blue: '#2E4374', red: '#B4432A', green: '#52633B' };
  const accentSections = document.querySelectorAll('section[data-accent]');
  const colorObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const accent = entry.target.dataset.accent;
        if (washEl && accentColors[accent]) washEl.style.color = accentColors[accent];
      }
    });
  }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
  accentSections.forEach(s => colorObserver.observe(s));

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // магнитные кнопки
  if (!prefersReducedMotion && matchMedia('(hover: hover)').matches) {
    document.querySelectorAll('.btn').forEach(btn => {
      const strength = 16;
      btn.addEventListener('mousemove', (e) => {
        const r = btn.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width - 0.5) * strength;
        const y = ((e.clientY - r.top) / r.height - 0.5) * strength;
        btn.style.transform = `translate(${x}px, ${y}px)`;
      });
      btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
    });
  }

  // счётчики-цифры при попадании в область просмотра
  function animateCount(el) {
    const target = parseInt(el.dataset.target, 10);
    if (prefersReducedMotion) { el.textContent = target; return; }
    const duration = 1300;
    const start = performance.now();
    function step(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(eased * target);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  const countObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCount(entry.target);
        countObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.6 });
  document.querySelectorAll('.count').forEach(c => countObserver.observe(c));

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
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    const href = link.getAttribute('href');
    if (!href || href.length < 2) return;
    const target = document.querySelector(href);
    if (!target) return;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetY = target.getBoundingClientRect().top + window.scrollY - headerOffset;
      if (prefersReducedMotion) {
        window.scrollTo(0, targetY);
      } else {
        smoothScrollTo(targetY, 1500);
      }
      history.pushState(null, '', href);
      tabs.classList.remove('open');
    });
  });

  // отправка заявки на почту через Formspree
  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    const statusEl = document.getElementById('form-status');
    const submitBtn = document.getElementById('form-submit-btn');
    const nameInput = document.getElementById('f-name');
    const phoneInput = document.getElementById('f-phone');
    const errName = document.getElementById('err-name');
    const errPhone = document.getElementById('err-phone');

    function showError(input, errEl, message) {
      input.classList.add('invalid');
      input.setAttribute('aria-invalid', 'true');
      errEl.textContent = message;
      errEl.classList.add('visible');
    }
    function clearError(input, errEl) {
      input.classList.remove('invalid');
      input.setAttribute('aria-invalid', 'false');
      errEl.textContent = '';
      errEl.classList.remove('visible');
    }

    function validateName() {
      const value = nameInput.value.trim();
      if (value.length < 2) {
        showError(nameInput, errName, 'Укажите, пожалуйста, имя (минимум 2 символа)');
        return false;
      }
      clearError(nameInput, errName);
      return true;
    }

    function validateContact() {
      const value = phoneInput.value.trim();
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
      const digitsOnly = value.replace(/[^\d]/g, '');
      const looksLikePhone = digitsOnly.length >= 10 && digitsOnly.length <= 11;
      const looksLikeEmail = emailRe.test(value);
      if (!value) {
        showError(phoneInput, errPhone, 'Укажите телефон или почту для связи');
        return false;
      }
      if (!looksLikePhone && !looksLikeEmail) {
        showError(phoneInput, errPhone, 'Похоже на опечатку — проверьте номер или почту');
        return false;
      }
      clearError(phoneInput, errPhone);
      return true;
    }

    nameInput.addEventListener('blur', validateName);
    nameInput.addEventListener('input', () => { if (nameInput.classList.contains('invalid')) validateName(); });
    phoneInput.addEventListener('blur', validateContact);
    phoneInput.addEventListener('input', () => { if (phoneInput.classList.contains('invalid')) validateContact(); });

    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameOk = validateName();
      const contactOk = validateContact();
      if (!nameOk || !contactOk) {
        (nameOk ? phoneInput : nameInput).focus();
        statusEl.textContent = 'Проверьте, пожалуйста, поля формы — они выделены ниже';
        statusEl.className = 'form-status form-status--error';
        return;
      }
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Отправляю…';
      statusEl.textContent = '';
      statusEl.className = 'form-status';
      try {
        const response = await fetch(contactForm.action, {
          method: 'POST',
          body: new FormData(contactForm),
          headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error('bad response');
        statusEl.textContent = 'Спасибо! Заявка отправлена, скоро свяжусь с вами.';
        statusEl.classList.add('form-status--ok');
        contactForm.reset();
      } catch (err) {
        statusEl.innerHTML = 'Не получилось отправить автоматически. Напишите, пожалуйста, напрямую: <a href="mailto:art.xaos.studio@gmail.com">art.xaos.studio@gmail.com</a>';
        statusEl.classList.add('form-status--error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
  }

  // полоска прогресса прокрутки + кнопка «наверх»
  const progressBar = document.getElementById('scroll-progress-bar');
  const toTopBtn = document.getElementById('to-top');
  function updateScrollUi() {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    if (progressBar) progressBar.style.width = progress + '%';
    if (toTopBtn) toTopBtn.classList.toggle('visible', scrollTop > 500);
  }
  window.addEventListener('scroll', updateScrollUi, { passive: true });
  updateScrollUi();

  if (toTopBtn) {
    toTopBtn.addEventListener('click', () => {
      if (prefersReducedMotion) {
        window.scrollTo(0, 0);
      } else {
        smoothScrollTo(0, 1200);
      }
    });
  }
