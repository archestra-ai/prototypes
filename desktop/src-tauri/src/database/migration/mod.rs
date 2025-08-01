use sea_orm_migration::prelude::*;

mod m20240101_000001_create_mcp_servers_table;
mod m20240101_000002_create_external_mcp_clients_table;
mod m20240101_000003_create_mcp_request_logs_table;
mod m20250124_000004_create_chats_table;
mod m20250124_000005_create_chat_messages_table;
mod m20250128_000006_drop_mcp_servers_meta_column;
mod m20250131_000007_simplify_chat_messages;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20240101_000001_create_mcp_servers_table::Migration),
            Box::new(m20240101_000002_create_external_mcp_clients_table::Migration),
            Box::new(m20240101_000003_create_mcp_request_logs_table::Migration),
            Box::new(m20250124_000004_create_chats_table::Migration),
            Box::new(m20250124_000005_create_chat_messages_table::Migration),
            Box::new(m20250128_000006_drop_mcp_servers_meta_column::Migration),
            Box::new(m20250131_000007_simplify_chat_messages::Migration),
        ]
    }
}
