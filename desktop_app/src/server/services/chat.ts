import { eq, desc } from 'drizzle-orm';
import { chatsTable } from '@/database/schema/chat';
import db from '@/server/database';

export interface CreateChatRequest {
  llmProvider: string;
}

export interface UpdateChatRequest {
  title?: string | null;
}

export interface Chat {
  id: number;
  sessionId: string;
  title: string | null;
  llmProvider: string;
  createdAt: string;
  updatedAt: string;
}

export class ChatService {
  async getAllChats(): Promise<Chat[]> {
    const chats = await db
      .select()
      .from(chatsTable)
      .orderBy(desc(chatsTable.createdAt));
    
    return chats;
  }

  async getChatById(id: number): Promise<Chat | null> {
    const results = await db
      .select()
      .from(chatsTable)
      .where(eq(chatsTable.id, id))
      .limit(1);
    
    return results[0] || null;
  }

  async createChat(request: CreateChatRequest): Promise<Chat> {
    const [chat] = await db
      .insert(chatsTable)
      .values({
        llmProvider: request.llmProvider,
      })
      .returning();
    
    return chat;
  }

  async updateChat(id: number, request: UpdateChatRequest): Promise<Chat | null> {
    const chat = await this.getChatById(id);
    if (!chat) {
      return null;
    }

    const [updatedChat] = await db
      .update(chatsTable)
      .set({
        title: request.title,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(chatsTable.id, id))
      .returning();
    
    return updatedChat;
  }

  async deleteChat(id: number): Promise<void> {
    await db
      .delete(chatsTable)
      .where(eq(chatsTable.id, id));
  }
}

export const chatService = new ChatService();