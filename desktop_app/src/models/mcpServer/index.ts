import { eq } from 'drizzle-orm';
import db from '../../database';
import { mcpServersTable } from '../../database/schema/mcpServer';

export default class MCPServer {
  static async create(name: string, server_config: Record<string, any>) {
    return db.insert(mcpServersTable).values({ name, server_config });
  }

  static async getAll() {
    return db.select().from(mcpServersTable);
  }

  static async getById(id: number) {
    return db.select().from(mcpServersTable).where(eq(mcpServersTable.id, id));
  }
}
