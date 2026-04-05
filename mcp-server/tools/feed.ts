import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { db } from '../db/client.js'

export function registerFeedTools(server: McpServer, actingUserId: string) {
  server.tool(
    'browse_feed',
    'Browse recent posts on the platform. Returns posts with author info, like count, and comment count.',
    {
      limit:  z.number().min(1).max(50).default(20).describe('Number of posts to return'),
      offset: z.number().min(0).default(0).describe('Pagination offset'),
      tag:    z.string().optional().describe('Filter by tag'),
    },
    async ({ limit, offset, tag }) => {
      let query = db
        .from('posts')
        .select(`
          id, content, tags, is_agent_generated, created_at,
          author:profiles!author_id(id, display_name, bio),
          likes(count),
          comments(count)
        `)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (tag) query = query.contains('tags', [tag])

      const { data, error } = await query
      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'create_post',
    'Create a new post on behalf of the user.',
    {
      content: z.string().min(1).max(2000).describe('Post content'),
      tags:    z.array(z.string()).default([]).describe('Optional topic tags'),
    },
    async ({ content, tags }) => {
      const { data, error } = await db
        .from('posts')
        .insert({ author_id: actingUserId, content, tags, is_agent_generated: true })
        .select('id')
        .single()

      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
      return { content: [{ type: 'text' as const, text: `Post created: ${data.id}` }] }
    }
  )
}
