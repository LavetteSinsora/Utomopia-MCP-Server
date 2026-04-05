import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { db } from '../db/client.js'

export function registerMessageTools(server: McpServer, actingUserId: string) {
  server.tool(
    'list_my_conversations',
    'List all DM conversations the user is part of, with their current status.',
    {},
    async () => {
      const { data, error } = await db
        .from('conversations')
        .select(`
          id, status, summary, created_at,
          user_a_profile:profiles!user_a(id, display_name),
          user_b_profile:profiles!user_b(id, display_name)
        `)
        .or(`user_a.eq.${actingUserId},user_b.eq.${actingUserId}`)
        .order('created_at', { ascending: false })

      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'read_conversation',
    'Read the message history of a conversation.',
    {
      conversation_id: z.string().uuid(),
      limit: z.number().min(1).max(100).default(50),
    },
    async ({ conversation_id, limit }) => {
      // Verify actingUserId is a participant
      const { data: conv } = await db
        .from('conversations')
        .select('user_a, user_b')
        .eq('id', conversation_id)
        .single()

      if (!conv || (conv.user_a !== actingUserId && conv.user_b !== actingUserId)) {
        return { content: [{ type: 'text' as const, text: 'Error: Not a participant in this conversation.' }] }
      }

      const { data, error } = await db
        .from('messages')
        .select(`id, content, is_agent_generated, created_at, sender:profiles!sender_id(id, display_name)`)
        .eq('conversation_id', conversation_id)
        .order('created_at', { ascending: true })
        .limit(limit)

      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'send_message',
    'Send a DM in an existing conversation.',
    {
      conversation_id: z.string().uuid(),
      content: z.string().min(1).max(2000),
    },
    async ({ conversation_id, content }) => {
      const { data: conv } = await db
        .from('conversations')
        .select('user_a, user_b, status')
        .eq('id', conversation_id)
        .single()

      if (!conv) return { content: [{ type: 'text' as const, text: 'Error: Conversation not found.' }] }
      if (conv.user_a !== actingUserId && conv.user_b !== actingUserId) {
        return { content: [{ type: 'text' as const, text: 'Error: Not a participant.' }] }
      }

      const { error } = await db.from('messages').insert({
        conversation_id,
        sender_id: actingUserId,
        content,
        is_agent_generated: true,
      })

      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
      return { content: [{ type: 'text' as const, text: 'Message sent.' }] }
    }
  )

  server.tool(
    'start_conversation',
    'Initiate a new DM conversation with another user.',
    {
      other_user_id: z.string().uuid(),
      opening_message: z.string().min(1).max(2000),
    },
    async ({ other_user_id, opening_message }) => {
      // Check if conversation already exists (either direction)
      const { data: existing } = await db
        .from('conversations')
        .select('id, status')
        .or(
          `and(user_a.eq.${actingUserId},user_b.eq.${other_user_id}),` +
          `and(user_a.eq.${other_user_id},user_b.eq.${actingUserId})`
        )
        .maybeSingle()

      let conversationId: string

      if (existing) {
        conversationId = existing.id
      } else {
        const { data: conv, error } = await db
          .from('conversations')
          .insert({ user_a: actingUserId, user_b: other_user_id, status: 'agent' })
          .select('id')
          .single()

        if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] }
        conversationId = conv.id
      }

      // Send opening message
      await db.from('messages').insert({
        conversation_id: conversationId,
        sender_id: actingUserId,
        content: opening_message,
        is_agent_generated: true,
      })

      // Notify the other user
      await db.from('notifications').insert({
        user_id: other_user_id,
        type: 'new_dm',
        ref_id: conversationId,
        payload: { from_user_id: actingUserId },
      })

      return { content: [{ type: 'text' as const, text: `Conversation started: ${conversationId}` }] }
    }
  )
}
