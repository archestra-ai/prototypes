use sea_orm_migration::prelude::*;

mod m20240101_000001_create_mcp_servers_table;
mod m20240101_000002_create_client_connections_table;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20240101_000001_create_mcp_servers_table::Migration),
            Box::new(m20240101_000002_create_client_connections_table::Migration),
        ]
    }
}
