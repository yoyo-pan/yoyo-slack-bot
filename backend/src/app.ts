import express from 'express'
import dotenv from 'dotenv'
import { SlackService } from './services/slack'
import { OpenAIService } from './services/openai'

dotenv.config()

const expressApp = express()
const port = parseInt(process.env.PORT || '3000', 10)

// Initialize services
const openAIService = new OpenAIService(process.env.OPENAI_API_KEY!)
const slackService = new SlackService(
  process.env.SLACK_BOT_TOKEN!,
  process.env.SLACK_SIGNING_SECRET!,
  process.env.SLACK_APP_TOKEN!,
  openAIService
)

// Start the Slack app
slackService.start(port).then(() => {
  console.log(`⚡️ Bolt app is running on port ${port}`)
})

// Start the Express server
expressApp.listen(port, () => {
  console.log(`Express server is running on port ${port}`)
})
