declare const Deno: {
  serve(handler: (request: Request) => Response | Promise<Response>): unknown
  readonly env: {
    get(name: string): string | undefined
  }
}
