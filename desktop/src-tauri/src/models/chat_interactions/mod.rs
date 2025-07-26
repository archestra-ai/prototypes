use chrono::{DateTime, Utc};
use sea_orm::entity::prelude::*;
use sea_orm::{ActiveModelTrait, DatabaseBackend, Set, Statement};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use utoipa::ToSchema;

use crate::models::chat::Model as ChatModel;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize, ToSchema)]
#[sea_orm(table_name = "chat_interactions")]
#[schema(as = ChatInteraction)]
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

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ChatInteractionDefinition {
    pub chat_id: i32,
    pub content: JsonValue,
}

impl Model {
    pub async fn save(
        chat_session_id: String,
        content: String,
        db: &DatabaseConnection,
    ) -> Result<Model, DbErr> {
        // Find the chat by session_id to get the id
        let chat = ChatModel::load_by_session_id(chat_session_id.clone(), db)
            .await?
            .ok_or_else(|| {
                DbErr::RecordNotFound(format!(
                    "Chat not found with session_id: {}",
                    chat_session_id
                ))
            })?;

        let new_chat_interaction = ActiveModel {
            chat_id: Set(chat.id),
            content: Set(serde_json::json!(content)),
            ..Default::default()
        };

        new_chat_interaction.insert(db).await
    }

    pub async fn count_chat_interactions(
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
                "SELECT COUNT(*) as count FROM chat_interactions WHERE chat_id = ?",
                vec![chat.id.into()],
            ))
            .await?
            .ok_or_else(|| DbErr::RecordNotFound("No result returned".to_string()))?;

        result.try_get_by_index::<i64>(0).map(|count| count as u64)
    }
}

// #[cfg(test)]
// mod tests {
//     use super::*;
//     use crate::models::chat::{ChatDefinition, Model as ChatModel};
//     use crate::test_fixtures::database;
//     use rstest::rstest;

//     #[rstest]
//     #[tokio::test]
//     async fn test_interaction_crud(#[future] database: DatabaseConnection) {
//         let db = database.await;

//         let chat_def = ChatDefinition {
//             llm_provider: "ollama".to_string(),
//             llm_model: "llama3.2".to_string(),
//         };
//         let chat = ChatModel::save(chat_def, &db).await.unwrap();

//         let interaction_def = ChatInteractionDefinition {
//             chat_id: chat.id,
//             content: serde_json::json!({
//                 "role": "user",
//                 "content": "Hello, world!"
//             }),
//         };

//         let interaction = Model::save(interaction_def, &db).await.unwrap();
//         assert_eq!(interaction.chat_id, chat.id);
//         assert_eq!(interaction.content["role"], "user");
//         assert_eq!(interaction.content["content"], "Hello, world!");

//         let interactions = Model::load_by_chat(chat.id, &db).await.unwrap();
//         assert_eq!(interactions.len(), 1);
//         assert_eq!(interactions[0].id, interaction.id);
//     }

//     #[rstest]
//     #[tokio::test]
//     async fn test_save_message_helper(#[future] database: DatabaseConnection) {
//         let db = database.await;

//         let chat_def = ChatDefinition {
//             llm_provider: "ollama".to_string(),
//             llm_model: "llama3.2".to_string(),
//         };
//         let chat = ChatModel::save(chat_def, &db).await.unwrap();

//         let interaction = Model::save_message(
//             chat.id,
//             "user".to_string(),
//             "Hello, world!".to_string(),
//             &db,
//         )
//         .await
//         .unwrap();

//         assert_eq!(interaction.chat_id, chat.id);
//         assert_eq!(interaction.content["role"], "user");
//         assert_eq!(interaction.content["content"], "Hello, world!");
//     }

//     #[rstest]
//     #[tokio::test]
//     async fn test_multiple_interactions(#[future] database: DatabaseConnection) {
//         let db = database.await;

//         let chat_def = ChatDefinition {
//             llm_provider: "ollama".to_string(),
//             llm_model: "llama3.2".to_string(),
//         };
//         let chat = ChatModel::save(chat_def, &db).await.unwrap();

//         let interactions = vec![
//             ChatInteractionDefinition {
//                 chat_id: chat.id,
//                 content: serde_json::json!({
//                     "role": "user",
//                     "content": "Hello"
//                 }),
//             },
//             ChatInteractionDefinition {
//                 chat_id: chat.id,
//                 content: serde_json::json!({
//                     "role": "assistant",
//                     "content": "Hi there!"
//                 }),
//             },
//             ChatInteractionDefinition {
//                 chat_id: chat.id,
//                 content: serde_json::json!({
//                     "role": "user",
//                     "content": "How are you?"
//                 }),
//             },
//         ];

//         for interaction_def in interactions {
//             Model::save(interaction_def, &db).await.unwrap();
//         }

//         let loaded_interactions = Model::load_by_chat(chat.id, &db).await.unwrap();
//         assert_eq!(loaded_interactions.len(), 3);
//         assert_eq!(loaded_interactions[0].content["role"], "user");
//         assert_eq!(loaded_interactions[1].content["role"], "assistant");
//         assert_eq!(loaded_interactions[2].content["role"], "user");
//     }

//     #[rstest]
//     #[tokio::test]
//     async fn test_delete_by_chat(#[future] database: DatabaseConnection) {
//         let db = database.await;

//         let chat_def = ChatDefinition {
//             llm_provider: "ollama".to_string(),
//             llm_model: "llama3.2".to_string(),
//         };
//         let chat = ChatModel::save(chat_def, &db).await.unwrap();

//         let interaction_def = ChatInteractionDefinition {
//             chat_id: chat.id,
//             content: serde_json::json!({
//                 "role": "user",
//                 "content": "Test message"
//             }),
//         };
//         Model::save(interaction_def.clone(), &db).await.unwrap();
//         Model::save(interaction_def, &db).await.unwrap();

//         let deleted = Model::delete_by_chat(chat.id, &db).await.unwrap();
//         assert_eq!(deleted, 2);

//         let interactions = Model::load_by_chat(chat.id, &db).await.unwrap();
//         assert_eq!(interactions.len(), 0);
//     }
// }
