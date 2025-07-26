use crate::models::chat::{ChatDefinition, ChatWithInteractions, Model as Chat};
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::Json;
use axum::routing::{delete, get};
use axum::Router;
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use utoipa::ToSchema;

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct CreateChatRequest {
    pub llm_provider: String,
    pub llm_model: String,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct UpdateChatRequest {
    pub title: Option<String>,
}

pub struct Service {
    db: Arc<DatabaseConnection>,
}

impl Service {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db: Arc::new(db) }
    }

    pub async fn get_all_chats(&self) -> Result<Vec<ChatWithInteractions>, sea_orm::DbErr> {
        Chat::load_all(&self.db).await
    }

    pub async fn create_chat(
        &self,
        request: CreateChatRequest,
    ) -> Result<ChatWithInteractions, sea_orm::DbErr> {
        let definition = ChatDefinition {
            llm_provider: request.llm_provider,
            llm_model: request.llm_model,
        };
        Chat::save(definition, &self.db).await
    }

    pub async fn delete_chat(&self, id: String) -> Result<(), sea_orm::DbErr> {
        let id = id
            .parse::<i32>()
            .map_err(|_| sea_orm::DbErr::Custom("Invalid ID format".to_string()))?;
        Chat::delete(id, &self.db).await
    }

    pub async fn update_chat(
        &self,
        id: String,
        request: UpdateChatRequest,
    ) -> Result<ChatWithInteractions, sea_orm::DbErr> {
        let id = id
            .parse::<i32>()
            .map_err(|_| sea_orm::DbErr::Custom("Invalid ID format".to_string()))?;
        let chat = Chat::load_by_id(id, &self.db)
            .await?
            .ok_or_else(|| sea_orm::DbErr::RecordNotFound("Chat not found".to_string()))?;

        let updated_chat = chat.chat.update_title(request.title, &self.db).await?;
        Ok(ChatWithInteractions {
            chat: updated_chat,
            interactions: chat.interactions,
        })
    }
}

