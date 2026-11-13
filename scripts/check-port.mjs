#!/usr/bin/env node
/**
 * Fail fast when the backend port is already taken.
 *
 * `npm run dev` uses `concurrently -k`, so when the backend dies with
 * EADDRINUSE the frontend is killed too and the terminal fills with a stack
 * trace. Checking first turns that into one actionable message.
 *
 * Exit codes: 0 = port is free, 1 = port is busy (or undeterminable).
 */
import net from 'node:net'

const PORT = Number(process.env.PORT) || 3001
const HOST = '127.0.0.1'
const TIMEOUT_MS = 1500

const socket = net.connect({ port: PORT, host: HOST })
socket.setTimeout(TIMEOUT_MS)

socket
  .on('connect', () => {
    socket.destroy()
    console.error(`\x1b[31m[dev] Port ${PORT} is already in use.\x1b[0m`)
    console.error('  A previous backend is still running — `tsx watch` spawns a child')
    console.error('  process that survives a crashed `npm run dev` on Windows.')
    console.error('')
    console.error('  Find and stop it:')
    console.error(`    netstat -ano | findstr :${PORT}`)
    console.error('    taskkill /PID <pid> /F')
    console.error('')
    console.error(`  Or use another port:  set PORT=3002 && npm run dev`)
    process.exit(1)
  })
  .on('timeout', () => {
    socket.destroy()
    console.error(`[dev] Port ${PORT} did not answer within ${TIMEOUT_MS}ms; continuing anyway.`)
    process.exit(0)
  })
  .on('error', (err) => {
    if (err.code === 'ECONNREFUSED') {
      process.exit(0) // nothing listening — good to go
    }
    console.error(`[dev] Could not probe port ${PORT}: ${err.message}`)
    process.exit(0) // never block dev on an inconclusive probe
  })
