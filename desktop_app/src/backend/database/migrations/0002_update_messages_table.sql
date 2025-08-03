-- Drop the old messages table
DROP TABLE IF EXISTS messages;

-- Create new messages table with better AI SDK alignment
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  parts TEXT, -- JSON array for multi-part messages
  tool_calls TEXT, -- JSON array for tool calls
  images TEXT, -- JSON array for image URLs
  thinking TEXT, -- Thinking/reasoning content
  created_at TEXT NOT NULL DEFAULT (current_timestamp),
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
);

-- Create index for better query performance
CREATE INDEX idx_messages_chat_id ON messages(chat_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);