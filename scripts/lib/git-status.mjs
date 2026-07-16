export function changedPathsFromPorcelainV1Z(output) {
  const records = String(output ?? '').split('\0')
  const paths = []

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (record.length < 4 || record[2] !== ' ') continue

    const status = record.slice(0, 2)
    const path = record.slice(3)
    if (path) paths.push(path.replace(/\\/g, '/'))

    if (status.includes('R') || status.includes('C')) index += 1
  }

  return paths
}
