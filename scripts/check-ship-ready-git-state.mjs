export function allowMainInCi(args, env) {
  return args.includes('--allow-main-in-ci')
    && env.CI === 'true'
    && env.GITHUB_REF === 'refs/heads/main'
}

export function inspectGitState({ branch, status, allowMain = false }) {
  const problems = []

  if (branch === null || status === null) {
    problems.push(['git is not answering here — run this inside the repository', []])
    return { branch: branch ?? 'unknown', problems }
  }

  if (branch === 'main' && !allowMain) {
    problems.push(['on main — branch before you push', []])
  }

  const groups = { staged: [], unstaged: [], untracked: [] }
  for (const line of status.split(/\r?\n/).filter(Boolean)) {
    const code = line.slice(0, 2)
    const path = line.slice(3)
    if (code === '??') groups.untracked.push(path)
    else {
      if (code[0] !== ' ') groups.staged.push(path)
      if (code[1] !== ' ') groups.unstaged.push(path)
    }
  }

  const dirty = groups.staged.length + groups.unstaged.length + groups.untracked.length
  if (dirty) {
    const detail = []
    for (const [label, paths] of Object.entries(groups)) {
      for (const path of paths) detail.push(`${label.padEnd(10)} ${path}`)
    }
    problems.push([`${dirty} path(s) not committed — a push carries only what is committed`, detail])
  }

  return { branch, problems }
}
