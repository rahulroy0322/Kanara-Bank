import express from 'express'

import { env } from './config/env'


const app = express()

app.get('/health', (_req, res) => {
  res.json({ success: true, data: 'OK' })
})

app.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT}.`)
})