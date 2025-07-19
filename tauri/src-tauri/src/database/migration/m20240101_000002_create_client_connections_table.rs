use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(ClientConnections::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(ClientConnections::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(ClientConnections::ClientName)
                            .string()
                            .not_null()
                            .unique_key(),
                    )
                    .col(
                        ColumnDef::new(ClientConnections::IsConnected)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(ClientConnections::LastConnected)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(ClientConnections::ConfigPath)
                            .text()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(ClientConnections::CreatedAt)
                            .timestamp_with_time_zone()
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        ColumnDef::new(ClientConnections::UpdatedAt)
                            .timestamp_with_time_zone()
                            .default(Expr::current_timestamp()),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(ClientConnections::Table).to_owned())
            .await
    }
}

#[derive(DeriveIden)]
enum ClientConnections {
    Table,
    Id,
    ClientName,
    IsConnected,
    LastConnected,
    ConfigPath,
    CreatedAt,
    UpdatedAt,
}