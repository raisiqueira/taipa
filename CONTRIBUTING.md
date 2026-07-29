# Contributing to Taipa UI

Taipa UI is an alpha library. Small, focused changes with tests are easier to review and release safely.

## Development

Use the Node and pnpm versions declared by the repository, then install the workspace:

```sh
vp install --frozen-lockfile
```

Run the main JavaScript checks before opening a pull request:

```sh
pnpm ready
pnpm verify:package
pnpm verify:consumer
```

Browser tests belong to the UI package and must run from that directory:

```sh
pnpm --dir packages/ui exec vp test --silent=passed-only
```

## Documentation and benchmarks

The documentation site is an Astro workspace package:

```sh
pnpm --dir docs run check
pnpm --dir docs run dev
```

The benchmark harness is a local comparison tool. Run it on the same machine and browser build when comparing results:

```sh
pnpm --filter @taipa/benchmarks bench
```

## Change expectations

- Keep public package entrypoints ESM-only and side-effect free at import time.
- Add runtime tests for behavior changes and compile-only assertions for TypeScript contracts.
- Do not add framework-specific schema dependencies to the forms package.
- Do not include secrets, credentials, or private data in island props or serialized state.
- Update `CHANGELOG.md` for user-visible changes.

See [SECURITY.md](./SECURITY.md) for vulnerability reporting.
