import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { DeleteChatConfirmation } from '@ui/components/DeleteChatConfirmation';
import { EditableTitle } from '@ui/components/EditableTitle';
import { SidebarMenuButton, SidebarMenuItem } from '@ui/components/ui/sidebar';
import config from '@ui/config';
import { useChatStore } from '@ui/stores';

interface ChatSidebarProps {}

export default function ChatSidebarSection(_props: ChatSidebarProps) {
  const { chats, getCurrentChat, isLoadingChats, selectChat, deleteCurrentChat, updateChatTitle } = useChatStore();
  const currentChatId = getCurrentChat()?.id;
  const [showAllChats, setShowAllChats] = useState(false);

  const VISIBLE_CHAT_COUNT = 5;
  const visibleChats = showAllChats ? chats : chats.slice(0, VISIBLE_CHAT_COUNT);
  const hiddenChatsCount = Math.max(0, chats.length - VISIBLE_CHAT_COUNT);

  return (
    <>
      {isLoadingChats ? (
        <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="h-3 w-3 animate-spin rounded-full border border-muted-foreground border-t-transparent" />
            <span className="text-xs text-muted-foreground">Loading chats...</span>
          </div>
        </SidebarMenuItem>
      ) : chats.length === 0 ? (
        <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
          <div className="px-2 py-1.5 text-xs text-muted-foreground">No chats yet</div>
        </SidebarMenuItem>
      ) : (
        <>
          {visibleChats.map((chat) => {
            const { id, title } = chat;
            const isCurrentChat = currentChatId === id;

            return (
              <SidebarMenuItem key={id} className="group-data-[collapsible=icon]:hidden group/chat-item">
                <div className="flex items-center">
                  <SidebarMenuButton
                    onClick={() => selectChat(id)}
                    isActive={isCurrentChat}
                    size="sm"
                    className="cursor-pointer hover:bg-accent/50 text-sm flex-1 group/chat-button"
                  >
                    <EditableTitle
                      className="truncate"
                      title={title || config.chat.defaultTitle}
                      onSave={(newTitle) => updateChatTitle(id, newTitle)}
                      isAnimated
                    />
                  </SidebarMenuButton>
                  <DeleteChatConfirmation onDelete={deleteCurrentChat} />
                </div>
              </SidebarMenuItem>
            );
          })}
          {hiddenChatsCount > 0 && (
            <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
              <SidebarMenuButton
                onClick={() => setShowAllChats(!showAllChats)}
                size="sm"
                className="cursor-pointer hover:bg-accent/50 text-xs text-muted-foreground"
              >
                {showAllChats ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <span>{showAllChats ? 'Show less' : `Show ${hiddenChatsCount} more`}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </>
      )}
    </>
  );
}
