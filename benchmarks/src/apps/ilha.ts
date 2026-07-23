import ilha, { html } from "ilha";
import { buildData, updateEveryTenth } from "../data.ts";
import type { BenchmarkApp, RowData } from "../types.ts";

const IlhaBenchmark = ilha
  .state("rows", [] as RowData[])
  .state("selectedId", 0)
  .on("#run@click", ({ state }) => {
    state.rows(buildData());
    state.selectedId(0);
  })
  .on("#runlots@click", ({ state }) => {
    state.rows(buildData(10000));
    state.selectedId(0);
  })
  .on("#add@click", ({ state }) => {
    state.rows(state.rows().concat(buildData()));
  })
  .on("#update@click", ({ state }) => {
    state.rows(updateEveryTenth(state.rows()));
  })
  .on("#clear@click", ({ state }) => {
    state.rows([]);
    state.selectedId(0);
  })
  .on("#swaprows@click", ({ state }) => {
    const rows = state.rows();
    if (rows.length > 998) {
      const nextRows = rows.slice();
      const row = nextRows[1];
      nextRows[1] = nextRows[998];
      nextRows[998] = row;
      state.rows(nextRows);
    }
  })
  .render(
    ({ state }) => html`
      <div class="container">
        <div class="jumbotron">
          <div class="row">
            <div class="col-md-6"><h1>Ilha keyed</h1></div>
            <div class="col-md-6">
              <div class="row">
                <div class="col-sm-6 smallpad">
                  <button type="button" class="btn btn-primary btn-block" id="run">
                    Create 1,000 rows
                  </button>
                </div>
                <div class="col-sm-6 smallpad">
                  <button type="button" class="btn btn-primary btn-block" id="runlots">
                    Create 10,000 rows
                  </button>
                </div>
                <div class="col-sm-6 smallpad">
                  <button type="button" class="btn btn-primary btn-block" id="add">
                    Append 1,000 rows
                  </button>
                </div>
                <div class="col-sm-6 smallpad">
                  <button type="button" class="btn btn-primary btn-block" id="update">
                    Update every 10th row
                  </button>
                </div>
                <div class="col-sm-6 smallpad">
                  <button type="button" class="btn btn-primary btn-block" id="clear">Clear</button>
                </div>
                <div class="col-sm-6 smallpad">
                  <button type="button" class="btn btn-primary btn-block" id="swaprows">
                    Swap Rows
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <table class="table table-hover table-striped test-data">
          <tbody id="tbody">
            ${state.rows().map(
              (row) => html`
                <tr data-id=${row.id} class=${row.id === state.selectedId() ? "danger" : ""}>
                  <td class="col-md-1">${row.id}</td>
                  <td class="col-md-4"><a>${row.label}</a></td>
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
    `,
  );

const app: BenchmarkApp = {
  name: "ilha",
  mount(root) {
    IlhaBenchmark.mount(root);
  },
};

export default app;
