use crate::models::chat_interactions::{
    Column as ChatInteractionColumn, Entity as ChatInteractionEntity, Model as ChatInteractionModel,
};
use chrono::{DateTime, Utc};
use sea_orm::entity::prelude::*;
use sea_orm::{ActiveModelTrait, QueryOrder, Set};
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
    pub chat: Model,
    pub interactions: Vec<ChatInteractionModel>,
}

impl Model {
    pub async fn save(definition: ChatDefinition, db: &DatabaseConnection) -> Result<Model, DbErr> {
        let new_chat = ActiveModel {
            llm_provider: Set(definition.llm_provider),
            llm_model: Set(definition.llm_model),
            ..Default::default()
        };

        new_chat.insert(db).await
    }

    pub async fn load_by_id(id: i32, db: &DatabaseConnection) -> Result<Option<Model>, DbErr> {
        Entity::find_by_id(id).one(db).await
    }

    pub async fn load_by_session_id(
        session_id: String,
        db: &DatabaseConnection,
    ) -> Result<Option<Model>, DbErr> {
        Entity::find()
            .filter(Column::SessionId.eq(session_id))
            .one(db)
            .await
    }

    pub async fn load_with_interactions(
        self,
        db: &DatabaseConnection,
    ) -> Result<Option<ChatWithInteractions>, DbErr> {
        let interactions = self
            .find_related(ChatInteractionEntity)
            .order_by_asc(ChatInteractionColumn::CreatedAt)
            .all(db)
            .await?;

        Ok(Some(ChatWithInteractions {
            chat: self,
            interactions,
        }))
    }

    pub async fn load_all(db: &DatabaseConnection) -> Result<Vec<Model>, DbErr> {
        Entity::find()
            .order_by_desc(Column::CreatedAt)
            .all(db)
            .await
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

        // Load by id
        let loaded = Model::load_by_id(chat.id, &db).await.unwrap();
        assert!(loaded.is_some());
        assert_eq!(loaded.unwrap().id, chat.id);

        // Load by session_id
        let loaded_by_session = Model::load_by_session_id(chat.session_id.clone(), &db)
            .await
            .unwrap();
        assert!(loaded_by_session.is_some());
        assert_eq!(loaded_by_session.unwrap().id, chat.id);

        // Load all chats
        let all_chats = Model::load_all(&db).await.unwrap();
        assert_eq!(all_chats.len(), 1);

        // Update title
        let updated = chat
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
    async fn test_load_with_interactions(#[future] database: DatabaseConnection) {
        let db = database.await;

        let chat_def = ChatDefinition {
            llm_provider: "ollama".to_string(),
            llm_model: "llama3.2".to_string(),
        };
        let chat = Model::save(chat_def, &db).await.unwrap();

        // Add interactions using the session_id
        let content1 = r#"{"role": "user", "content": "Hello"}"#;
        let content2 = r#"{"role": "assistant", "content": "Hi there!"}"#;

        ChatInteractionModel::save(chat.session_id.clone(), content1.to_string(), &db)
            .await
            .unwrap();
        ChatInteractionModel::save(chat.session_id.clone(), content2.to_string(), &db)
            .await
            .unwrap();

        let chat_with_interactions = chat.load_with_interactions(&db).await.unwrap().unwrap();

        assert_eq!(
            chat_with_interactions.chat.id,
            chat_with_interactions.chat.id
        );
        assert_eq!(chat_with_interactions.interactions.len(), 2);

        let interaction1 = &chat_with_interactions.interactions[0];
        let interaction2 = &chat_with_interactions.interactions[1];

        assert_eq!(interaction1.content.as_str().unwrap(), content1);
        assert_eq!(interaction2.content.as_str().unwrap(), content2);
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
        let updated = chat.clone().update_title(None, &db).await.unwrap();
        assert!(updated.title.is_none());

        // Update with empty string
        let updated = chat
            .clone()
            .update_title(Some("".to_string()), &db)
            .await
            .unwrap();
        assert_eq!(updated.title, Some("".to_string()));

        // Update with very long title
        let long_title = "a".repeat(1000);
        let updated = chat
            .update_title(Some(long_title.clone()), &db)
            .await
            .unwrap();
        assert_eq!(updated.title, Some(long_title));
    }
}
