import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { loopbackQaDockerArgs } from './local-qa-network.mjs'

const instance = process.env.NESTSCOUT_LOCAL_QA_INSTANCE
const portBase = Number(process.env.NESTSCOUT_LOCAL_QA_PORT_BASE)
if (!instance) throw new Error('QA loopback adapter requires an explicit instance')
loopbackQaDockerArgs(instance, portBase, 'node', [])

const originalSpawn = childProcess.spawn
childProcess.spawn = function (command, args, options) {
  return originalSpawn.call(this, command, Array.isArray(args) ? loopbackQaDockerArgs(instance, portBase, command, args) : args, options)
}
syncBuiltinESMExports()

const bun = globalThis.Bun
if (bun) {
  for (const method of ['spawn', 'spawnSync']) {
    const original = bun[method]
    bun[method] = function (command, options) {
      if (Array.isArray(command)) {
        return original.call(this, [command[0], ...loopbackQaDockerArgs(instance, portBase, command[0], command.slice(1))], options)
      }
      const cmd = command.cmd
      return original.call(this, { ...command, cmd: [cmd[0], ...loopbackQaDockerArgs(instance, portBase, cmd[0], cmd.slice(1))] })
    }
  }
}
