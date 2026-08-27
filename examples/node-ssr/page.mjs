const styles = `
  :root {
    color-scheme: light;
    --ink: #142029;
    --paper: #eef1ec;
    --panel: #f8faf6;
    --line: #142029;
    --mark: #0b4f8a;
    --ok: #0d5c3d;
    --warn: #8a3d12;
    font-family: "Iowan Old Style", "Palatino Linotype", Palatino, "Times New Roman", serif;
    line-height: 1.5;
    color: var(--ink);
    background: var(--paper);
  }
  * { box-sizing: border-box; }
  body { margin: 0; }
  a { color: var(--mark); }
  a:focus-visible, button:focus-visible, input:focus-visible {
    outline: 2px solid var(--mark);
    outline-offset: 2px;
  }
  .frame { margin: 0 auto; max-width: 42rem; padding: 2.5rem 1.25rem 5rem; }
  header { margin-bottom: 2.25rem; }
  h1, h2, p { margin: 0; }
  h1 { font-size: 2rem; letter-spacing: -0.03em; line-height: 1.15; }
  h2 { font-size: 1.15rem; letter-spacing: -0.02em; }
  header p, .lede { margin-top: 0.65rem; max-width: 38rem; }
  nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem 1rem;
    margin-top: 1.15rem;
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-size: 0.92rem;
  }
  .stack { display: grid; gap: 2.75rem; }
  .island-block { display: grid; gap: 0.7rem; }
  .island-block p { max-width: 38rem; }
  .status {
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-size: 0.85rem;
    color: var(--warn);
  }
  .status[data-ready] { color: var(--ok); }
  .counter, .clock, .form { font-family: ui-sans-serif, system-ui, sans-serif; }
  .counter { align-items: center; display: flex; gap: 0.75rem; }
  .counter button, .form button {
    appearance: none;
    background: var(--ink);
    border: 0;
    color: var(--panel);
    cursor: pointer;
    font: inherit;
    min-height: 2.75rem;
    min-width: 2.75rem;
    padding: 0 0.9rem;
  }
  .counter output, .clock time {
    font-size: 1.5rem;
    font-variant-numeric: tabular-nums;
    min-width: 3ch;
    text-align: center;
  }
  .well {
    background: var(--panel);
    border: 1px solid var(--line);
    padding: 1rem;
  }
  .spacer { block-size: 110vh; }
  .form { display: grid; gap: 0.75rem; max-width: 22rem; }
  label { display: grid; gap: 0.3rem; }
  input {
    background: var(--panel);
    border: 1px solid var(--line);
    font: inherit;
    min-height: 2.75rem;
    padding: 0 0.7rem;
  }
  input[aria-invalid="true"] { border-color: var(--warn); }
  .field-error, .form-status { min-height: 1.25rem; }
  .field-error { color: var(--warn); }
  .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .log {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.82rem;
    margin: 0;
    white-space: pre-wrap;
  }
`;

export function page({ title, heading, lede, body, script = false }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>${styles}</style>
  </head>
  <body>
    <div class="frame">
      <header>
        <h1>${heading}</h1>
        <p class="lede">${lede}</p>
        <nav aria-label="Examples">
          <a href="/">Static HTML</a>
          <a href="/interactive">Load policy</a>
          <a href="/policies">All policies</a>
          <a href="/form">Progressive form</a>
        </nav>
      </header>
      ${body}
    </div>
    ${script ? `<script type="module" src="/assets/client.js"></script>` : ""}
  </body>
</html>`;
}
