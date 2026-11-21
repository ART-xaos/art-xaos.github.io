(() => {
  // Раскладка галереи работ «пинтрестом».
  // CSS-колонки заполняются сверху вниз, поэтому счёт «01, 02…» читался не слева
  // направо. Здесь плитка с номером i встаёт в столбец i % N: первый ряд идёт
  // слева направо, каждый следующий — под своим столбцом, без выравнивания рядов.
  const galleries = document.querySelectorAll(".work-gallery");
  if (!galleries.length) return;

  const ROW = 2; // шаг полосы сетки, px — высота плитки округляется вверх до него
  const GAP = 18; // зазор между плитками по вертикали, совпадает с отступом колонок

  function columnCount(gallery) {
    const template = getComputedStyle(gallery).gridTemplateColumns;
    return template.split(" ").filter(Boolean).length || 1;
  }

  function layout(gallery) {
    const figures = Array.from(gallery.querySelectorAll(":scope > figure"));
    if (!figures.length) return;

    // ручную раскладку сбрасываем, иначе следующее измерение вернёт высоту
    // растянутой плитки, а не самой картинки с подписью
    figures.forEach((figure) => {
      figure.style.gridColumn = "";
      figure.style.gridRowStart = "";
      figure.style.gridRowEnd = "";
    });

    const columns = columnCount(gallery);
    const used = new Array(columns).fill(0); // занятая высота каждого столбца, px

    figures.forEach((figure, index) => {
      const column = index % columns;
      const height = Math.ceil(figure.getBoundingClientRect().height);
      const span = Math.ceil((height + GAP) / ROW);

      figure.style.gridColumn = String(column + 1);
      figure.style.gridRowStart = String(used[column] / ROW + 1);
      figure.style.gridRowEnd = `span ${span}`;
      used[column] += span * ROW;
    });
  }

  function layoutAll() {
    galleries.forEach((gallery) => {
      gallery.classList.add("is-masonry");
      layout(gallery);
    });
  }

  layoutAll();

  // число столбцов меняется на брейкпоинтах, высота подписей — после подгрузки
  // шрифтов, поэтому раскладку пересчитываем
  let frame = null;
  window.addEventListener("resize", () => {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(layoutAll);
  });
  window.addEventListener("load", layoutAll);
  if (document.fonts) document.fonts.ready.then(layoutAll);
})();
