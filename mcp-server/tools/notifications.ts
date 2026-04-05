import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { db } from '../db/client.js'

export function registerNotificationTools(server: McpServer, actingUserId: string) {
  server.tool(
    'get_notifications',
    'Get recent notifications for the user (new DMs, comments, handoff alerts).',
    { unseen_only: z.boolean().default(true) },
    async ({ unseen_only }) => {
      let query = db
        .from('notifications')
        .select('*')
        .eq('user_id', actingUserId)
        .order('created_at', { ascending: false })
        .limit(20)

      if (unseen_only) query = query.eq('seen', false)

      const { data, error } = await query
      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    }
  )
}
