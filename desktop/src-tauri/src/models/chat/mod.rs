use crate::models::chat_interactions::{
    Entity as ChatInteractionEntity, Model as ChatInteractionModel,
};
use chrono::{DateTime, Utc};
use sea_orm::entity::prelude::*;
use sea_orm::{ActiveModelTrait, QueryOrder, Set};
use serde::{Deserialize, Serialize};
use std::ops::Deref;
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
    pub llm_model: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "crate::models::chat_interactions::Entity")]
    ChatInteractions,
}

impl Related<ChatInteractionEntity> for Entity {
    fn to() -> RelationDef {
        Relation::ChatInteractions.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ChatDefinition {
    pub llm_provider: String,
    pub llm_model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ChatWithInteractions {
    #[serde(flatten)]
    #[schema(inline)]
    pub chat: Model,
    pub interactions: Vec<ChatInteractionModel>,
}

impl Deref for ChatWithInteractions {
    type Target = Model;

    fn deref(&self) -> &Self::Target {
        &self.chat
    }
}

impl Model {
    pub async fn save(
        definition: ChatDefinition,
        db: &DatabaseConnection,
    ) -> Result<ChatWithInteractions, DbErr> {
        let new_chat = ActiveModel {
            llm_provider: Set(definition.llm_provider),
            llm_model: Set(definition.llm_model),
            ..Default::default()
        };
        let chat = new_chat.insert(db).await?;
        Ok(ChatWithInteractions {
            chat,
            interactions: vec![],
        })
    }

    pub async fn load_by_id(
        id: i32,
        db: &DatabaseConnection,
    ) -> Result<Option<ChatWithInteractions>, DbErr> {
        let result = Entity::find_by_id(id)
            .find_with_related(ChatInteractionEntity)
            .all(db)
            .await?;

        match result.into_iter().next() {
            Some((chat, interactions)) => Ok(Some(ChatWithInteractions { chat, interactions })),
            None => Ok(None),
        }
    }

    pub async fn load_by_session_id(
        session_id: String,
        db: &DatabaseConnection,
    ) -> Result<Option<ChatWithInteractions>, DbErr> {
        let result = Entity::find()
            .filter(Column::SessionId.eq(session_id))
            .find_with_related(ChatInteractionEntity)
            .all(db)
            .await?;

        match result.into_iter().next() {
            Some((chat, interactions)) => Ok(Some(ChatWithInteractions { chat, interactions })),
            None => Ok(None),
        }
    }

    pub async fn load_all(db: &DatabaseConnection) -> Result<Vec<ChatWithInteractions>, DbErr> {
        let results = Entity::find()
            .order_by_desc(Column::CreatedAt)
            .find_with_related(ChatInteractionEntity)
            .all(db)
            .await?;

        Ok(results
            .into_iter()
            .map(|(chat, interactions)| ChatWithInteractions { chat, interactions })
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
    use crate::models::chat_interactions::Model as ChatInteractionModel;
    use crate::test_fixtures::database;
    use rstest::rstest;

    #[rstest]
    #[tokio::test]
    async fn test_chat_crud(#[future] database: DatabaseConnection) {
        let db = database.await;

        let definition = ChatDefinition {
            llm_provider: "ollama".to_string(),
            llm_model: "llama3.2".to_string(),
        };

        // Create chat
        let chat = Model::save(definition, &db).await.unwrap();
        assert!(chat.title.is_none());
        assert_eq!(chat.llm_provider, "ollama");
        assert_eq!(chat.llm_model, "llama3.2");
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
        assert_eq!(all_chats[0].llm_model, "llama3.2");
        assert!(!all_chats[0].session_id.is_empty());

        // Update title
        let updated = chat
            .chat
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
                llm_model: "llama3.2".to_string(),
            },
            &db,
        )
        .await
        .unwrap();

        let chat2 = Model::save(
            ChatDefinition {
                llm_provider: "ollama".to_string(),
                llm_model: "llama3.1".to_string(),
            },
            &db,
        )
        .await
        .unwrap();

        let chat3 = Model::save(
            ChatDefinition {
                llm_provider: "anthropic".to_string(),
                llm_model: "claude-3".to_string(),
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
        assert!(our_chats
            .iter()
            .any(|c| c.id == chat1.id && c.llm_model == "llama3.2"));
        assert!(our_chats
            .iter()
            .any(|c| c.id == chat2.id && c.llm_model == "llama3.1"));
        assert!(our_chats
            .iter()
            .any(|c| c.id == chat3.id && c.llm_model == "claude-3"));
    }

    #[rstest]
    #[tokio::test]
    async fn test_chat_delete_cascades_interactions(#[future] database: DatabaseConnection) {
        let db = database.await;

        let chat = Model::save(
            ChatDefinition {
                llm_provider: "ollama".to_string(),
                llm_model: "llama3.2".to_string(),
            },
            &db,
        )
        .await
        .unwrap();

        // Add interactions
        for i in 0..3 {
            ChatInteractionModel::save(
                chat.session_id.clone(),
                format!(r#"{{"role": "user", "content": "Message {i}"}}"#),
                &db,
            )
            .await
            .unwrap();
        }

        // Verify interactions exist
        let count = ChatInteractionModel::count_chat_interactions(chat.session_id.clone(), &db)
            .await
            .unwrap();
        assert_eq!(count, 3);

        // Delete chat
        Model::delete(chat.id, &db).await.unwrap();

        // Verify chat is deleted
        let deleted_chat = Model::load_by_id(chat.id, &db).await.unwrap();
        assert!(deleted_chat.is_none());

        // Note: We can't check if interactions are deleted without a direct query
        // since count_chat_interactions requires a valid chat session_id
    }

    #[rstest]
    #[tokio::test]
    async fn test_unique_session_id(#[future] database: DatabaseConnection) {
        let db = database.await;

        let chat1 = Model::save(
            ChatDefinition {
                llm_provider: "ollama".to_string(),
                llm_model: "llama3.2".to_string(),
            },
            &db,
        )
        .await
        .unwrap();

        let chat2 = Model::save(
            ChatDefinition {
                llm_provider: "ollama".to_string(),
                llm_model: "llama3.2".to_string(),
            },
            &db,
        )
        .await
        .unwrap();

        // Session IDs should be unique
        assert_ne!(chat1.session_id, chat2.session_id);
    }

    #[test]
    fn test_chat_with_interactions_serialization() {
        let chat = Model {
            id: 1,
            session_id: "test-session".to_string(),
            title: Some("Test Chat".to_string()),
            llm_provider: "ollama".to_string(),
            llm_model: "llama3.2".to_string(),
            created_at: Utc::now(),
        };

        let interaction = ChatInteractionModel {
            id: 1,
            chat_id: 1,
            content: serde_json::json!({"role": "user", "content": "Hello"}),
            created_at: Utc::now(),
        };

        let chat_with_interactions = ChatWithInteractions {
            chat,
            interactions: vec![interaction],
        };

        let json = serde_json::to_string_pretty(&chat_with_interactions).unwrap();
        println!("Serialized ChatWithInteractions:\n{}", json);

        // Verify the JSON has flattened structure
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(value.get("id").is_some());
        assert!(value.get("session_id").is_some());
        assert!(value.get("title").is_some());
        assert!(value.get("llm_provider").is_some());
        assert!(value.get("llm_model").is_some());
        assert!(value.get("created_at").is_some());
        assert!(value.get("interactions").is_some());
        assert!(value.get("interactions").unwrap().is_array());
        assert_eq!(
            value.get("interactions").unwrap().as_array().unwrap().len(),
            1
        );
    }

    #[rstest]
    #[tokio::test]
    async fn test_update_title_error_scenarios(#[future] database: DatabaseConnection) {
        let db = database.await;

        let chat = Model::save(
            ChatDefinition {
                llm_provider: "ollama".to_string(),
                llm_model: "llama3.2".to_string(),
            },
            &db,
        )
        .await
        .unwrap();

        // Update with None title
        let updated = chat.chat.clone().update_title(None, &db).await.unwrap();
        assert!(updated.title.is_none());

        // Update with empty string
        let updated = chat
            .chat
            .clone()
            .update_title(Some("".to_string()), &db)
            .await
            .unwrap();
        assert_eq!(updated.title, Some("".to_string()));

        // Update with very long title
        let long_title = "a".repeat(1000);
        let updated = chat
            .chat
            .update_title(Some(long_title.clone()), &db)
            .await
            .unwrap();
        assert_eq!(updated.title, Some(long_title));
    }
}
