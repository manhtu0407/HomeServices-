// A small in-memory PostgREST stand-in for flows that read and write several tables in an order the
// test should not have to script. It honours the filters and modifiers the Edge code actually uses.

type Row = Record<string, unknown>

export type MemoryDb = {
  tables: Record<string, Row[]>
  client: {
    from(table: string): unknown
    rpc(name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: null }>
  }
}

export function memoryDb(seed: Record<string, Row[]> = {}): MemoryDb {
  const tables: Record<string, Row[]> = Object.fromEntries(
    Object.entries(seed).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]),
  )
  let nextId = 1

  function from(table: string) {
    const filters: Array<(row: Row) => boolean> = []
    let mode: 'select' | 'insert' | 'update' = 'select'
    let payload: Row | Row[] | null = null
    let orderBy: { column: string; ascending: boolean } | null = null
    let limit: number | null = null
    let single: 'single' | 'maybe' | null = null
    const query = {
      select: () => query,
      insert(value: Row | Row[]) {
        mode = 'insert'
        payload = value
        return query
      },
      update(value: Row) {
        mode = 'update'
        payload = value
        return query
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value)
        return query
      },
      gt(column: string, value: unknown) {
        filters.push((row) => String(row[column]) > String(value))
        return query
      },
      in(column: string, values: unknown[]) {
        filters.push((row) => values.includes(row[column]))
        return query
      },
      order(column: string, options?: { ascending?: boolean }) {
        orderBy = { column, ascending: options?.ascending !== false }
        return query
      },
      limit(count: number) {
        limit = count
        return query
      },
      single() {
        single = 'single'
        return query
      },
      maybeSingle() {
        single = 'maybe'
        return query
      },
      then(resolve?: ((value: unknown) => unknown) | null, reject?: ((reason: unknown) => unknown) | null) {
        return Promise.resolve(run()).then(resolve ?? undefined, reject ?? undefined)
      },
    }

    function run() {
      const rows = (tables[table] ??= [])
      if (mode === 'insert') {
        const inserted = (Array.isArray(payload) ? payload : [payload as Row]).map((row) => ({
          id: `${table}-${nextId++}`,
          created_at: new Date().toISOString(),
          ...row,
        }))
        rows.push(...inserted)
        return { data: single ? inserted[0] : inserted, error: null }
      }
      let matched = rows.filter((row) => filters.every((keep) => keep(row)))
      if (mode === 'update') {
        for (const row of matched) Object.assign(row, payload)
      }
      if (orderBy) {
        const { column, ascending } = orderBy
        matched = [...matched].sort((a, b) => {
          const left = a[column] as number | string
          const right = b[column] as number | string
          return (left < right ? -1 : left > right ? 1 : 0) * (ascending ? 1 : -1)
        })
      }
      if (limit !== null) matched = matched.slice(0, limit)
      if (single) {
        if (matched.length === 0) {
          return single === 'single'
            ? { data: null, error: { code: 'PGRST116', message: 'no rows' } }
            : { data: null, error: null }
        }
        return { data: matched[0], error: null }
      }
      return { data: matched, error: null }
    }

    return query
  }

  return {
    tables,
    client: {
      from,
      // The AI-spend gate reserves through RPCs; approve them so provider stubs decide the outcome.
      rpc: async () => ({ data: [{ allowed: true, blocked_scope: null, reservation_id: 1 }], error: null }),
    },
  }
}
