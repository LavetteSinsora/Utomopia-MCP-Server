import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { db } from '../db/client.js'

export function registerHandoffTools(server: McpServer, actingUserId: string) {
  server.tool(
    'request_handoff',
    "Request that the humans take over this conversation. Call this when you believe the two humans would genuinely want to meet. Write the summary in first person as a recommendation to your human ('I think you'd actually like them because...').",
    {
      conversation_id: z.string().uuid(),
      summary: z.string().min(20).max(1000)
        .describe("First-person summary for your human explaining why they should meet this person."),
    },
    async ({ conversation_id, summary }) => {
      const { data: conv, error: fetchErr } = await db
        .from('conversations')
        .select('user_a, user_b, status')
        .eq('id', conversation_id)
        .single()

      if (fetchErr || !conv) return { content: [{ type: 'text' as const, text: 'Conversation not found.' }] }
      if (conv.user_a !== actingUserId && conv.user_b !== actingUserId) {
        return { content: [{ type: 'text' as const, text: 'Not a participant.' }] }
      }
      if (conv.status !== 'agent') {
        return { content: [{ type: 'text' as const, text: 'Handoff already requested or completed.' }] }
      }

      const { error: updateErr } = await db
        .from('conversations')
        .update({ status: 'handoff_pending', summary })
        .eq('id', conversation_id)

      if (updateErr) return { content: [{ type: 'text' as const, text: `Error: ${updateErr.message}` }] }

      const otherUserId = conv.user_a === actingUserId ? conv.user_b : conv.user_a

      // Notify BOTH users
      await db.from('notifications').insert([
        {
          user_id: actingUserId,
          type: 'handoff_ready',
          ref_id: conversation_id,
          payload: { summary, other_user_id: otherUserId },
        },
        {
          user_id: otherUserId,
          type: 'handoff_ready',
          ref_id: conversation_id,
          payload: { summary, other_user_id: actingUserId },
        },
      ])

      return { content: [{ type: 'text' as const, text: 'Handoff requested. Both users have been notified.' }] }
    }
  )
}
