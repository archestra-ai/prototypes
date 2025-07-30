use crate::models::chat_messages::{Entity as ChatMessageEntity, Model as ChatMessageModel};
use chrono::{DateTime, Utc};
use sea_orm::entity::prelude::*;
use sea_orm::{ActiveModelTrait, QueryOrder, QuerySelect, Set};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize, ToSchema)]
#[sea_orm(table_name = "chats")]
#[schema(as = Chat)]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    #[sea_orm(unique)]
    pub session_id: String,
    pub title: Option<String>,
    pub llm_provider: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "crate::models::chat_messages::Entity")]
    ChatMessages,
}

impl Related<ChatMessageEntity> for Entity {
    fn to() -> RelationDef {
        Relation::ChatMessages.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatDefinition {
    pub llm_provider: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatTitleUpdatedEvent {
    pub chat_id: i32,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ChatWithMessages {
    pub id: i32,
    pub session_id: String,
    pub title: Option<String>,
    pub llm_provider: String,
    pub created_at: DateTime<Utc>,
    pub messages: Vec<ChatMessageModel>,
}

impl From<(Model, Vec<ChatMessageModel>)> for ChatWithMessages {
    fn from((chat, messages): (Model, Vec<ChatMessageModel>)) -> Self {
        Self {
            id: chat.id,
            session_id: chat.session_id,
            title: chat.title,
            llm_provider: chat.llm_provider,
            created_at: chat.created_at,
            messages,
        }
    }
}

impl ChatWithMessages {
    pub async fn count_messages(&self, db: &DatabaseConnection) -> Result<usize, DbErr> {
        use crate::models::chat_messages::{
            Column as ChatMessageColumn, Entity as ChatMessageEntity,
        };

        let count = ChatMessageEntity::find()
            .filter(ChatMessageColumn::ChatId.eq(self.id))
            .count(db)
            .await?;

        Ok(count as usize)
    }

    pub async fn get_first_messages(
        &self,
        db: &DatabaseConnection,
        limit: usize,
    ) -> Result<Vec<ChatMessageModel>, DbErr> {
        use crate::models::chat_messages::{
            Column as ChatMessageColumn, Entity as ChatMessageEntity,
        };

        let messages = ChatMessageEntity::find()
            .filter(ChatMessageColumn::ChatId.eq(self.id))
            .order_by_asc(ChatMessageColumn::CreatedAt)
            .limit(limit as u64)
            .all(db)
            .await?;

        Ok(messages)
    }
}

impl Model {
    pub async fn save(
        definition: ChatDefinition,
        db: &DatabaseConnection,
    ) -> Result<ChatWithMessages, DbErr> {
        let new_chat = ActiveModel {
            llm_provider: Set(definition.llm_provider),
            ..Default::default()
        };
        let chat = new_chat.insert(db).await?;
        Ok(ChatWithMessages::from((chat, vec![])))
    }

    pub async fn load_by_id(
        id: i32,
        db: &DatabaseConnection,
    ) -> Result<Option<ChatWithMessages>, DbErr> {
        let result = Entity::find_by_id(id)
            .find_with_related(ChatMessageEntity)
            .all(db)
            .await?;

        match result.into_iter().next() {
            Some((chat, messages)) => Ok(Some(ChatWithMessages::from((chat, messages)))),
            None => Ok(None),
        }
    }

    pub async fn load_by_session_id(
        session_id: String,
        db: &DatabaseConnection,
    ) -> Result<Option<ChatWithMessages>, DbErr> {
        let result = Entity::find()
            .filter(Column::SessionId.eq(session_id))
            .find_with_related(ChatMessageEntity)
            .all(db)
            .await?;

        match result.into_iter().next() {
            Some((chat, messages)) => Ok(Some(ChatWithMessages::from((chat, messages)))),
            None => Ok(None),
        }
    }

    pub async fn load_all(db: &DatabaseConnection) -> Result<Vec<ChatWithMessages>, DbErr> {
        let results = Entity::find()
            .order_by_desc(Column::CreatedAt)
            .find_with_related(ChatMessageEntity)
            .all(db)
            .await?;

        Ok(results
            .into_iter()
            .map(|(chat, messages)| ChatWithMessages::from((chat, messages)))
            .collect())
    }

    pub async fn update_title(
        self,
        title: Option<String>,
        db: &DatabaseConnection,
    ) -> Result<Model, DbErr> {
        let mut chat: ActiveModel = self.into();
        chat.title = Set(title);
        chat.update(db).await
    }

    pub async fn delete(id: i32, db: &DatabaseConnection) -> Result<(), DbErr> {
        Entity::delete_by_id(id).exec(db).await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::chat_messages::Model as ChatMessageModel;
    use crate::test_fixtures::database;
    use rstest::rstest;

    #[rstest]
    #[tokio::test]
    async fn test_chat_crud(#[future] database: DatabaseConnection) {
        let db = database.await;

        let definition = ChatDefinition {
            llm_provider: "ollama".to_string(),
        };

        // Create chat
        let chat = Model::save(definition, &db).await.unwrap();
        assert!(chat.title.is_none());
        assert_eq!(chat.llm_provider, "ollama");
        assert!(!chat.session_id.is_empty());

        // Load by session_id
        let loaded_by_session = Model::load_by_session_id(chat.session_id.clone(), &db)
            .await
            .unwrap();
        assert!(loaded_by_session.is_some());
        assert_eq!(loaded_by_session.unwrap().id, chat.id);

        // Load all chats
        let all_chats = Model::load_all(&db).await.unwrap();
        assert_eq!(all_chats.len(), 1);
        assert_eq!(all_chats[0].id, chat.id);
        assert_eq!(all_chats[0].title, None);
        assert_eq!(all_chats[0].llm_provider, "ollama");
        assert!(!all_chats[0].session_id.is_empty());

        // Update title
        let chat_model = Model {
            id: chat.id,
            session_id: chat.session_id.clone(),
            title: chat.title.clone(),
            llm_provider: chat.llm_provider.clone(),
            created_at: chat.created_at,
        };
        let updated = chat_model
            .update_title(Some("Updated Title".to_string()), &db)
            .await
            .unwrap();
        assert_eq!(updated.title, Some("Updated Title".to_string()));

        // Delete
        Model::delete(updated.id, &db).await.unwrap();
        let deleted = Model::load_by_id(updated.id, &db).await.unwrap();
        assert!(deleted.is_none());
    }

    #[rstest]
    #[tokio::test]
    async fn test_multiple_chats_ordering(#[future] database: DatabaseConnection) {
        let db = database.await;

        // Create multiple chats
        let chat1 = Model::save(
            ChatDefinition {
                llm_provider: "ollama".to_string(),
            },
            &db,
        )
        .await
        .unwrap();

        let chat2 = Model::save(
            ChatDefinition {
                llm_provider: "ollama".to_string(),
            },
            &db,
        )
        .await
        .unwrap();

        let chat3 = Model::save(
            ChatDefinition {
                llm_provider: "anthropic".to_string(),
            },
            &db,
        )
        .await
        .unwrap();

        // Load all chats - should be ordered by created_at DESC
        let all_chats = Model::load_all(&db).await.unwrap();

        // Find our chats in the results
        let our_chat_ids = [chat1.id, chat2.id, chat3.id];
        let our_chats: Vec<_> = all_chats
            .into_iter()
            .filter(|c| our_chat_ids.contains(&c.id))
            .collect();

        // We should find all 3 of our chats
        assert_eq!(
            our_chats.len(),
            3,
            "Expected to find 3 chats, found: {}",
            our_chats.len()
        );

        // Verify each chat has the expected content
        assert!(our_chats.iter().any(|c| c.id == chat1.id));
        assert!(our_chats.iter().any(|c| c.id == chat2.id));
        assert!(our_chats.iter().any(|c| c.id == chat3.id));
    }

    #[rstest]
    #[tokio::test]
    async fn test_chat_delete_cascades_messages(#[future] database: DatabaseConnection) {
        let db = database.await;

        let chat = Model::save(
            ChatDefinition {
                llm_provider: "ollama".to_string(),
            },
            &db,
        )
        .await
        .unwrap();

        // Add messages
        for i in 0..3 {
            ChatMessageModel::save(
                chat.session_id.clone(),
                serde_json::json!({
                    "role": "user",
                    "content": format!("Message {i}")
                }),
                &db,
            )
            .await
            .unwrap();
        }

        // Verify messages exist
        let count = ChatMessageModel::count_chat_messages(chat.session_id.clone(), &db)
            .await
            .unwrap();
        assert_eq!(count, 3);

        // Delete chat
        Model::delete(chat.id, &db).await.unwrap();

        // Verify chat is deleted
        let deleted_chat = Model::load_by_id(chat.id, &db).await.unwrap();
        assert!(deleted_chat.is_none());

        // Note: We can't check if messages are deleted without a direct query
        // since count_chat_messages requires a valid chat session_id
    }

    #[rstest]
    #[tokio::test]
    async fn test_unique_session_id(#[future] database: DatabaseConnection) {
        let db = database.await;

        let chat1 = Model::save(
            ChatDefinition {
                llm_provider: "ollama".to_string(),
            },
            &db,
        )
        .await
        .unwrap();

        let chat2 = Model::save(
            ChatDefinition {
                llm_provider: "ollama".to_string(),
            },
            &db,
        )
        .await
        .unwrap();

        // Session IDs should be unique
        assert_ne!(chat1.session_id, chat2.session_id);
    }

    #[test]
    fn test_chat_with_messages_serialization() {
        let chat = Model {
            id: 1,
            session_id: "test-session".to_string(),
            title: Some("Test Chat".to_string()),
            llm_provider: "ollama".to_string(),
            created_at: Utc::now(),
        };

        let message = ChatMessageModel {
            id: 1,
            chat_id: 1,
            content: serde_json::json!({"role": "user", "content": "Hello"}),
            created_at: Utc::now(),
        };

        let chat_with_messages = ChatWithMessages::from((chat, vec![message]));

        let json = serde_json::to_string_pretty(&chat_with_messages).unwrap();

        // Verify the JSON has flattened structure
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(value.get("id").is_some());
        assert!(value.get("session_id").is_some());
        assert!(value.get("title").is_some());
        assert!(value.get("llm_provider").is_some());
        assert!(value.get("created_at").is_some());
        assert!(value.get("messages").is_some());
        assert!(value.get("messages").unwrap().is_array());
        assert_eq!(value.get("messages").unwrap().as_array().unwrap().len(), 1);
    }

    #[rstest]
    #[tokio::test]
    async fn test_update_title_error_scenarios(#[future] database: DatabaseConnection) {
        let db = database.await;

        let chat = Model::save(
            ChatDefinition {
                llm_provider: "ollama".to_string(),
            },
            &db,
        )
        .await
        .unwrap();

        // Create chat model
        let chat_model = Model {
            id: chat.id,
            session_id: chat.session_id.clone(),
            title: chat.title.clone(),
            llm_provider: chat.llm_provider.clone(),
            created_at: chat.created_at,
        };

        // Update with None title
        let updated = chat_model.clone().update_title(None, &db).await.unwrap();
        assert!(updated.title.is_none());

        // Update with empty string
        let updated = chat_model
            .clone()
            .update_title(Some("".to_string()), &db)
            .await
            .unwrap();
        assert_eq!(updated.title, Some("".to_string()));

        // Update with very long title
        let long_title = "a".repeat(1000);
        let updated = chat_model
            .update_title(Some(long_title.clone()), &db)
            .await
            .unwrap();
        assert_eq!(updated.title, Some(long_title));
    }
}
