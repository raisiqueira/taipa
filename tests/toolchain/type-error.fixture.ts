// Toolchain smoke fixture driven by `pnpm smoke:toolchain`.
//
// The script temporarily introduces a type error, a lint violation, and a
// format violation in this file to prove `vp check` catches each class of
// failure, then restores this committed state. Keep the committed state
// clean: it must always pass `vp check`.
export function toolchainFixture(input: number): number {
  return input * 2;
}
