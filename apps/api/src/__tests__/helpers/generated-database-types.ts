import { join } from '../../../../../scripts/split-database-types.mjs'

// The generated Supabase artifact is stored split across packages/shared/src/types/database/**.
// Tests that assert on its source text read it through here so they see the same bytes the
// single file used to hold — including its original indentation, which the line-anchored
// parsers in tier1-type-completeness and kael-database-types-drift depend on.
//
// The join logic deliberately lives in exactly one place (scripts/split-database-types.mjs).
// Reimplementing it here would recreate the drift this split was built to prevent.
export const readGeneratedDatabaseTypes = (): string => join()
