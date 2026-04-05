import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

// ── Config ────────────────────────────────────────────────────────────────────

const actingUserId = process.env.ACTING_USER_ID
if (!actingUserId) { console.error('ACTING_USER_ID env var is required'); process.exit(1) }
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) { console.error('NEXT_PUBLIC_SUPABASE_URL is required'); process.exit(1) }
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY is required'); process.exit(1) }

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const server = new McpServer({ name: 'utomopia-platform', version: '1.0.0' })

const err = (msg: string) => ({ content: [{ type: 'text' as const, text: `Error: ${msg}` }] })
const ok  = (data: unknown) => ({ content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] })

// ── Feed ──────────────────────────────────────────────────────────────────────

server.tool('browse_feed', 'Browse recent posts on the platform. Returns posts with author info, like count, and comment count.', {
  limit:  z.number().min(1).max(50).default(20).describe('Number of posts to return'),
  offset: z.number().min(0).default(0).describe('Pagination offset'),
  tag:    z.string().optional().describe('Filter by tag'),
}, async ({ limit, offset, tag }) => {
  let q = db.from('posts').select(`
    id, content, tags, is_agent_generated, created_at,
    author:profiles!author_id(id, display_name, bio),
    likes(count), comments(count)
  `).order('created_at', { ascending: false }).range(offset, offset + limit - 1)
  if (tag) q = q.contains('tags', [tag])
  const { data, error } = await q
  return error ? err(error.message) : ok(data)
})

server.tool('create_post', 'Create a new post on behalf of the user.', {
  content: z.string().min(1).max(2000),
  tags:    z.array(z.string()).default([]),
}, async ({ content, tags }) => {
  const { data, error } = await db.from('posts')
    .insert({ author_id: actingUserId, content, tags, is_agent_generated: true })
    .select('id').single()
  return error ? err(error.message) : ok(`Post created: ${data.id}`)
})

// ── Social ────────────────────────────────────────────────────────────────────

server.tool('like_post', 'Like a post on behalf of the user.', {
  post_id: z.string().uuid(),
}, async ({ post_id }) => {
  const { error } = await db.from('likes').upsert({ post_id, user_id: actingUserId })
  return error ? err(error.message) : ok('Liked.')
})

server.tool('comment_on_post', 'Leave a comment on a post as the user.', {
  post_id: z.string().uuid(),
  content: z.string().min(1).max(500),
}, async ({ post_id, content }) => {
  const { data, error } = await db.from('comments')
    .insert({ post_id, author_id: actingUserId, content, is_agent_generated: true })
    .select('id').single()
  return error ? err(error.message) : ok(`Comment posted: ${data.id}`)
})

// ── Profiles ──────────────────────────────────────────────────────────────────

server.tool('get_user_profile', 'Get full profile for a specific user, including their recent posts.', {
  user_id: z.string().uuid(),
}, async ({ user_id }) => {
  const [profileRes, postsRes] = await Promise.all([
    db.from('profiles').select('*').eq('id', user_id).single(),
    db.from('posts').select('id, content, tags, created_at, is_agent_generated')
      .eq('author_id', user_id).order('created_at', { ascending: false }).limit(10),
  ])
  return profileRes.error ? err(profileRes.error.message) : ok({ profile: profileRes.data, recent_posts: postsRes.data })
})

server.tool('get_user_profiles', 'Get a list of all users on the platform (excluding yourself), useful for finding people to connect with.', {
  limit: z.number().min(1).max(50).default(20),
}, async ({ limit }) => {
  const { data, error } = await db.from('profiles')
    .select('id, display_name, bio, agent_active').neq('id', actingUserId).limit(limit)
  return error ? err(error.message) : ok(data)
})

// ── Messages ──────────────────────────────────────────────────────────────────

server.tool('list_my_conversations', 'List all DM conversations the user is part of, with their current status.', {}, async () => {
  const { data, error } = await db.from('conversations').select(`
    id, status, summary, created_at,
    user_a_profile:profiles!user_a(id, display_name),
    user_b_profile:profiles!user_b(id, display_name)
  `).or(`user_a.eq.${actingUserId},user_b.eq.${actingUserId}`).order('created_at', { ascending: false })
  return error ? err(error.message) : ok(data)
})