#[utoipa::path(
    get,
    path = "/api/chat",
    tag = "chat",
    responses(
        (status = 200, description = "List all chats", body = Vec<ChatWithInteractions>),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn get_all_chats(
    State(service): State<Arc<Service>>,
) -> Result<Json<Vec<ChatWithInteractions>>, StatusCode> {
    service
        .get_all_chats()
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

#[utoipa::path(
    post,
    path = "/api/chat",
    tag = "chat",
    request_body = CreateChatRequest,
    responses(
        (status = 201, description = "Chat created successfully", body = ChatWithInteractions),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn create_chat(
    State(service): State<Arc<Service>>,
    Json(request): Json<CreateChatRequest>,
) -> Result<(StatusCode, Json<ChatWithInteractions>), StatusCode> {
    service
        .create_chat(request)
        .await
        .map(|chat| (StatusCode::CREATED, Json(chat)))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

#[utoipa::path(
    delete,
    path = "/api/chat/{id}",
    tag = "chat",
    params(
        ("id" = String, Path, description = "Chat ID")
    ),
    responses(
        (status = 204, description = "Chat deleted successfully"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn delete_chat(
    State(service): State<Arc<Service>>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    service
        .delete_chat(id)
        .await
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

#[utoipa::path(
    patch,
    path = "/api/chat/{id}",
    tag = "chat",
    params(
        ("id" = String, Path, description = "Chat ID")
    ),
    request_body = UpdateChatRequest,
    responses(
        (status = 200, description = "Chat updated successfully", body = ChatWithInteractions),
        (status = 404, description = "Chat not found"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn update_chat(
    State(service): State<Arc<Service>>,
    Path(id): Path<String>,
    Json(request): Json<UpdateChatRequest>,
) -> Result<Json<ChatWithInteractions>, StatusCode> {
    match service.update_chat(id, request).await {
        Ok(chat) => Ok(Json(chat)),
        Err(sea_orm::DbErr::RecordNotFound(_)) => Err(StatusCode::NOT_FOUND),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

pub fn create_router(db: DatabaseConnection) -> Router {
    let service = Arc::new(Service::new(db));

    Router::new()
        .route("/", get(get_all_chats).post(create_chat))
        .route("/{id}", delete(delete_chat).patch(update_chat))
        .with_state(service)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_fixtures::database;
    use axum::body::Body;
    use axum::http::Request;
    use http_body_util::BodyExt;
    use rstest::rstest;
    use tower::ServiceExt;

    #[rstest]
    #[tokio::test]
    async fn test_create_and_get_chat(#[future] database: DatabaseConnection) {
        let db = database.await;
        let router = create_router(db.clone());

        let create_request = CreateChatRequest {
            llm_provider: "ollama".to_string(),
            llm_model: "llama3.2".to_string(),
        };

        let response = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/")
                    .header("content-type", "application/json")
                    .body(Body::from(serde_json::to_string(&create_request).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::CREATED);

        let body = response.into_body().collect().await.unwrap().to_bytes();
        let created_chat: ChatWithInteractions = serde_json::from_slice(&body).unwrap();
        assert!(created_chat.chat.title.is_none());
        assert_eq!(created_chat.chat.llm_provider, "ollama");
        assert_eq!(created_chat.chat.llm_model, "llama3.2");
        assert!(!created_chat.chat.session_id.is_empty());
    }

    #[rstest]
    #[tokio::test]
    async fn test_get_all_chats(#[future] database: DatabaseConnection) {
        let db = database.await;
        let router = create_router(db.clone());

        // Initially empty
        let response = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let chats: Vec<ChatWithInteractions> = serde_json::from_slice(&body).unwrap();
        assert_eq!(chats.len(), 0);

        // Create some chats
        for i in 0..3 {
            let create_request = CreateChatRequest {
                llm_provider: "ollama".to_string(),
                llm_model: format!("model-{i}"),
            };

            router
                .clone()
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/")
                        .header("content-type", "application/json")
                        .body(Body::from(serde_json::to_string(&create_request).unwrap()))
                        .unwrap(),
                )
                .await
                .unwrap();
        }

        // Get all chats
        let response = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let chats: Vec<ChatWithInteractions> = serde_json::from_slice(&body).unwrap();
        assert_eq!(chats.len(), 3);
        // Chats should be ordered by created_at DESC (newest first)
        assert!(chats.iter().any(|c| c.chat.llm_model == "model-0"));
        assert!(chats.iter().any(|c| c.chat.llm_model == "model-1"));
        assert!(chats.iter().any(|c| c.chat.llm_model == "model-2"));
    }

    #[rstest]
    #[tokio::test]
    async fn test_delete_chat(#[future] database: DatabaseConnection) {
        let db = database.await;
        let router = create_router(db.clone());

        let create_request = CreateChatRequest {
            llm_provider: "ollama".to_string(),
            llm_model: "llama3.2".to_string(),
        };

        let response = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/")
                    .header("content-type", "application/json")
                    .body(Body::from(serde_json::to_string(&create_request).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        let body = response.into_body().collect().await.unwrap().to_bytes();
        let created_chat: ChatWithInteractions = serde_json::from_slice(&body).unwrap();

        // Delete the chat
        let response = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri(format!("/{}", created_chat.chat.id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NO_CONTENT);

        // Verify it's deleted by checking it's not in the list
        let response = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let chats: Vec<ChatWithInteractions> = serde_json::from_slice(&body).unwrap();
        assert!(!chats.iter().any(|c| c.chat.id == created_chat.chat.id));

        // Deleting again should still return NO_CONTENT (idempotent)
        let response = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri(format!("/{}", created_chat.chat.id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NO_CONTENT);
    }

    #[rstest]
    #[tokio::test]
    async fn test_update_chat_title(#[future] database: DatabaseConnection) {
        let db = database.await;
        let router = create_router(db.clone());

        // Create a chat first
        let create_request = CreateChatRequest {
            llm_provider: "ollama".to_string(),
            llm_model: "llama3.2".to_string(),
        };

        let response = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/")
                    .header("content-type", "application/json")
                    .body(Body::from(serde_json::to_string(&create_request).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        let body = response.into_body().collect().await.unwrap().to_bytes();
        let created_chat: ChatWithInteractions = serde_json::from_slice(&body).unwrap();

        // Test updating title to a string
        let update_request = UpdateChatRequest {
            title: Some("My New Title".to_string()),
        };

        let response = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("PATCH")
                    .uri(format!("/{}", created_chat.chat.id))
                    .header("content-type", "application/json")
                    .body(Body::from(serde_json::to_string(&update_request).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = response.into_body().collect().await.unwrap().to_bytes();
        let updated_chat: ChatWithInteractions = serde_json::from_slice(&body).unwrap();
        assert_eq!(updated_chat.chat.title, Some("My New Title".to_string()));

        // Test updating title back to None
        let update_request = UpdateChatRequest { title: None };

        let response = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("PATCH")
                    .uri(format!("/{}", created_chat.chat.id))
                    .header("content-type", "application/json")
                    .body(Body::from(serde_json::to_string(&update_request).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = response.into_body().collect().await.unwrap().to_bytes();
        let updated_chat: ChatWithInteractions = serde_json::from_slice(&body).unwrap();
        assert_eq!(updated_chat.chat.title, None);
    }

    #[rstest]
    #[tokio::test]
    async fn test_update_non_existent_chat(#[future] database: DatabaseConnection) {
        let db = database.await;
        let router = create_router(db.clone());

        let update_request = UpdateChatRequest {
            title: Some("Test".to_string()),
        };

        let response = router
            .clone()
            .oneshot(
                Request::builder()
                    .method("PATCH")
                    .uri("/99999")
                    .header("content-type", "application/json")
                    .body(Body::from(serde_json::to_string(&update_request).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }
}
