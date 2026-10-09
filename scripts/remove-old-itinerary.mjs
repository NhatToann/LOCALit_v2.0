import { rm } from 'node:fs/promises'
await rm('app/itinerary/[id]', { recursive: true, force: true })
console.log('removed app/itinerary/[id]')
import('node:fs/promises').then(async ({ readdir }) => {
  const remaining = await readdir('app/itinerary', { withFileTypes: true })
  console.log('Remaining in app/itinerary:', remaining.map(d => d.name))
})
