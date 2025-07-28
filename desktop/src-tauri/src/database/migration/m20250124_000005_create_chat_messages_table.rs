use sea_orm_migration::{prelude::*, schema::*};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(ChatMessages::Table)
                    .if_not_exists()
                    .col(pk_auto(ChatMessages::Id))
                    .col(integer(ChatMessages::ChatId))
                    .col(
                        timestamp_with_time_zone(ChatMessages::CreatedAt)
                            .default(Expr::current_timestamp()),
                    )
                    .col(json(ChatMessages::Content))
                    .foreign_key(
                        ForeignKey::create()
                            .from(ChatMessages::Table, ChatMessages::ChatId)
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
                    .name("idx_chat_messages_chat_id")
                    .table(ChatMessages::Table)
                    .col(ChatMessages::ChatId)
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(ChatMessages::Table).to_owned())
            .await
    }
}

#[derive(DeriveIden)]
enum ChatMessages {
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
