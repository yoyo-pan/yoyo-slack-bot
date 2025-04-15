# Yoyo Slack Bot

A Slack bot that uses OpenAI to answer questions about channel conversations and provide insights.

## Features

- Responds to mentions with AI-generated answers
- Analyzes channel messages and members
- Provides context-aware responses based on the conversation
- Reacts to messages with emojis
- Replies in threads for better conversation organization

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- A Slack workspace with admin privileges
- An OpenAI API key

## Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/yoyo-slack-bot.git
cd yoyo-slack-bot
```

### 2. Install Dependencies

```bash
# Install backend dependencies
cd backend
npm install
```

### 3. Set Up Environment Variables

Create a `.env` file in the `backend` directory with the following variables:

```
# Server Configuration
PORT=3000

# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_TOKEN=xapp-your-app-token

# OpenAI Configuration
OPENAI_API_KEY=your-openai-api-key
```

### 4. Set Up a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click "Create New App"
2. Choose "From scratch" and name your app (e.g., "Yoyo Bot")
3. Select your workspace
4. Under "OAuth & Permissions", add the following bot token scopes:
   - `app_mentions:read`
   - `channels:history`
   - `channels:read`
   - `chat:write`
   - `reactions:write`
   - `users:read`
   - `users:read.email`
5. Install the app to your workspace
6. Copy the "Bot User OAuth Token" (starts with `xoxb-`) to your `.env` file as `SLACK_BOT_TOKEN`
7. Copy the "Signing Secret" to your `.env` file as `SLACK_SIGNING_SECRET`
8. Under "Basic Information", copy the "App-Level Token" (starts with `xapp-`) to your `.env` file as `SLACK_APP_TOKEN`
9. Enable Socket Mode in the "Socket Mode" section
10. Under "Event Subscriptions", enable events and subscribe to the following bot events:
    - `app_mention`

### 5. Get an OpenAI API Key

1. Go to [platform.openai.com](https://platform.openai.com/)
2. Sign up or log in
3. Navigate to "API keys" in the sidebar
4. Create a new API key
5. Copy the API key to your `.env` file as `OPENAI_API_KEY`

## Running the Server

### Development Mode

```bash
# Start the server in development mode
npm run dev
```

### Production Mode

```bash
# Build the TypeScript code
npm run build

# Start the server in production mode
npm start
```

## Usage

1. Invite the bot to a channel where you want to use it
2. Mention the bot with a question, e.g., `@YoyoBot summarize today's messages`
3. The bot will:
   - React to your message with 👀
   - Analyze the channel's messages and members
   - Generate an answer using OpenAI
   - Reply in a thread to your message

## Project Structure

```
yoyo-slack-bot/
├── backend/
│   ├── src/
│   │   ├── services/
│   │   │   ├── slack.ts       # Slack service for API interactions
│   │   │   └── openai.ts      # OpenAI service for AI functionality
│   │   ├── types/
│   │   │   └── index.ts       # TypeScript interfaces
│   │   └── app.ts             # Main application entry point
│   ├── package.json
│   └── tsconfig.json
└── README.md
```

## Troubleshooting

- **Bot not responding**: Check that the bot has been invited to the channel and has the necessary permissions.
- **API errors**: Verify that your API keys are correct and have not expired.
- **Socket Mode issues**: Ensure Socket Mode is enabled in your Slack app settings.
- **OpenAI errors**: Check your OpenAI API key and ensure you have sufficient credits.

## License

[MIT License](LICENSE)
