import { App } from '@slack/bolt'
import { WebClient } from '@slack/web-api'
import { startOfDay, endOfDay } from 'date-fns'
import express from 'express'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// Initialize Express app
const expressApp = express()
const port = process.env.PORT || 3000

// Initialize Slack Web Client
const webClient = new WebClient(process.env.SLACK_BOT_TOKEN)

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

// Function to fetch today's messages from a channel
async function fetchTodaysMessages(channelId: string, logger: any) {
  try {
    const today = new Date()
    const oldest = startOfDay(today).getTime() / 1000
    const latest = endOfDay(today).getTime() / 1000

    logger.info('Fetching messages with params:', {
      channelId,
      oldest,
      latest,
    })

    const result = await webClient.conversations.history({
      channel: channelId,
      oldest: oldest.toString(),
      latest: latest.toString(),
      limit: 1000, // Adjust this number based on your needs
    })

    logger.info(`Found ${result.messages?.length || 0} messages`)

    // Filter out bot messages and system messages
    const filteredMessages = result.messages?.filter((msg) => !msg.bot_id && !msg.subtype && msg.text && msg.user) || []

    logger.info(`Filtered to ${filteredMessages.length} relevant messages`)

    return filteredMessages
  } catch (error) {
    logger.error('Error fetching messages:', error)
    throw error
  }
}

// Handle bot mentions
slackApp.event('app_mention', async ({ event, say, logger }) => {
  try {
    logger.info('Bot mentioned with event data:', JSON.stringify(event, null, 2))

    // Extract relevant information from the mention event
    const channelId = event.channel
    const userId = event.user
    const text = event.text
    const ts = event.ts

    logger.info('Extracted data:', {
      channelId,
      userId,
      text,
      ts,
    })

    // Acknowledge the mention with a temporary message
    await say({
      text: `I received your mention! I'll analyze today's messages in this channel.`,
      thread_ts: ts,
    })

    // Fetch today's messages
    const messages = await fetchTodaysMessages(channelId, logger)

    // Log the messages for now (we'll process them with OpenAI in the next step)
    logger.info("Today's messages:", JSON.stringify(messages, null, 2))

    // Temporary response with message count
    await say({
      text: `I found ${messages.length} messages from today. I'll process these messages and provide a summary soon.`,
      thread_ts: ts,
    })
  } catch (error) {
    logger.error('Error handling mention:', error)
    await say({
      text: 'Sorry, I encountered an error while processing your request.',
      thread_ts: event.ts,
    })
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
