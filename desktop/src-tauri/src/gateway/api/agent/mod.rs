use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response,
    },
    routing::post,
    Json, Router,
};
use futures_util::stream::{Stream, StreamExt};
use sea_orm::DatabaseConnection;
use serde::Deserialize;
use std::{convert::Infallible, time::Duration};
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

mod types;
use types::*;

/// Create the agent router with SSE endpoints
pub fn create_router(db: DatabaseConnection) -> Router {
    Router::new()
        .route("/chat", post(handle_agent_chat).options(handle_options))
        .with_state(db)
}

/// Handle OPTIONS requests for CORS preflight
async fn handle_options() -> Result<Response, StatusCode> {
    let mut headers = HeaderMap::new();
    headers.insert("Access-Control-Allow-Origin", "*".parse().unwrap());
    headers.insert("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS".parse().unwrap());
    headers.insert("Access-Control-Allow-Headers", "Content-Type, Authorization".parse().unwrap());
    headers.insert("Access-Control-Max-Age", "3600".parse().unwrap());
    
    Ok((headers, "").into_response())
}

/// Request body for agent chat endpoint
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct AgentChatRequest {
    messages: Vec<ChatMessage>,
    #[serde(default)]
    agent_context: Option<AgentContext>,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    stream: Option<bool>,
}

/// Handle agent chat requests with SSE streaming
async fn handle_agent_chat(
    State(db): State<DatabaseConnection>,
    Json(payload): Json<AgentChatRequest>,
) -> Result<Response, StatusCode> {
    // Default to streaming unless explicitly set to false
    let should_stream = payload.stream.unwrap_or(true);
    
    if !should_stream {
        // Non-streaming response (not implemented yet)
        return Err(StatusCode::NOT_IMPLEMENTED);
    }
    
    // Create SSE stream
    let stream = create_agent_stream(db, payload).await;
    
    // Build response with CORS headers
    let mut headers = HeaderMap::new();
    headers.insert("Access-Control-Allow-Origin", "*".parse().unwrap());
    headers.insert("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS".parse().unwrap());
    headers.insert("Access-Control-Allow-Headers", "Content-Type, Authorization".parse().unwrap());
    headers.insert("Cache-Control", "no-cache".parse().unwrap());
    
    let sse = Sse::new(stream)
        .keep_alive(KeepAlive::new().interval(Duration::from_secs(30)));
    
    Ok((headers, sse).into_response())
}

/// Create the SSE stream for agent responses
async fn create_agent_stream(
    db: DatabaseConnection,
    request: AgentChatRequest,
) -> impl Stream<Item = Result<Event, Infallible>> {
    let (tx, rx) = mpsc::channel::<SseMessage>(100);
    
    // Spawn task to handle agent execution
    tokio::spawn(async move {
        if let Err(e) = execute_agent_stream(db, request, tx.clone()).await {
            // Send error event
            let _ = tx.send(SseMessage::Error {
                error: format!("Agent execution failed: {}", e),
            }).await;
        }
    });
    
    // Convert receiver to SSE events
    ReceiverStream::new(rx).map(|msg| {
        Ok(match msg {
            SseMessage::MessageStart { id, role } => {
                Event::default()
                    .event("message_start")
                    .data(serde_json::to_string(&MessageStartEvent { id, role }).unwrap())
            }
            SseMessage::ContentDelta { delta } => {
                Event::default()
                    .event("content_delta")
                    .data(serde_json::to_string(&ContentDeltaEvent { delta }).unwrap())
            }
            SseMessage::ToolCallStart { tool_call_id, tool_name } => {
                Event::default()
                    .event("tool_call_start")
                    .data(serde_json::to_string(&ToolCallStartEvent {
                        tool_call_id,
                        tool_name,
                    }).unwrap())
            }
            SseMessage::ToolCallDelta { tool_call_id, args_delta } => {
                Event::default()
                    .event("tool_call_delta")
                    .data(serde_json::to_string(&ToolCallDeltaEvent {
                        tool_call_id,
                        args_delta,
                    }).unwrap())
            }
            SseMessage::ToolCallResult { tool_call_id, tool_name, result } => {
                Event::default()
                    .event("tool_call_result")
                    .data(serde_json::to_string(&ToolCallResultEvent {
                        tool_call_id,
                        tool_name,
                        result,
                    }).unwrap())
            }
            SseMessage::DataPart { data_type, data } => {
                Event::default()
                    .event("data_part")
                    .data(serde_json::to_string(&DataPartEvent {
                        data_type,
                        data,
                    }).unwrap())
            }
            SseMessage::MessageComplete { usage } => {
                Event::default()
                    .event("message_complete")
                    .data(serde_json::to_string(&MessageCompleteEvent { usage }).unwrap())
            }
            SseMessage::Error { error } => {
                Event::default()
                    .event("error")
                    .data(serde_json::to_string(&ErrorEvent { error }).unwrap())
            }
            SseMessage::Ping => {
                Event::default()
                    .event("ping")
                    .data("{}")
            }
        })
    })
}

