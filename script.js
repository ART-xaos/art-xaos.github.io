  // мобильное меню
  const burger = document.getElementById('burger');
  const tabs = document.getElementById('tabs');
  burger.addEventListener('click', () => tabs.classList.toggle('open'));
  tabs.querySelectorAll('a').forEach(a => a.addEventListener('click', () => tabs.classList.remove('open')));

  // папки со студийными фото
  const folderBtns = document.querySelectorAll('.folder-btn');
  folderBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      folderBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.folder-grid').forEach(g => g.classList.remove('active'));
      btn.classList.add('active');
      document.querySelector(`.folder-grid[data-folder-panel="${btn.dataset.folder}"]`).classList.add('active');
    });
  });

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
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
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
