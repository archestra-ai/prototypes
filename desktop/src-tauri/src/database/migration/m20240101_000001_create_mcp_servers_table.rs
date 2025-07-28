use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(MCPServers::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(MCPServers::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(MCPServers::Name)
                            .string()
                            .not_null()
                            .unique_key(),
                    )
                    .col(ColumnDef::new(MCPServers::ServerConfig).text().not_null())
                    .col(ColumnDef::new(MCPServers::Meta).text())
                    .col(
                        ColumnDef::new(MCPServers::CreatedAt)
                            .timestamp_with_time_zone()
                            .default(Expr::current_timestamp()),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(MCPServers::Table).to_owned())
            .await
    }
}

#[derive(DeriveIden)]
enum MCPServers {
    Table,
    Id,
    Name,
    ServerConfig,
    Meta,
    CreatedAt,
}
