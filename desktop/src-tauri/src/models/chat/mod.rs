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

// #[cfg(test)]
// mod tests {
//     use super::*;
//     use crate::test_fixtures::database;
//     use rstest::rstest;

//     #[rstest]
//     #[tokio::test]
//     async fn test_chat_crud(#[future] database: DatabaseConnection) {
//         let db = database.await;

//         let definition = ChatDefinition {
//             llm_provider: "ollama".to_string(),
//             llm_model: "llama3.2".to_string(),
//         };

//         let chat = Model::save(definition, &db).await.unwrap();
//         assert!(chat.title.is_none());
//         assert_eq!(chat.llm_provider, "ollama");
//         assert_eq!(chat.llm_model, "llama3.2");

//         let loaded = Model::load(chat.id, &db).await.unwrap();
//         assert!(loaded.is_some());
//         assert_eq!(loaded.unwrap().id, chat.id);

//         let all_chats = Model::load_all(&db).await.unwrap();
//         assert_eq!(all_chats.len(), 1);

//         let updated = Model::update_title(chat.id, Some("Updated Title".to_string()), &db)
//             .await
//             .unwrap();
//         assert_eq!(updated.title, Some("Updated Title".to_string()));

//         Model::delete(chat.id, &db).await.unwrap();
//         let deleted = Model::load(chat.id, &db).await.unwrap();
//         assert!(deleted.is_none());
//     }

//     #[rstest]
//     #[tokio::test]
//     async fn test_load_with_interactions(#[future] database: DatabaseConnection) {
//         let db = database.await;

//         let chat_def = ChatDefinition {
//             llm_provider: "ollama".to_string(),
//             llm_model: "llama3.2".to_string(),
//         };
//         let chat = Model::save(chat_def, &db).await.unwrap();

//         let interaction_def1 = crate::models::chat_interactions::ChatInteractionDefinition {
//             chat_id: chat.id,
//             content: serde_json::json!({
//                 "role": "user",
//                 "content": "Hello"
//             }),
//         };
//         let interaction_def2 = crate::models::chat_interactions::ChatInteractionDefinition {
//             chat_id: chat.id,
//             content: serde_json::json!({
//                 "role": "assistant",
//                 "content": "Hi there!"
//             }),
//         };

//         crate::models::chat_interactions::Model::save(interaction_def1, &db)
//             .await
//             .unwrap();
//         crate::models::chat_interactions::Model::save(interaction_def2, &db)
//             .await
//             .unwrap();

//         let chat_with_interactions = Model::load_with_interactions(chat.id, &db)
//             .await
//             .unwrap()
//             .unwrap();

//         assert_eq!(chat_with_interactions.chat.id, chat.id);
//         assert_eq!(chat_with_interactions.interactions.len(), 2);
//         assert_eq!(chat_with_interactions.interactions[0].content["role"], "user");
//         assert_eq!(chat_with_interactions.interactions[1].content["role"], "assistant");
//     }

//     #[rstest]
//     #[tokio::test]
//     async fn test_count_interactions(#[future] database: DatabaseConnection) {
//         let db = database.await;

//         let chat_def = ChatDefinition {
//             llm_provider: "ollama".to_string(),
//             llm_model: "llama3.2".to_string(),
//         };
//         let chat = Model::save(chat_def, &db).await.unwrap();

//         let count = Model::count_interactions(chat.id, &db).await.unwrap();
//         assert_eq!(count, 0);

//         let interaction_def = crate::models::chat_interactions::ChatInteractionDefinition {
//             chat_id: chat.id,
//             content: serde_json::json!({
//                 "role": "user",
//                 "content": "Test"
//             }),
//         };
//         crate::models::chat_interactions::Model::save(interaction_def, &db)
//             .await
//             .unwrap();

//         let count = Model::count_interactions(chat.id, &db).await.unwrap();
//         assert_eq!(count, 1);
//     }
// }
