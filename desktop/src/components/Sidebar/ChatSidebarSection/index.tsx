import { Plus } from 'lucide-react';

import { DeleteChatConfirmation } from '@/components/DeleteChatConfirmation';
import { EditableTitle } from '@/components/EditableTitle';
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { useChatStore } from '@/stores/chat-store';

interface ChatSidebarProps {}

export default function ChatSidebarSection(_props: ChatSidebarProps) {
  const { chats, currentChat, isLoadingChats, selectChat, createNewChat, deleteCurrentChat, updateChat } =
    useChatStore();
  const currentChatId = currentChat.id;

  return (
    <>
      <SidebarMenuItem className="ml-6 group-data-[collapsible=icon]:hidden">
        <SidebarMenuButton onClick={createNewChat} size="sm" className="cursor-pointer hover:bg-accent/50 text-sm">
          <Plus className="h-3 w-3" />
          <span>New Chat</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      {isLoadingChats ? (
        <SidebarMenuItem className="ml-6 group-data-[collapsible=icon]:hidden">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="h-3 w-3 animate-spin rounded-full border border-muted-foreground border-t-transparent" />
            <span className="text-xs text-muted-foreground">Loading chats...</span>
          </div>
        </SidebarMenuItem>
      ) : chats.length === 0 ? (
        <SidebarMenuItem className="ml-6 group-data-[collapsible=icon]:hidden">
          <div className="px-2 py-1.5 text-xs text-muted-foreground">No chats yet</div>
        </SidebarMenuItem>
      ) : (
        chats.map((chat) => {
          const { id, title } = chat;

          return (
            <SidebarMenuItem key={id} className="ml-6 group-data-[collapsible=icon]:hidden">
              <SidebarMenuButton
                onClick={() => selectChat(id)}
                isActive={currentChatId === id}
                size="sm"
                className="cursor-pointer hover:bg-accent/50 text-sm justify-between group"
              >
                {currentChatId === id ? (
                  <EditableTitle title={title} isAnimated={!title} onSave={(newTitle) => updateChat(id, newTitle)} />
                ) : (
                  <span className="truncate">{title || 'New Chat'}</span>
                )}
                {currentChatId === id && <DeleteChatConfirmation onDelete={deleteCurrentChat} />}
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })
      )}
    </>
  );
}
