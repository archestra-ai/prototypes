use sea_orm_migration::{prelude::*, schema::*};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Add role column
        manager
            .alter_table(
                Table::alter()
                    .table(ChatMessages::Table)
                    .add_column(
                        ColumnDef::new(ChatMessages::Role)
                            .string()
                            .not_null()
                            .default("user"),
                    )
                    .to_owned(),
            )
            .await?;

        // Add content column as text (rename existing content column would be ideal but SQLite doesn't support it)
        manager
            .alter_table(
                Table::alter()
                    .table(ChatMessages::Table)
                    .add_column(
                        ColumnDef::new(Alias::new("content_text"))
                            .string()
                            .not_null()
                            .default(""),
                    )
                    .to_owned(),
            )
            .await?;

        // Migrate existing data from JSON content to new columns
        // This is SQLite-specific SQL for JSON extraction
        let sql = r#"
            UPDATE chat_messages 
            SET 
                role = COALESCE(json_extract(content, '$.role'), 'user'),
                content_text = COALESCE(json_extract(content, '$.content'), '')
        "#;

        manager.get_connection().execute_unprepared(sql).await?;

        // Drop the old JSON content column
        // Note: SQLite doesn't support dropping columns directly,
        // so we need to recreate the table

        // Create temporary table with new schema
        manager
            .create_table(
                Table::create()
                    .table(Alias::new("chat_messages_new"))
                    .if_not_exists()
                    .col(pk_auto(Alias::new("id")))
                    .col(integer(Alias::new("chat_id")).not_null())
                    .col(
                        timestamp_with_time_zone(Alias::new("created_at"))
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .col(string(Alias::new("role")).not_null())
                    .col(string(Alias::new("content")).not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk-chat_messages-chat_id")
                            .from(Alias::new("chat_messages_new"), Alias::new("chat_id"))
                            .to(Chats::Table, Chats::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // Copy data to new table
        let copy_sql = r#"
            INSERT INTO chat_messages_new (id, chat_id, created_at, role, content)
            SELECT id, chat_id, created_at, role, content_text FROM chat_messages
        "#;
        manager
            .get_connection()
            .execute_unprepared(copy_sql)
            .await?;

        // Drop old table
        manager
            .drop_table(Table::drop().table(ChatMessages::Table).to_owned())
            .await?;

        // Rename new table to original name
        let rename_sql = "ALTER TABLE chat_messages_new RENAME TO chat_messages";
        manager
            .get_connection()
            .execute_unprepared(rename_sql)
            .await?;

        // Recreate index
        manager
            .create_index(
                Index::create()
                    .name("idx-chat_messages-chat_id")
                    .table(ChatMessages::Table)
                    .col(ChatMessages::ChatId)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // For down migration, we would need to convert back to JSON format
        // This is a destructive operation that might lose data

        // Create temporary table with old schema
        manager
            .create_table(
                Table::create()
                    .table(Alias::new("chat_messages_old"))
                    .if_not_exists()
                    .col(pk_auto(Alias::new("id")))
                    .col(integer(Alias::new("chat_id")).not_null())
                    .col(
                        timestamp_with_time_zone(Alias::new("created_at"))
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .col(json(Alias::new("content")).not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk-chat_messages-chat_id")
                            .from(Alias::new("chat_messages_old"), Alias::new("chat_id"))
                            .to(Chats::Table, Chats::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // Copy data back to JSON format
        let copy_sql = r#"
            INSERT INTO chat_messages_old (id, chat_id, created_at, content)
            SELECT 
                id, 
                chat_id, 
                created_at, 
                json_object('role', role, 'content', content) as content
            FROM chat_messages
        "#;
        manager
            .get_connection()
            .execute_unprepared(copy_sql)
            .await?;

        // Drop current table
        manager
            .drop_table(Table::drop().table(ChatMessages::Table).to_owned())
            .await?;

        // Rename old table back
        let rename_sql = "ALTER TABLE chat_messages_old RENAME TO chat_messages";
        manager
            .get_connection()
            .execute_unprepared(rename_sql)
            .await?;

        // Recreate index
        manager
            .create_index(
                Index::create()
                    .name("idx-chat_messages-chat_id")
                    .table(ChatMessages::Table)
                    .col(ChatMessages::ChatId)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

#[derive(Iden)]
#[allow(dead_code)]
enum ChatMessages {
    Table,
    Id,
    ChatId,
    CreatedAt,
    Content,
    Role,
    ContentText,
}

#[derive(Iden)]
enum Chats {
    Table,
    Id,
}
