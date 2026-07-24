import { component, html } from "@taipa/ui";
import { mount } from "@taipa/ui/client";
import { buildData, updateEveryTenth } from "../data";
import { replaceRows } from "../dom";
import type { BenchmarkApp, RowData } from "../types";

const TaipaBenchmark = component("TaipaBenchmark", { contractVersion: "1" })
  .state("rows", [] as RowData[])
  .state("selectedId", 0)
  .bind("tbody", ({ element, state }) => {
    replaceRows(element as HTMLTableSectionElement, state.rows(), state.selectedId());
  })
  .on("run@click", ({ state }) => {
    state.rows(buildData());
    state.selectedId(0);
  })
  .on("runlots@click", ({ state }) => {
    state.rows(buildData(10000));
    state.selectedId(0);
  })
  .on("add@click", ({ state }) => {
    state.rows(state.rows().concat(buildData()));
  })
  .on("update@click", ({ state }) => {
    state.rows(updateEveryTenth(state.rows()));
  })
  .on("clear@click", ({ state }) => {
    state.rows([]);
    state.selectedId(0);
  })
  .on("swaprows@click", ({ state }) => {
    const rows = state.rows();
    if (rows.length > 998) {
      const nextRows = rows.slice();
      const row = nextRows[1];
      nextRows[1] = nextRows[998];
      nextRows[998] = row;
      state.rows(nextRows);
    }
  })
  .connected(({ host, state }) => {
    const tbody = host.querySelector("tbody");
    if (tbody === null) return;
    const controller = new AbortController();
    tbody.addEventListener(
      "click",
      (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const row = target?.closest<HTMLTableRowElement>("tr[data-id]");
        if (row !== null && row !== undefined) {
          state.selectedId(Number(row.dataset.id));
        }
      },
      { signal: controller.signal },
    );
    return () => controller.abort();
  })
  .render(
    () => html`
      <div class="container">
        <div class="jumbotron">
          <div class="row">
            <div class="col-md-6"><h1>Taipa UI keyed</h1></div>
            <div class="col-md-6">
              <div class="row">
                <div class="col-sm-6 smallpad">
                  <button
                    type="button"
                    class="btn btn-primary btn-block"
                    id="run"
                    data-taipa-ref="run"
                  >
                    Create 1,000 rows
                  </button>
                </div>
                <div class="col-sm-6 smallpad">
                  <button
                    type="button"
                    class="btn btn-primary btn-block"
                    id="runlots"
                    data-taipa-ref="runlots"
                  >
                    Create 10,000 rows
                  </button>
                </div>
                <div class="col-sm-6 smallpad">
                  <button
                    type="button"
                    class="btn btn-primary btn-block"
                    id="add"
                    data-taipa-ref="add"
                  >
                    Append 1,000 rows
                  </button>
                </div>
                <div class="col-sm-6 smallpad">
                  <button
                    type="button"
                    class="btn btn-primary btn-block"
                    id="update"
                    data-taipa-ref="update"
                  >
                    Update every 10th row
                  </button>
                </div>
                <div class="col-sm-6 smallpad">
                  <button
                    type="button"
                    class="btn btn-primary btn-block"
                    id="clear"
                    data-taipa-ref="clear"
                  >
                    Clear
                  </button>
                </div>
                <div class="col-sm-6 smallpad">
                  <button
                    type="button"
                    class="btn btn-primary btn-block"
                    id="swaprows"
                    data-taipa-ref="swaprows"
                  >
                    Swap Rows
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <table class="table table-hover table-striped test-data">
          <tbody id="tbody" data-taipa-ref="tbody"></tbody>
        </table>
        <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true"></span>
      </div>
    `,
  );

const app: BenchmarkApp = {
  name: "taipa",
  async mount(root) {
    await mount(root, TaipaBenchmark, { replace: true });
  },
};

export default app;
