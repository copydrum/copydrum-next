export type ChatSenderType = 'user' | 'admin' | 'system' | 'bot';
export type ChatConversationStatus = 'open' | 'pending' | 'closed';
export type ChatChannel = 'live' | 'offline_message';

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_type: ChatSenderType;
  sender_id: string | null;
  body: string;
  attachment_url: string | null;
  read_at: string | null;
  created_at: string;
}

export interface ChatConversation {
  id: string;
  user_id: string | null;
  guest_token: string | null;
  guest_name: string | null;
  guest_email: string | null;
  status: ChatConversationStatus;
  channel: ChatChannel;
  subject: string | null;
  last_message_at: string;
  last_message_preview: string | null;
  unread_for_admin: number;
  unread_for_user: number;
  assigned_admin_id: string | null;
  rating: number | null;
  created_at: string;
  updated_at: string;
}

export interface GuestIdentity {
  name: string;
  email: string;
}
