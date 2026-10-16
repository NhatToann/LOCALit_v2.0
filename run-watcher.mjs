#!/usr/bin/env node
import { spawn } from 'node:child_process'
const child = spawn('node', ['scripts/watch-localit.mjs'], {
  stdio: 'inherit',
  env: { ...process.env, VERCEL_BYPASS: 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A' },
})
child.on('exit', (code) => process.exit(code ?? 1))
