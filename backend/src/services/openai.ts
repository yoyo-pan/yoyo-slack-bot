import OpenAI from 'openai'
import { ChannelMembers, UserNames } from '../types'

export class OpenAIService {
  private client: OpenAI

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
    })
  }

  // Format messages for OpenAI
  private formatMessagesForOpenAI(messages: any[], userNames: UserNames): string {
    return messages
      .map((msg) => {
        const userName = userNames[msg.user] || msg.user
        const timestamp = new Date(parseInt(msg.ts) * 1000).toLocaleTimeString()
        return `[${timestamp}] ${userName}: ${msg.text}`
      })
      .join('\n')
  }

  // Get answer from OpenAI based on user question
  async getAnswer(
    question: string,
    messages: any[],
    userNames: UserNames,
    channelMembers: ChannelMembers,
    logger: any
  ): Promise<string> {
    try {
      const formattedMessages = this.formatMessagesForOpenAI(messages, userNames)

      // Format channel members information
      const formattedMembers = Object.values(channelMembers)
        .filter((member) => !member.isBot) // Exclude bots
        .map((member) => `${member.real_name} (${member.name})`)
        .join('\n')

      const prompt = `Based on the following information, please answer this question: "${question}"

Channel Members (${Object.values(channelMembers).filter((m) => !m.isBot).length} users):
${formattedMembers}

Messages from today:
${formattedMessages}

Please provide a clear, concise answer:`

      const completion = await this.client.chat.completions.create({
        model: 'gpt-4.1-nano',
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful assistant that answers questions about Slack conversations and channel information. Provide direct, relevant answers based on the messages and channel member information provided. If the question is about specific users, channel members, or time periods, make sure to address those specifically.',
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
}
