import { createApp, h, shallowRef, ref } from "vue";
import { buildData, updateEveryTenth } from "../data";
import type { BenchmarkApp, RowData } from "../types";

const app: BenchmarkApp = {
  name: "vue",
  mount(root) {
    createApp({
      setup() {
        const rows = shallowRef<readonly RowData[]>([]);
        const selectedId = ref(0);
        const run = () => {
          rows.value = buildData();
          selectedId.value = 0;
        };
        const runLots = () => {
          rows.value = buildData(10000);
          selectedId.value = 0;
        };
        const add = () => {
          rows.value = rows.value.concat(buildData());
        };
        const update = () => {
          rows.value = updateEveryTenth(rows.value);
        };
        const clear = () => {
          rows.value = [];
          selectedId.value = 0;
        };
        const swapRows = () => {
          if (rows.value.length > 998) {
            const nextRows = rows.value.slice();
            const row = nextRows[1];
            nextRows[1] = nextRows[998];
            nextRows[998] = row;
            rows.value = nextRows;
          }
        };
        const button = (id: string, title: string, onClick: () => void) =>
          h(
            "div",
            { class: "col-sm-6 smallpad" },
            h("button", { type: "button", class: "btn btn-primary btn-block", id, onClick }, title),
          );
        return () =>
          h("div", { class: "container" }, [
            h("div", { class: "jumbotron" }, [
              h("div", { class: "row" }, [
                h("div", { class: "col-md-6" }, h("h1", "Vue 3 keyed")),
                h(
                  "div",
                  { class: "col-md-6" },
                  h("div", { class: "row" }, [
                    button("run", "Create 1,000 rows", run),
                    button("runlots", "Create 10,000 rows", runLots),
                    button("add", "Append 1,000 rows", add),
                    button("update", "Update every 10th row", update),
                    button("clear", "Clear", clear),
                    button("swaprows", "Swap Rows", swapRows),
                  ]),
                ),
              ]),
            ]),
            h(
              "table",
              { class: "table table-hover table-striped test-data" },
              h(
                "tbody",
                { id: "tbody" },
                rows.value.map((row) =>
                  h(
                    "tr",
                    {
                      key: row.id,
                      class: row.id === selectedId.value ? "danger" : "",
                      "data-id": row.id,
                    },
                    [
                      h("td", { class: "col-md-1" }, row.id),
                      h(
                        "td",
                        { class: "col-md-4" },
                        h("a", { onClick: () => (selectedId.value = row.id) }, row.label),
                      ),
                      h(
                        "td",
                        { class: "col-md-1" },
                        h(
                          "a",
                          h("span", { class: "glyphicon glyphicon-remove", "aria-hidden": "true" }),
                        ),
                      ),
                      h("td", { class: "col-md-6" }),
                    ],
                  ),
                ),
              ),
            ),
            h("span", { class: "preloadicon glyphicon glyphicon-remove", "aria-hidden": "true" }),
          ]);
      },
    }).mount(root);
  },
};

export default app;
