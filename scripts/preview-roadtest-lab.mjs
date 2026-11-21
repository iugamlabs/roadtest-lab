import { preview } from 'vite'

// The Windows launcher owns this pipe. A launcher crash closes it as well.
process.stdin.once('end', () => process.exit(0))
process.stdin.resume()

try {
  await preview({
    logLevel: 'silent',
    preview: {
      host: '127.0.0.1',
      port: Number(process.argv[2]),
      strictPort: true,
      open: false,
    },
  })
  process.stdout.write('1')
} catch (error) {
  console.error(error)
  process.exitCode = 1
  process.stdin.pause()
}
