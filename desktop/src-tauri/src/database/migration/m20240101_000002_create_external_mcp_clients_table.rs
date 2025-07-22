use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(ExternalMCPClients::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(ExternalMCPClients::ClientName)
                            .string()
                            .not_null()
                            .unique_key()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(ExternalMCPClients::IsConnected)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(ExternalMCPClients::LastConnected)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .col(ColumnDef::new(ExternalMCPClients::ConfigPath).text().null())
                    .col(
                        ColumnDef::new(ExternalMCPClients::CreatedAt)
                            .timestamp_with_time_zone()
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        ColumnDef::new(ExternalMCPClients::UpdatedAt)
                            .timestamp_with_time_zone()
                            .default(Expr::current_timestamp()),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(ExternalMCPClients::Table).to_owned())
            .await
    }
}

#[derive(DeriveIden)]
enum ExternalMCPClients {
    Table,
    ClientName,
    IsConnected,
    LastConnected,
    ConfigPath,
    CreatedAt,
    UpdatedAt,
}
