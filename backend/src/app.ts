import { App } from '@slack/bolt'
import express from 'express'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// Initialize Express app
const expressApp = express()
const port = process.env.PORT || 3000

// Initialize Slack app
const slackApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
})

// Debug: Log all incoming events
slackApp.event('*', async ({ event, logger }) => {
  logger.info('Received event:', JSON.stringify(event, null, 2))
})

// Debug: Log all incoming messages
slackApp.message(async ({ message, logger }) => {
  logger.info('Received message:', JSON.stringify(message, null, 2))
})

// Listen for messages containing "hello"
slackApp.message('hello', async ({ message, say, logger }) => {
  logger.info('Hello message detected:', JSON.stringify(message, null, 2))
  try {
    await say({
      text: 'Hey from bot 👋',
    })
  } catch (error) {
    logger.error('Error sending message:', error)
  }
})

// Listen for direct mentions
slackApp.event('app_mention', async ({ event, say, logger }) => {
  logger.info('Bot mentioned:', JSON.stringify(event, null, 2))
  try {
    await say({
      text: 'You mentioned me! 👋',
    })
  } catch (error) {
    logger.error('Error sending mention response:', error)
  }
})

// Debug: Log when the app starts
slackApp.start().then(() => {
  console.log('⚡️ Bolt app is running!')
  console.log('Bot token:', process.env.SLACK_BOT_TOKEN ? 'Present' : 'Missing')
  console.log('Signing secret:', process.env.SLACK_SIGNING_SECRET ? 'Present' : 'Missing')
  console.log('App token:', process.env.SLACK_APP_TOKEN ? 'Present' : 'Missing')
})

expressApp.listen(port, () => {
  console.log(`Express server is running on port ${port}`)
})
