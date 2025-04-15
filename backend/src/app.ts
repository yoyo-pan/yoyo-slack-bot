import { App } from '@slack/bolt'
import { WebClient } from '@slack/web-api'
import { startOfDay, endOfDay } from 'date-fns'
import OpenAI from 'openai'
import express from 'express'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// Initialize Express app
const expressApp = express()
const port = process.env.PORT || 3000

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

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

// Function to get user names for messages
async function getUserNames(messages: any[], logger: any) {
  const userIds = [...new Set(messages.map((msg) => msg.user))]
  const userNames: { [key: string]: string } = {}

  for (const userId of userIds) {
    try {
      const result = await webClient.users.info({ user: userId })
      userNames[userId] = result.user?.real_name || result.user?.name || userId
    } catch (error) {
      logger.error(`Error fetching user info for ${userId}:`, error)
      userNames[userId] = userId
    }
  }

  return userNames
}

// Function to format messages for OpenAI
function formatMessagesForOpenAI(messages: any[], userNames: { [key: string]: string }) {
  return messages
    .map((msg) => {
      const userName = userNames[msg.user] || msg.user
      const timestamp = new Date(parseInt(msg.ts) * 1000).toLocaleTimeString()
      return `[${timestamp}] ${userName}: ${msg.text}`
    })
    .join('\n')
}

// Function to get summary from OpenAI
async function getMessageSummary(messages: any[], userNames: { [key: string]: string }, logger: any) {
  try {
    const formattedMessages = formatMessagesForOpenAI(messages, userNames)

    const prompt = `Please provide a comprehensive summary of the following Slack messages from today. 
Focus on:
1. Main topics discussed
2. Key decisions made
3. Action items or tasks
4. Important updates or announcements

Format the summary with clear sections and bullet points where appropriate.

Messages to summarize:
${formattedMessages}

Please provide a well-structured summary:`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-nano', // Using GPT-4.1 nano for better cost-effectiveness
      messages: [
        {
          role: 'system',
          content:
            'You are a professional communication assistant that creates clear, well-structured summaries of Slack conversations. Always format your response with proper sections, bullet points, and clear organization. Never cut off mid-sentence and always provide a complete summary.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 1000, // Increased token limit for more complete summaries
      presence_penalty: 0.6,
      frequency_penalty: 0.6,
    })

    console.log('YO~~~~~~~Completion is this', completion)

    const summary = completion.choices[0].message.content

    // Validate the summary
    if (!summary || summary.length < 50) {
      throw new Error('Generated summary is too short or empty')
    }

    return summary
  } catch (error: any) {
    logger.error('Error getting summary from OpenAI:', error)

    // Handle specific OpenAI errors
    if (error.status === 429) {
      return "I'm sorry, but I've reached my API limit. Please try again later or contact the administrator to add billing information."
    } else if (error.status === 401) {
      return "I'm sorry, but there's an issue with my API authentication. Please contact the administrator."
    } else if (error.message === 'Generated summary is too short or empty') {
      return "I apologize, but I couldn't generate a proper summary. This might be because there weren't enough messages to summarize or the messages were too brief. Please try again with more messages."
    } else {
      return "I'm sorry, but I encountered an error while trying to summarize the messages. Please try again later."
    }
  }
}

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

    if (messages.length === 0) {
      await say({
        text: "I didn't find any messages from today to summarize.",
        thread_ts: ts,
      })
      return
    }

    // Get user names for the messages
    const userNames = await getUserNames(messages, logger)

    // Get summary from OpenAI
    const summary = await getMessageSummary(messages, userNames, logger)

    // Send the summary
    await say({
      text: `Here's a summary of today's messages:\n\n${summary}`,
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
  console.log('OpenAI API key:', process.env.OPENAI_API_KEY ? 'Present' : 'Missing')
})

expressApp.listen(port, () => {
  console.log(`Express server is running on port ${port}`)
})
