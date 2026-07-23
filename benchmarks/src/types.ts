export interface RowData {
  readonly id: number;
  readonly label: string;
}

export interface BenchmarkApp {
  readonly name: string;
  mount(root: HTMLElement): void | Promise<void>;
}
