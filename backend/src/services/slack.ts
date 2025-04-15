import { App } from '@slack/bolt'
import { WebClient } from '@slack/web-api'
import { startOfDay, endOfDay } from 'date-fns'
import { ChannelMember, ChannelMembers, UserNames, SlackMessage } from '../types'
import { OpenAIService } from './openai'

export class SlackService {
  private client: WebClient
  private app: App
  private channelMembers: ChannelMembers = {}
  private userNames: UserNames = {}
  private openAIService: OpenAIService

  constructor(token: string, signingSecret: string, appToken: string, openAIService: OpenAIService) {
    this.client = new WebClient(token)
    this.openAIService = openAIService
    this.app = new App({
      token,
      signingSecret,
      socketMode: true,
      appToken,
    })
    this.initializeEventListeners()
  }

  private initializeEventListeners(): void {
    // Debug: Log all incoming events
    this.app.event('*', async ({ event, logger }) => {
      logger.info('Received event:', JSON.stringify(event, null, 2))
    })

    // Debug: Log all incoming messages
    this.app.message(async ({ message, logger }) => {
      logger.info('Received message:', JSON.stringify(message, null, 2))
    })

    // Handle bot mentions
    this.app.event('app_mention', async ({ event, say, logger }) => {
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
        const question = this.extractQuestion(text, botUserId)

        logger.info('Extracted data:', {
          channelId,
          userId,
          text,
          ts,
          question,
        })

        // React to the mention message with an emoji
        await this.reactToMessage(channelId, ts, 'eyes')

        // Fetch channel members and messages
        const [channelMembers, messages] = await Promise.all([
          this.getChannelMembers(channelId),
          this.fetchTodaysMessages(channelId, logger),
        ])

        // Get user names for all messages
        const userNames: UserNames = {}
        for (const msg of messages) {
          if (!userNames[msg.user]) {
            userNames[msg.user] = await this.getUserName(msg.user)
          }
        }

        // Get answer from OpenAI
        const answer = await this.openAIService.getAnswer(question, messages, userNames, channelMembers, logger)

        // Send the answer in a thread
        await this.sendMessage(channelId, answer, ts)
      } catch (error) {
        logger.error('Error handling mention:', error)
        await say('Sorry, I encountered an error while processing your request. Please try again later.')
      }
    })
  }

  // Start the Slack app
  async start(port: number): Promise<void> {
    await this.app.start(port)
    console.log(`⚡️ Bolt app is running on port ${port}`)
  }

  // Send a message to a channel, optionally in a thread
  async sendMessage(channel: string, text: string, threadTs?: string): Promise<void> {
    try {
      await this.client.chat.postMessage({
        channel,
        text,
        thread_ts: threadTs,
      })
    } catch (error) {
      console.error('Error sending message to Slack:', error)
      throw error
    }
  }

  // React to a message with an emoji
  async reactToMessage(channel: string, timestamp: string, emoji: string): Promise<void> {
    try {
      await this.client.reactions.add({
        channel,
        timestamp,
        name: emoji,
      })
    } catch (error) {
      console.error('Error adding reaction to message:', error)
      throw error
    }
  }

  // Get channel members
  async getChannelMembers(channelId: string): Promise<ChannelMembers> {
    try {
      const result = await this.client.conversations.members({
        channel: channelId,
      })

      if (!result.members) {
        return {}
      }

      const members = result.members
      const memberPromises = members.map(async (memberId) => {
        if (this.channelMembers[memberId]) {
          return this.channelMembers[memberId]
        }

        const userInfo = await this.client.users.info({
          user: memberId,
        })

        if (!userInfo.user) {
          throw new Error(`User info not found for member ${memberId}`)
        }

        const member: ChannelMember = {
          id: memberId,
          name: userInfo.user.name || '',
          real_name: userInfo.user.real_name || '',
          isBot: userInfo.user.is_bot || false,
        }

        this.channelMembers[memberId] = member
        return member
      })

      const resolvedMembers = await Promise.all(memberPromises)
      return resolvedMembers.reduce((acc, member) => {
        acc[member.id] = member
        return acc
      }, {} as ChannelMembers)
    } catch (error) {
      console.error('Error getting channel members:', error)
      throw error
    }
  }

  // Get user name
  async getUserName(userId: string): Promise<string> {
    if (this.userNames[userId]) {
      return this.userNames[userId]
    }

    try {
      const result = await this.client.users.info({
        user: userId,
      })

      if (!result.user) {
        throw new Error(`User info not found for user ${userId}`)
      }

      const name = result.user.real_name || result.user.name || userId
      this.userNames[userId] = name
      return name
    } catch (error) {
      console.error('Error getting user name:', error)
      return userId
    }
  }

  // Get channel history
  async getChannelHistory(channelId: string, limit: number = 100): Promise<SlackMessage[]> {
    try {
      const result = await this.client.conversations.history({
        channel: channelId,
        limit,
      })

      if (!result.messages) {
        return []
      }

      return result.messages.map((msg) => ({
        user: msg.user || '',
        text: msg.text || '',
        ts: msg.ts || '',
        botId: msg.bot_id,
        subtype: msg.subtype,
      }))
    } catch (error) {
      console.error('Error getting channel history:', error)
      throw error
    }
  }

  // Fetch today's messages from a channel
  async fetchTodaysMessages(channelId: string, logger: any): Promise<SlackMessage[]> {
    try {
      const today = new Date()
      const oldest = startOfDay(today).getTime() / 1000
      const latest = endOfDay(today).getTime() / 1000

      logger.info('Fetching messages with params:', {
        channelId,
        oldest,
        latest,
      })

      const messages = await this.getChannelHistory(channelId)
      const filteredMessages = messages.filter((msg) => !msg.botId && !msg.subtype && msg.text && msg.user)

      logger.info(`Found ${messages.length} messages, filtered to ${filteredMessages.length} relevant messages`)
      return filteredMessages
    } catch (error) {
      logger.error('Error fetching messages:', error)
      throw error
    }
  }

  // Extract question from mention text
  private extractQuestion(mentionText: string, botUserId: string): string {
    // Remove the bot mention from the text
    const textWithoutMention = mentionText.replace(/<@[A-Z0-9]+>/, '').trim()

    // If there's no text after the mention, return a default question
    if (!textWithoutMention) {
      return "Summarize today's messages"
    }

    return textWithoutMention
  }
}
