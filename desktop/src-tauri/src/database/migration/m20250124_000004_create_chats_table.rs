use sea_orm_migration::{prelude::*, schema::*};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Chats::Table)
                    .if_not_exists()
                    .col(pk_auto(Chats::Id))
                    .col(
                        string(Chats::SessionId)
                            .unique_key()
                            .default(Expr::cust("(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))))"))
                    )
                    .col(string_null(Chats::Title))
                    .col(string(Chats::LlmProvider))
                    .col(
                        timestamp_with_time_zone(Chats::CreatedAt)
                            .default(Expr::current_timestamp())
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Chats::Table).to_owned())
            .await
    }
}

#[derive(DeriveIden)]
enum Chats {
    Table,
    Id,
    SessionId,
    Title,
    LlmProvider,
    CreatedAt,
}
