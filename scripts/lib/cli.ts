export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

export function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

export function runMain(main: () => Promise<void>): void {
  void main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
