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
) -> Result<Json<ChatWithInteractions>, StatusCode> {
    service
        .create_chat(request)
        .await
        .map(Json)
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
        (status = 404, description = "Chat not found"),
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
        .map_err(|e| match e {
            sea_orm::DbErr::RecordNotFound(_) => StatusCode::NOT_FOUND,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        })
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
    service
        .update_chat(id, request)
        .await
        .map(Json)
        .map_err(|e| match e {
            sea_orm::DbErr::RecordNotFound(_) => StatusCode::NOT_FOUND,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        })
}

pub fn create_crud_router(db: DatabaseConnection) -> Router {
    let service = Arc::new(Service::new(db));

    Router::new()
        .route("/", get(get_all_chats).post(create_chat))
        .route("/{id}", delete(delete_chat).patch(update_chat))
        .with_state(service)
}
