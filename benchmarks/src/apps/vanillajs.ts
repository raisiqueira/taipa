import { buildData, updateEveryTenth } from "../data.ts";
import { benchmarkShell, replaceRows } from "../dom.ts";
import type { BenchmarkApp, RowData } from "../types.ts";

const app: BenchmarkApp = {
  name: "vanillajs",
  mount(root) {
    let rows: RowData[] = [];
    let selectedId = 0;
    root.innerHTML = benchmarkShell("VanillaJS keyed");

    const tbody = requireElement<HTMLTableSectionElement>(root, "#tbody");
    requireElement(root, "#run").addEventListener("click", () => {
      rows = buildData();
      selectedId = 0;
      replaceRows(tbody, rows, selectedId);
    });
    requireElement(root, "#runlots").addEventListener("click", () => {
      rows = buildData(10000);
      selectedId = 0;
      replaceRows(tbody, rows, selectedId);
    });
    requireElement(root, "#add").addEventListener("click", () => {
      rows = rows.concat(buildData());
      replaceRows(tbody, rows, selectedId);
    });
    requireElement(root, "#update").addEventListener("click", () => {
      rows = updateEveryTenth(rows);
      replaceRows(tbody, rows, selectedId);
    });
    requireElement(root, "#clear").addEventListener("click", () => {
      rows = [];
      selectedId = 0;
      replaceRows(tbody, rows, selectedId);
    });
    requireElement(root, "#swaprows").addEventListener("click", () => {
      if (rows.length > 998) {
        rows = rows.slice();
        const row = rows[1];
        rows[1] = rows[998];
        rows[998] = row;
        replaceRows(tbody, rows, selectedId);
      }
    });
    tbody.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const row = target?.closest<HTMLTableRowElement>("tr[data-id]");
      if (row === null || row === undefined) return;
      selectedId = Number(row.dataset.id);
      replaceRows(tbody, rows, selectedId);
    });
  },
};

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (element === null) throw new Error(`Missing benchmark element: ${selector}`);
  return element;
}

export default app;
