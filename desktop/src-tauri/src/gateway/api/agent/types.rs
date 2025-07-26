use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Chat message format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// Agent context for enhanced capabilities
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentContext {
    pub objective: Option<String>,
    pub tools: Option<Vec<String>>,
    pub mode: Option<String>,
    pub custom_instructions: Option<String>,
    pub reasoning_mode: Option<String>,
    #[serde(default)]
    pub activate: Option<bool>,
}

/// SSE message types for streaming
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub enum SseMessage {
    MessageStart {
        id: String,
        role: String,
    },
    ContentDelta {
        delta: String,
    },
    ToolCallStart {
        tool_call_id: String,
        tool_name: String,
    },
    ToolCallDelta {
        tool_call_id: String,
        args_delta: String,
    },
    ToolCallResult {
        tool_call_id: String,
        tool_name: String,
        result: Value,
    },
    DataPart {
        data_type: String,
        data: Value,
    },
    MessageComplete {
        usage: Option<UsageStats>,
    },
    Error {
        error: String,
    },
    Ping,
}

/// Usage statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageStats {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

/// SSE Event Types (Vercel AI SDK v5 protocol)

#[derive(Debug, Serialize)]
pub struct MessageStartEvent {
    pub id: String,
    pub role: String,
}

#[derive(Debug, Serialize)]
pub struct ContentDeltaEvent {
    pub delta: String,
}

#[derive(Debug, Serialize)]
pub struct ToolCallStartEvent {
    pub tool_call_id: String,
    pub tool_name: String,
}

#[derive(Debug, Serialize)]
pub struct ToolCallDeltaEvent {
    pub tool_call_id: String,
    pub args_delta: String,
}

#[derive(Debug, Serialize)]
pub struct ToolCallResultEvent {
    pub tool_call_id: String,
    pub tool_name: String,
    pub result: Value,
}

#[derive(Debug, Serialize)]
pub struct DataPartEvent {
    pub data_type: String,
    pub data: Value,
}

#[derive(Debug, Serialize)]
pub struct MessageCompleteEvent {
    pub usage: Option<UsageStats>,
}

#[derive(Debug, Serialize)]
pub struct ErrorEvent {
    pub error: String,
}

/// Agent execution result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentExecutionResult {
    pub message_id: String,
    pub content: String,
    pub tool_calls: Vec<ToolCall>,
    pub reasoning: Vec<ReasoningEntry>,
    pub usage: Option<UsageStats>,
}

/// Tool call information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: Value,
    pub result: Option<Value>,
}

/// Reasoning entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReasoningEntry {
    #[serde(rename = "type")]
    pub entry_type: String,
    pub content: String,
    pub confidence: f32,
    pub timestamp: Option<String>,
}