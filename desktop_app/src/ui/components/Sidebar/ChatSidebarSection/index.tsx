import { Plus } from 'lucide-react';

import config from '@ui/config';
import { DeleteChatConfirmation } from '@ui/components/DeleteChatConfirmation';
import { EditableTitle } from '@ui/components/EditableTitle';
import { SidebarMenuButton, SidebarMenuItem } from '@ui/components/ui/sidebar';
import { useChatStore } from '@ui/stores/chat-store';

interface ChatSidebarProps {}

export default function ChatSidebarSection(_props: ChatSidebarProps) {
  const { chats, getCurrentChat, isLoadingChats, selectChat, createNewChat, deleteCurrentChat, updateChatTitle } =
    useChatStore();
  const currentChatId = getCurrentChat()?.id;

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
          const isCurrentChat = currentChatId === id;

          return (
            <SidebarMenuItem key={id} className="ml-6 group-data-[collapsible=icon]:hidden group/chat-item">
              <div className="flex items-center">
                <SidebarMenuButton
                  onClick={() => selectChat(id)}
                  isActive={isCurrentChat}
                  size="sm"
                  className="cursor-pointer hover:bg-accent/50 text-sm flex-1 group/chat-button"
                >
                  <EditableTitle
                    className="truncate"
                    title={title || config.ui.chat.defaultTitle}
                    onSave={(newTitle) => updateChatTitle(id, newTitle)}
                    isAnimated
                  />
                </SidebarMenuButton>
                <DeleteChatConfirmation onDelete={deleteCurrentChat} />
              </div>
            </SidebarMenuItem>
          );
        })
      )}
    </>
  );
}
