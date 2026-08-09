declare const Deno: {
  readonly env: {
    get(name: string): string | undefined
  }
}
