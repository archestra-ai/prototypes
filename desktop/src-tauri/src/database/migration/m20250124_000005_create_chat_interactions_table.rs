use sea_orm_migration::{prelude::*, schema::*};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(ChatInteractions::Table)
                    .if_not_exists()
                    .col(pk_auto(ChatInteractions::Id))
                    .col(integer(ChatInteractions::ChatId))
                    .col(
                        timestamp_with_time_zone(ChatInteractions::CreatedAt)
                            .default(Expr::current_timestamp()),
                    )
                    .col(json(ChatInteractions::Content))
                    .foreign_key(
                        ForeignKey::create()
                            .from(ChatInteractions::Table, ChatInteractions::ChatId)
                            .to(Chats::Table, Chats::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // Create index on chat_id for better query performance
        manager
            .create_index(
                Index::create()
                    .name("idx_chat_interactions_chat_id")
                    .table(ChatInteractions::Table)
                    .col(ChatInteractions::ChatId)
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(ChatInteractions::Table).to_owned())
            .await
    }
}

#[derive(DeriveIden)]
enum ChatInteractions {
    Table,
    Id,
    ChatId,
    CreatedAt,
    Content,
}

#[derive(DeriveIden)]
enum Chats {
    Table,
    Id,
}
