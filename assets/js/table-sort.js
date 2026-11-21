(() => {
  const table = document.querySelector(".proof-table");
  if (!table) return;

  const headers = [...table.querySelectorAll("thead th")];
  const rows = [...table.tBodies[0].rows];
  const yearIndex = headers.length - 1;

  function valueFor(row, column) {
    const value = row.cells[column]?.textContent.trim().replace(/\s+/g, " ") ?? "";
    if (column === yearIndex) {
      const years = value.match(/\b20\d{2}\b/g)?.map(Number) ?? [0];
      return Math.max(...years);
    }
    return value;
  }

  function sort(column, direction) {
    const sign = direction === "ascending" ? 1 : -1;
    rows.sort((a, b) => {
      const av = valueFor(a, column);
      const bv = valueFor(b, column);
      const comparison = typeof av === "number"
        ? av - bv
        : av.localeCompare(bv, "ru", { numeric: true, sensitivity: "base" });
      return sign * comparison;
    });
    rows.forEach((row) => table.tBodies[0].appendChild(row));

    headers.forEach((header, index) => {
      const button = header.querySelector("button[data-sort]");
      if (!button) return;
      const active = index === column;
      button.setAttribute("aria-pressed", String(active));
      if (active) {
        button.dataset.direction = direction;
        header.setAttribute("aria-sort", direction);
      } else {
        delete button.dataset.direction;
        header.removeAttribute("aria-sort");
      }
    });
  }

  table.querySelectorAll("button[data-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      const column = Number(button.dataset.sort);
      const current = button.dataset.direction;
      const direction = current === "ascending" ? "descending" : "ascending";
      sort(column, direction);
    });
  });

  sort(yearIndex, "descending");
})();
