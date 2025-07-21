use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(ExternalMcpClients::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(ExternalMcpClients::ClientName)
                            .string()
                            .not_null()
                            .unique_key()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(ExternalMcpClients::IsConnected)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(ExternalMcpClients::LastConnected)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .col(ColumnDef::new(ExternalMcpClients::ConfigPath).text().null())
                    .col(
                        ColumnDef::new(ExternalMcpClients::CreatedAt)
                            .timestamp_with_time_zone()
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        ColumnDef::new(ExternalMcpClients::UpdatedAt)
                            .timestamp_with_time_zone()
                            .default(Expr::current_timestamp()),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(ExternalMcpClients::Table).to_owned())
            .await
    }
}

#[derive(DeriveIden)]
enum ExternalMcpClients {
    Table,
    ClientName,
    IsConnected,
    LastConnected,
    ConfigPath,
    CreatedAt,
    UpdatedAt,
}
