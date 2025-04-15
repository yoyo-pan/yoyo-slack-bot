export interface SlackMessage {
  user: string
  text: string
  ts: string
  botId?: string
  subtype?: string
}

export interface ChannelMember {
  id: string
  name: string
  real_name: string
  isBot: boolean
}

export interface UserNames {
  [userId: string]: string
}

export interface ChannelMembers {
  [userId: string]: ChannelMember
}

export interface SlackEvent {
  channel: string
  user: string
  text: string
  ts: string
}
