import { html, render } from "lit-html";
import { repeat } from "lit-html/directives/repeat.js";
import { buildData, updateEveryTenth } from "../data";
import type { BenchmarkApp, RowData } from "../types";

const app: BenchmarkApp = {
  name: "lit-html",
  mount(root) {
    let rows: RowData[] = [];
    let selectedId = 0;

    const run = () => {
      rows = buildData();
      selectedId = 0;
      redraw();
    };
    const runLots = () => {
      rows = buildData(10000);
      selectedId = 0;
      redraw();
    };
    const add = () => {
      rows = rows.concat(buildData());
      redraw();
    };
    const update = () => {
      rows = updateEveryTenth(rows);
      redraw();
    };
    const clear = () => {
      rows = [];
      selectedId = 0;
      redraw();
    };
    const swapRows = () => {
      if (rows.length > 998) {
        rows = rows.slice();
        const row = rows[1];
        rows[1] = rows[998];
        rows[998] = row;
        redraw();
      }
    };
    const select = (id: number) => {
      selectedId = id;
      redraw();
    };

    const redraw = () => render(view(), root);
    const button = (id: string, label: string, onClick: () => void) => html`
      <div class="col-sm-6 smallpad">
        <button type="button" class="btn btn-primary btn-block" id=${id} @click=${onClick}>
          ${label}
        </button>
      </div>
    `;
    const view = () => html`
      <div class="container">
        <div class="jumbotron">
          <div class="row">
            <div class="col-md-6"><h1>Lit HTML keyed</h1></div>
            <div class="col-md-6">
              <div class="row">
                ${button("run", "Create 1,000 rows", run)}
                ${button("runlots", "Create 10,000 rows", runLots)}
                ${button("add", "Append 1,000 rows", add)}
                ${button("update", "Update every 10th row", update)}
                ${button("clear", "Clear", clear)} ${button("swaprows", "Swap Rows", swapRows)}
              </div>
            </div>
          </div>
        </div>
        <table class="table table-hover table-striped test-data">
          <tbody id="tbody">
            ${repeat(
              rows,
              (row) => row.id,
              (row) => html`
                <tr class=${row.id === selectedId ? "danger" : ""} data-id=${row.id}>
                  <td class="col-md-1">${row.id}</td>
                  <td class="col-md-4"><a @click=${() => select(row.id)}>${row.label}</a></td>
                  <td class="col-md-1">
                    <a><span class="glyphicon glyphicon-remove" aria-hidden="true"></span></a>
                  </td>
                  <td class="col-md-6"></td>
                </tr>
              `,
            )}
          </tbody>
        </table>
        <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true"></span>
      </div>
    `;

    redraw();
  },
};

export default app;
