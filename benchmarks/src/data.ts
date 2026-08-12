import type { RowData } from "./types";

const adjectives = [
  "pretty",
  "large",
  "big",
  "small",
  "tall",
  "short",
  "long",
  "handsome",
  "plain",
  "quaint",
  "clean",
  "elegant",
  "easy",
  "angry",
  "crazy",
  "helpful",
  "mushy",
  "odd",
  "unsightly",
  "adorable",
  "important",
  "inexpensive",
  "cheap",
  "expensive",
  "fancy",
];
const colours = [
  "red",
  "yellow",
  "blue",
  "green",
  "pink",
  "brown",
  "purple",
  "brown",
  "white",
  "black",
  "orange",
];
const nouns = [
  "table",
  "chair",
  "house",
  "bbq",
  "desk",
  "car",
  "pony",
  "cookie",
  "sandwich",
  "burger",
  "pizza",
  "mouse",
  "keyboard",
];

let nextId = 1;

export function buildData(count = 1000): RowData[] {
  const data = Array.from<RowData>({ length: count });
  for (let i = 0; i < count; i += 1) {
    data[i] = {
      id: nextId,
      label: `${adjectives[random(adjectives.length)]} ${colours[random(colours.length)]} ${nouns[random(nouns.length)]}`,
    };
    nextId += 1;
  }
  (
    globalThis as typeof globalThis & { __taipaBenchmarkLatestRows?: readonly RowData[] }
  ).__taipaBenchmarkLatestRows = data;
  return data;
}

export function updateEveryTenth(data: readonly RowData[]): RowData[] {
  return data.map((row, index) =>
    index % 10 === 0 ? { id: row.id, label: `${row.label} !!!` } : row,
  );
}

function random(max: number): number {
  return Math.round(Math.random() * 1000) % max;
}
