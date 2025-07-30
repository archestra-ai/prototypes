use chrono::{DateTime, Utc};
use sea_orm::entity::prelude::*;
use sea_orm::{ActiveModelTrait, DatabaseBackend, Set, Statement};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use utoipa::ToSchema;

use crate::models::chat::Model as ChatModel;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize, ToSchema)]
#[sea_orm(table_name = "chat_messages")]
#[schema(as = ChatMessage)]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub chat_id: i32,
    pub created_at: DateTime<Utc>,
    #[sea_orm(column_type = "Json")]
    pub content: JsonValue,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "crate::models::chat::Entity",
        from = "Column::ChatId",
        to = "crate::models::chat::Column::Id"
    )]
    Chat,
}

impl Related<crate::models::chat::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Chat.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessageDefinition {
    pub chat_id: i32,
    pub content: JsonValue,
}

impl Model {
    pub async fn save(
        chat_session_id: String,
        content: JsonValue,
        db: &DatabaseConnection,
    ) -> Result<Model, DbErr> {
        // Find the chat by session_id to get the id
        let chat = ChatModel::load_by_session_id(chat_session_id.clone(), db)
            .await?
            .ok_or_else(|| {
                DbErr::RecordNotFound(format!("Chat not found with session_id: {chat_session_id}"))
            })?;

        let new_chat_message = ActiveModel {
            chat_id: Set(chat.id),
            content: Set(content),
            ..Default::default()
        };

        new_chat_message.insert(db).await
    }

    pub async fn count_chat_messages(
        session_id: String,
        db: &DatabaseConnection,
    ) -> Result<u64, DbErr> {
        // First find the chat by session_id to get the id
        let chat = ChatModel::load_by_session_id(session_id, db)
            .await?
            .ok_or_else(|| DbErr::RecordNotFound("Chat not found".to_string()))?;

        let result = db
            .query_one(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                "SELECT COUNT(*) as count FROM chat_messages WHERE chat_id = ?",
                vec![chat.id.into()],
            ))
            .await?
            .ok_or_else(|| DbErr::RecordNotFound("No result returned".to_string()))?;

        result.try_get_by_index::<i64>(0).map(|count| count as u64)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::chat::ActiveModel as ChatActiveModel;
    use crate::test_fixtures::database;
    use rstest::rstest;

    #[rstest]
    #[tokio::test]
    async fn test_save_chat_message(#[future] database: DatabaseConnection) {
        let db = database.await;

        // Create a chat with session_id
        let chat = ChatActiveModel {
            title: Set(Some("Test Chat".to_string())),
            llm_provider: Set("ollama".to_string()),
            session_id: Set("test-session-123".to_string()),
            ..Default::default()
        }
        .insert(&db)
        .await
        .unwrap();

        // Save a chat message using session_id
        let content = serde_json::json!({
            "role": "user",
            "content": "Hello, world!"
        });
        let message = Model::save("test-session-123".to_string(), content.clone(), &db)
            .await
            .unwrap();

        assert_eq!(message.chat_id, chat.id);
        assert_eq!(message.content, content);
    }

    #[rstest]
    #[tokio::test]
    async fn test_save_with_invalid_session_id(#[future] database: DatabaseConnection) {
        let db = database.await;

        // Try to save with non-existent session_id
        let result = Model::save(
            "non-existent-session".to_string(),
            serde_json::json!({"content": "test content"}),
            &db,
        )
        .await;

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Chat not found with session_id"));
    }

    #[rstest]
    #[tokio::test]
    async fn test_count_chat_messages(#[future] database: DatabaseConnection) {
        let db = database.await;

        // Create a chat
        let _chat = ChatActiveModel {
            title: Set(Some("Test Chat".to_string())),
            llm_provider: Set("ollama".to_string()),
            session_id: Set("count-test-session".to_string()),
            ..Default::default()
        }
        .insert(&db)
        .await
        .unwrap();

        // Initially should be 0
        let count = Model::count_chat_messages("count-test-session".to_string(), &db)
            .await
            .unwrap();
        assert_eq!(count, 0);

        // Add some messages
        for i in 0..3 {
            let content = serde_json::json!({
                "role": "user",
                "content": format!("Message {i}")
            });
            Model::save("count-test-session".to_string(), content, &db)
                .await
                .unwrap();
        }

        // Count should be 3
        let count = Model::count_chat_messages("count-test-session".to_string(), &db)
            .await
            .unwrap();
        assert_eq!(count, 3);
    }

    #[rstest]
    #[tokio::test]
    async fn test_count_with_invalid_session_id(#[future] database: DatabaseConnection) {
        let db = database.await;

        let result = Model::count_chat_messages("non-existent-session".to_string(), &db).await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Chat not found"));
    }

    #[rstest]
    #[tokio::test]
    async fn test_multiple_chats_isolation(#[future] database: DatabaseConnection) {
        let db = database.await;

        // Create two chats
        let _chat1 = ChatActiveModel {
            title: Set(Some("Chat 1".to_string())),
            llm_provider: Set("ollama".to_string()),
            session_id: Set("session-1".to_string()),
            ..Default::default()
        }
        .insert(&db)
        .await
        .unwrap();

        let _chat2 = ChatActiveModel {
            title: Set(Some("Chat 2".to_string())),
            llm_provider: Set("ollama".to_string()),
            session_id: Set("session-2".to_string()),
            ..Default::default()
        }
        .insert(&db)
        .await
        .unwrap();

        // Add messages to each chat
        Model::save(
            "session-1".to_string(),
            serde_json::json!({
                "role": "user",
                "content": "Chat 1 message"
            }),
            &db,
        )
        .await
        .unwrap();
        Model::save(
            "session-2".to_string(),
            serde_json::json!({
                "role": "user",
                "content": "Chat 2 message 1"
            }),
            &db,
        )
        .await
        .unwrap();
        Model::save(
            "session-2".to_string(),
            serde_json::json!({
                "role": "assistant",
                "content": "Chat 2 message 2"
            }),
            &db,
        )
        .await
        .unwrap();

        // Verify counts are isolated
        let count1 = Model::count_chat_messages("session-1".to_string(), &db)
            .await
            .unwrap();
        let count2 = Model::count_chat_messages("session-2".to_string(), &db)
            .await
            .unwrap();

        assert_eq!(count1, 1);
        assert_eq!(count2, 2);
    }
}
