(() => {
  const strokeSettings = [
    { id: 'm1', delay: '.1s', duration: '.35s' },
    { id: 'm2', delay: '.4s', duration: '.25s' },
    { id: 'm3', delay: '.6s', duration: '.45s' },
    { id: 'm4', delay: '1s', duration: '.35s' },
    { id: 'm5', delay: '1.3s', duration: '.25s' }
  ];

  function startDrawing() {
    strokeSettings.forEach(({ id, delay, duration }) => {
      const stroke = document.getElementById(id);
      if (!stroke) return;
      stroke.style.setProperty('--delay', delay);
      stroke.style.setProperty('--duration', duration);
      stroke.classList.add('draw-active');
    });
  }

  if (document.readyState === 'complete') {
    startDrawing();
  } else {
    window.addEventListener('load', startDrawing, { once: true });
  }
})();
