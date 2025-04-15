import { App } from '@slack/bolt'
import { WebClient } from '@slack/web-api'
import { startOfDay, endOfDay } from 'date-fns'
import OpenAI from 'openai'
import express from 'express'
import dotenv from 'dotenv'

dotenv.config()

const expressApp = express()
const port = process.env.PORT || 3000

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const webClient = new WebClient(process.env.SLACK_BOT_TOKEN)

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

// Function to extract question from mention text
function extractQuestion(mentionText: string, botUserId: string): string {
  // Remove the bot mention from the text
  const textWithoutMention = mentionText.replace(/<@[A-Z0-9]+>/, '').trim()

  // If there's no text after the mention, return a default question
  if (!textWithoutMention) {
    return "Summarize today's messages"
  }

  return textWithoutMention
}

// Function to get answer from OpenAI based on user question
async function getAnswerFromOpenAI(
  question: string,
  messages: any[],
  userNames: { [key: string]: string },
  logger: any
) {
  try {
    const formattedMessages = formatMessagesForOpenAI(messages, userNames)

    const prompt = `Based on the following Slack messages from today, please answer this question: "${question}"

Focus on providing a direct, relevant answer to the question. If the question is about specific users or time periods, make sure to address those specifically.

Messages to analyze:
${formattedMessages}

Please provide a clear, concise answer:`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-nano',
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful assistant that answers questions about Slack conversations. Provide direct, relevant answers based on the messages provided. If the question is about specific users or time periods, make sure to address those specifically.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
      presence_penalty: 0.6,
      frequency_penalty: 0.6,
    })

    const answer = completion.choices[0].message.content

    // Validate the answer
    if (!answer || answer.length < 20) {
      throw new Error('Generated answer is too short or empty')
    }

    return answer
  } catch (error: any) {
    logger.error('Error getting answer from OpenAI:', error)

    // Handle specific OpenAI errors
    if (error.status === 429) {
      return "I'm sorry, but I've reached my API limit. Please try again later or contact the administrator to add billing information."
    } else if (error.status === 401) {
      return "I'm sorry, but there's an issue with my API authentication. Please contact the administrator."
    } else if (error.message === 'Generated answer is too short or empty') {
      return "I apologize, but I couldn't generate a proper answer. This might be because there weren't enough messages to analyze or the messages were too brief. Please try again with more messages."
    } else {
      return "I'm sorry, but I encountered an error while trying to answer your question. Please try again later."
    }
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

    // Extract the bot's user ID from the mention
    const botMentionMatch = text.match(/<@([A-Z0-9]+)>/)
    const botUserId = botMentionMatch ? botMentionMatch[1] : ''

    // Extract the question from the mention text
    const question = extractQuestion(text, botUserId)

    logger.info('Extracted data:', {
      channelId,
      userId,
      text,
      ts,
      question,
    })

    // React to the mention message with an emoji
    await webClient.reactions.add({
      channel: channelId,
      timestamp: ts,
      name: 'eyes', // This will add the 👀 emoji
    })

    // Fetch today's messages
    const messages = await fetchTodaysMessages(channelId, logger)

    if (messages.length === 0) {
      await say({
        text: "I didn't find any messages from today to analyze.",
        thread_ts: ts,
      })
      return
    }

    // Get user names for the messages
    const userNames = await getUserNames(messages, logger)

    // Get answer from OpenAI based on the question
    const answer = await getAnswerFromOpenAI(question, messages, userNames, logger)

    // Send the answer
    await say({
      text: answer,
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