/// Execute agent and stream results
async fn execute_agent_stream(
    _db: DatabaseConnection,
    request: AgentChatRequest,
    tx: mpsc::Sender<SseMessage>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Start message
    let message_id = uuid::Uuid::new_v4().to_string();
    tx.send(SseMessage::MessageStart {
        id: message_id.clone(),
        role: "assistant".to_string(),
    }).await?;
    
    // TODO: Integrate with actual agent execution
    // For now, simulate a simple response
    
    // Send some content
    let test_content = "I'll help you with that. Let me process your request...";
    for chunk in test_content.chars().collect::<Vec<_>>().chunks(5) {
        tx.send(SseMessage::ContentDelta {
            delta: chunk.iter().collect(),
        }).await?;
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    
    // If agent context has tools, simulate a tool call
    if let Some(context) = request.agent_context {
        if let Some(tools) = context.tools {
            if !tools.is_empty() {
                // Simulate tool call
                let tool_call_id = uuid::Uuid::new_v4().to_string();
                let tool_name = tools[0].clone();
                
                tx.send(SseMessage::ToolCallStart {
                    tool_call_id: tool_call_id.clone(),
                    tool_name: tool_name.clone(),
                }).await?;
                
                // Simulate tool arguments
                let args = r#"{"path": "/tmp/test.txt"}"#;
                tx.send(SseMessage::ToolCallDelta {
                    tool_call_id: tool_call_id.clone(),
                    args_delta: args.to_string(),
                }).await?;
                
                // Simulate tool result
                tokio::time::sleep(Duration::from_millis(200)).await;
                tx.send(SseMessage::ToolCallResult {
                    tool_call_id,
                    tool_name,
                    result: serde_json::json!({
                        "content": "File contents here..."
                    }),
                }).await?;
            }
        }
    }
    
    // Send reasoning data
    tx.send(SseMessage::DataPart {
        data_type: "reasoning".to_string(),
        data: serde_json::json!({
            "type": "planning",
            "content": "Analyzing the request and determining the best approach...",
            "confidence": 0.9,
        }),
    }).await?;
    
    // Send more content after tool execution
    let final_content = "\n\nBased on my analysis, here's what I found...";
    for chunk in final_content.chars().collect::<Vec<_>>().chunks(5) {
        tx.send(SseMessage::ContentDelta {
            delta: chunk.iter().collect(),
        }).await?;
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    
    // Complete message
    tx.send(SseMessage::MessageComplete {
        usage: Some(UsageStats {
            prompt_tokens: 150,
            completion_tokens: 50,
            total_tokens: 200,
        }),
    }).await?;
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use tower::ServiceExt;

    #[tokio::test]
    async fn test_agent_chat_endpoint() {
        // Mock database connection
        let db = sea_orm::DatabaseConnection::default();
        let app = create_router(db);

        let request = Request::builder()
            .method("POST")
            .uri("/chat")
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::to_string(&AgentChatRequest {
                    messages: vec![ChatMessage {
                        role: "user".to_string(),
                        content: "Hello, agent!".to_string(),
                    }],
                    agent_context: None,
                    model: Some("llama3.2".to_string()),
                    stream: Some(true),
                })
                .unwrap(),
            ))
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        
        // Verify it's an SSE response
        let content_type = response.headers().get("content-type").unwrap();
        assert_eq!(content_type, "text/event-stream");
    }
}