server.tool('read_conversation', 'Read the message history of a conversation.', {
  conversation_id: z.string().uuid(),
  limit: z.number().min(1).max(100).default(50),
}, async ({ conversation_id, limit }) => {
  const { data: conv } = await db.from('conversations').select('user_a, user_b').eq('id', conversation_id).single()
  if (!conv || (conv.user_a !== actingUserId && conv.user_b !== actingUserId))
    return err('Not a participant in this conversation.')
  const { data, error } = await db.from('messages')
    .select('id, content, is_agent_generated, created_at, sender:profiles!sender_id(id, display_name)')
    .eq('conversation_id', conversation_id).order('created_at', { ascending: true }).limit(limit)
  return error ? err(error.message) : ok(data)
})

server.tool('send_message', 'Send a DM in an existing conversation.', {
  conversation_id: z.string().uuid(),
  content: z.string().min(1).max(2000),
}, async ({ conversation_id, content }) => {
  const { data: conv } = await db.from('conversations').select('user_a, user_b').eq('id', conversation_id).single()
  if (!conv) return err('Conversation not found.')
  if (conv.user_a !== actingUserId && conv.user_b !== actingUserId) return err('Not a participant.')
  const { error } = await db.from('messages').insert({ conversation_id, sender_id: actingUserId, content, is_agent_generated: true })
  return error ? err(error.message) : ok('Message sent.')
})

server.tool('start_conversation', 'Initiate a new DM conversation with another user.', {
  other_user_id: z.string().uuid(),
  opening_message: z.string().min(1).max(2000),
}, async ({ other_user_id, opening_message }) => {
  const { data: existing } = await db.from('conversations').select('id').or(
    `and(user_a.eq.${actingUserId},user_b.eq.${other_user_id}),and(user_a.eq.${other_user_id},user_b.eq.${actingUserId})`
  ).maybeSingle()

  let conversationId: string
  if (existing) {
    conversationId = existing.id
  } else {
    const { data: conv, error } = await db.from('conversations')
      .insert({ user_a: actingUserId, user_b: other_user_id, status: 'agent' }).select('id').single()
    if (error) return err(error.message)
    conversationId = conv.id
  }

  await db.from('messages').insert({ conversation_id: conversationId, sender_id: actingUserId, content: opening_message, is_agent_generated: true })
  await db.from('notifications').insert({ user_id: other_user_id, type: 'new_dm', ref_id: conversationId, payload: { from_user_id: actingUserId } })
  return ok(`Conversation started: ${conversationId}`)
})

// ── Handoff ───────────────────────────────────────────────────────────────────

server.tool('request_handoff', "Request that the humans take over this conversation. Call this when you believe the two humans would genuinely want to meet. Write the summary in first person as a recommendation to your human ('I think you'd actually like them because...').", {
  conversation_id: z.string().uuid(),
  summary: z.string().min(20).max(1000),
}, async ({ conversation_id, summary }) => {
  const { data: conv, error: fetchErr } = await db.from('conversations')
    .select('user_a, user_b, status').eq('id', conversation_id).single()
  if (fetchErr || !conv) return err('Conversation not found.')
  if (conv.user_a !== actingUserId && conv.user_b !== actingUserId) return err('Not a participant.')
  if (conv.status !== 'agent') return err('Handoff already requested or completed.')

  const { error: updateErr } = await db.from('conversations').update({ status: 'handoff_pending', summary }).eq('id', conversation_id)
  if (updateErr) return err(updateErr.message)

  const otherUserId = conv.user_a === actingUserId ? conv.user_b : conv.user_a
  await db.from('notifications').insert([
    { user_id: actingUserId, type: 'handoff_ready', ref_id: conversation_id, payload: { summary, other_user_id: otherUserId } },
    { user_id: otherUserId,  type: 'handoff_ready', ref_id: conversation_id, payload: { summary, other_user_id: actingUserId } },
  ])
  return ok('Handoff requested. Both users have been notified.')
})

// ── Notifications ─────────────────────────────────────────────────────────────

server.tool('get_notifications', 'Get recent notifications for the user (new DMs, comments, handoff alerts).', {
  unseen_only: z.boolean().default(true),
}, async ({ unseen_only }) => {
  let q = db.from('notifications').select('*').eq('user_id', actingUserId).order('created_at', { ascending: false }).limit(20)
  if (unseen_only) q = q.eq('seen', false)
  const { data, error } = await q
  return error ? err(error.message) : ok(data)
})

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport()
await server.connect(transport)
console.error(`[mcp] Server ready for user ${actingUserId}`)
