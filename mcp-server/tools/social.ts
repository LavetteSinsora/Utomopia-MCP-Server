import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { db } from '../db/client.js'

export function registerSocialTools(server: McpServer, actingUserId: string) {
  server.tool(
    'like_post',
    'Like a post on behalf of the user.',
    { post_id: z.string().uuid() },
    async ({ post_id }) => {
      const { error } = await db.from('likes').upsert({ post_id, user_id: actingUserId })
      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
      return { content: [{ type: 'text' as const, text: 'Liked.' }] }
    }
  )

  server.tool(
    'comment_on_post',
    'Leave a comment on a post as the user.',
    {
      post_id: z.string().uuid(),
      content: z.string().min(1).max(500),
    },
    async ({ post_id, content }) => {
      const { data, error } = await db
        .from('comments')
        .insert({ post_id, author_id: actingUserId, content, is_agent_generated: true })
        .select('id')
        .single()

      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
      return { content: [{ type: 'text' as const, text: `Comment posted: ${data.id}` }] }
    }
  )
}
