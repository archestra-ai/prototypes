use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(McpRequestLogs::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(McpRequestLogs::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(McpRequestLogs::RequestId)
                            .string()
                            .not_null()
                            .unique_key(),
                    )
                    .col(ColumnDef::new(McpRequestLogs::SessionId).string().null())
                    .col(ColumnDef::new(McpRequestLogs::McpSessionId).string().null())
                    .col(
                        ColumnDef::new(McpRequestLogs::ServerName)
                            .string()
                            .not_null(),
                    )
                    .col(ColumnDef::new(McpRequestLogs::ClientInfo).text().null())
                    .col(ColumnDef::new(McpRequestLogs::Method).string().null())
                    .col(ColumnDef::new(McpRequestLogs::RequestHeaders).text().null())
                    .col(ColumnDef::new(McpRequestLogs::RequestBody).text().null())
                    .col(ColumnDef::new(McpRequestLogs::ResponseBody).text().null())
                    .col(
                        ColumnDef::new(McpRequestLogs::ResponseHeaders)
                            .text()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(McpRequestLogs::StatusCode)
                            .integer()
                            .not_null(),
                    )
                    .col(ColumnDef::new(McpRequestLogs::ErrorMessage).text().null())
                    .col(ColumnDef::new(McpRequestLogs::DurationMs).integer().null())
                    .col(
                        ColumnDef::new(McpRequestLogs::Timestamp)
                            .timestamp()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .to_owned(),
            )
            .await?;

        // Add indexes for performance
        manager
            .create_index(
                Index::create()
                    .name("idx_mcp_request_logs_timestamp")
                    .table(McpRequestLogs::Table)
                    .col(McpRequestLogs::Timestamp)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_mcp_request_logs_server_name")
                    .table(McpRequestLogs::Table)
                    .col(McpRequestLogs::ServerName)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_mcp_request_logs_session_id")
                    .table(McpRequestLogs::Table)
                    .col(McpRequestLogs::SessionId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_mcp_request_logs_mcp_session_id")
                    .table(McpRequestLogs::Table)
                    .col(McpRequestLogs::McpSessionId)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Drop indexes first
        manager
            .drop_index(
                Index::drop()
                    .name("idx_mcp_request_logs_mcp_session_id")
                    .to_owned(),
            )
            .await?;

        manager
            .drop_index(
                Index::drop()
                    .name("idx_mcp_request_logs_session_id")
                    .to_owned(),
            )
            .await?;

        manager
            .drop_index(
                Index::drop()
                    .name("idx_mcp_request_logs_server_name")
                    .to_owned(),
            )
            .await?;

        manager
            .drop_index(
                Index::drop()
                    .name("idx_mcp_request_logs_timestamp")
                    .to_owned(),
            )
            .await?;

        // Drop table
        manager
            .drop_table(Table::drop().table(McpRequestLogs::Table).to_owned())
            .await
    }
}

#[derive(DeriveIden)]
enum McpRequestLogs {
    Table,
    Id,
    RequestId,
    SessionId,
    McpSessionId,
    ServerName,
    ClientInfo,
    Method,
    RequestHeaders,
    RequestBody,
    ResponseBody,
    ResponseHeaders,
    StatusCode,
    ErrorMessage,
    DurationMs,
    Timestamp,
}
