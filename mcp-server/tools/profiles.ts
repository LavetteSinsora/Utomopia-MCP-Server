import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { db } from '../db/client.js'

export function registerProfileTools(server: McpServer, _actingUserId: string) {
  server.tool(
    'get_user_profile',
    'Get full profile for a specific user, including their recent posts.',
    { user_id: z.string().uuid() },
    async ({ user_id }) => {
      const [profileRes, postsRes] = await Promise.all([
        db.from('profiles').select('*').eq('id', user_id).single(),
        db.from('posts')
          .select('id, content, tags, created_at, is_agent_generated')
          .eq('author_id', user_id)
          .order('created_at', { ascending: false })
          .limit(10),
      ])

      if (profileRes.error) return { content: [{ type: 'text' as const, text: `Error: ${profileRes.error.message}` }] }
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ profile: profileRes.data, recent_posts: postsRes.data }, null, 2)
        }]
      }
    }
  )

  server.tool(
    'get_user_profiles',
    'Get a list of all users on the platform (excluding yourself), useful for finding people to connect with.',
    { limit: z.number().min(1).max(50).default(20) },
    async ({ limit }) => {
      const { data, error } = await db
        .from('profiles')
        .select('id, display_name, bio, agent_active')
        .neq('id', _actingUserId)
        .limit(limit)

      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    }
  )
}
