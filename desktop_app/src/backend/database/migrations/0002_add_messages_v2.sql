-- Create new messages table with better structure
CREATE TABLE IF NOT EXISTS messages_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  parts TEXT, -- JSON array
  images TEXT, -- JSON array
  thinking TEXT,
  tool_calls TEXT, -- JSON array
  created_at TEXT NOT NULL DEFAULT (current_timestamp),
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_messages_v2_chat_id ON messages_v2(chat_id);

-- Migrate existing data (if any)
INSERT INTO messages_v2 (chat_id, role, content, created_at)
SELECT 
  chat_id,
  role,
  CASE 
    WHEN json_valid(content) THEN json_extract(content, '$.content')
    ELSE content
  END as content,
  created_at
FROM messages;

-- After verifying migration, you can drop the old table with:
-- DROP TABLE messages;