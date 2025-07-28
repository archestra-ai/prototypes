use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Drop the meta column from mcp_servers table
        manager
            .alter_table(
                Table::alter()
                    .table(MCPServers::Table)
                    .drop_column(MCPServers::Meta)
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Re-add the meta column as nullable text
        manager
            .alter_table(
                Table::alter()
                    .table(MCPServers::Table)
                    .add_column(ColumnDef::new(MCPServers::Meta).text())
                    .to_owned(),
            )
            .await
    }
}

#[derive(DeriveIden)]
enum MCPServers {
    Table,
    Meta,
}