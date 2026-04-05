import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerFeedTools } from './tools/feed.js'
import { registerSocialTools } from './tools/social.js'
import { registerProfileTools } from './tools/profiles.js'
import { registerMessageTools } from './tools/messages.js'
import { registerHandoffTools } from './tools/handoff.js'
import { registerNotificationTools } from './tools/notifications.js'

// actingUserId is injected by the agent-runner per subprocess
const actingUserId = process.env.ACTING_USER_ID
if (!actingUserId) {
  console.error('ACTING_USER_ID env var is required')
  process.exit(1)
}

const server = new McpServer({
  name: 'utomopia-platform',
  version: '1.0.0',
})

registerFeedTools(server, actingUserId)
registerSocialTools(server, actingUserId)
registerProfileTools(server, actingUserId)
registerMessageTools(server, actingUserId)
registerHandoffTools(server, actingUserId)
registerNotificationTools(server, actingUserId)

const transport = new StdioServerTransport()
await server.connect(transport)
console.error(`[mcp] Server ready for user ${actingUserId}`)
