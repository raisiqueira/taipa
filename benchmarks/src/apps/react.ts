import React, { memo, useReducer } from "react";
import { createRoot } from "react-dom/client";
import { buildData, updateEveryTenth } from "../data";
import type { BenchmarkApp, RowData } from "../types";

interface State {
  readonly rows: readonly RowData[];
  readonly selectedId: number;
}

type Action =
  | { readonly type: "run" }
  | { readonly type: "runLots" }
  | { readonly type: "add" }
  | { readonly type: "update" }
  | { readonly type: "clear" }
  | { readonly type: "swapRows" }
  | { readonly type: "select"; readonly id: number };

const Row = memo(function Row({
  row,
  selected,
  dispatch,
}: {
  readonly row: RowData;
  readonly selected: boolean;
  readonly dispatch: React.Dispatch<Action>;
}) {
  return React.createElement(
    "tr",
    { className: selected ? "danger" : "", "data-id": row.id },
    React.createElement("td", { className: "col-md-1" }, row.id),
    React.createElement(
      "td",
      { className: "col-md-4" },
      React.createElement(
        "a",
        { onClick: () => dispatch({ type: "select", id: row.id }) },
        row.label,
      ),
    ),
    React.createElement(
      "td",
      { className: "col-md-1" },
      React.createElement(
        "a",
        null,
        React.createElement("span", {
          className: "glyphicon glyphicon-remove",
          "aria-hidden": "true",
        }),
      ),
    ),
    React.createElement("td", { className: "col-md-6" }),
  );
});

const Button = ({
  id,
  title,
  dispatch,
  type,
}: {
  readonly id: string;
  readonly title: string;
  readonly dispatch: React.Dispatch<Action>;
  readonly type: Action["type"];
}) =>
  React.createElement(
    "div",
    { className: "col-sm-6 smallpad" },
    React.createElement(
      "button",
      {
        type: "button",
        className: "btn btn-primary btn-block",
        id,
        onClick: () => dispatch({ type } as Action),
      },
      title,
    ),
  );

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "run":
      return { rows: buildData(), selectedId: 0 };
    case "runLots":
      return { rows: buildData(10000), selectedId: 0 };
    case "add":
      return { rows: state.rows.concat(buildData()), selectedId: state.selectedId };
    case "update":
      return { rows: updateEveryTenth(state.rows), selectedId: state.selectedId };
    case "clear":
      return { rows: [], selectedId: 0 };
    case "swapRows": {
      if (state.rows.length <= 998) return state;
      const rows = state.rows.slice();
      const row = rows[1];
      rows[1] = rows[998];
      rows[998] = row;
      return { rows, selectedId: state.selectedId };
    }
    case "select":
      return { rows: state.rows, selectedId: action.id };
  }
}

function Main() {
  const [state, dispatch] = useReducer(reducer, { rows: [], selectedId: 0 });
  return React.createElement(
    "div",
    { className: "container" },
    React.createElement(
      "div",
      { className: "jumbotron" },
      React.createElement(
        "div",
        { className: "row" },
        React.createElement(
          "div",
          { className: "col-md-6" },
          React.createElement("h1", null, "React keyed"),
        ),
        React.createElement(
          "div",
          { className: "col-md-6" },
          React.createElement(
            "div",
            { className: "row" },
            React.createElement(Button, {
              id: "run",
              title: "Create 1,000 rows",
              dispatch,
              type: "run",
            }),
            React.createElement(Button, {
              id: "runlots",
              title: "Create 10,000 rows",
              dispatch,
              type: "runLots",
            }),
            React.createElement(Button, {
              id: "add",
              title: "Append 1,000 rows",
              dispatch,
              type: "add",
            }),
            React.createElement(Button, {
              id: "update",
              title: "Update every 10th row",
              dispatch,
              type: "update",
            }),
            React.createElement(Button, { id: "clear", title: "Clear", dispatch, type: "clear" }),
            React.createElement(Button, {
              id: "swaprows",
              title: "Swap Rows",
              dispatch,
              type: "swapRows",
            }),
          ),
        ),
      ),
    ),
    React.createElement(
      "table",
      { className: "table table-hover table-striped test-data" },
      React.createElement(
        "tbody",
        { id: "tbody" },
        state.rows.map((row) =>
          React.createElement(Row, {
            key: row.id,
            row,
            selected: row.id === state.selectedId,
            dispatch,
          }),
        ),
      ),
    ),
    React.createElement("span", {
      className: "preloadicon glyphicon glyphicon-remove",
      "aria-hidden": "true",
    }),
  );
}

const app: BenchmarkApp = {
  name: "react",
  mount(root) {
    createRoot(root).render(React.createElement(Main));
  },
};

export default app;
