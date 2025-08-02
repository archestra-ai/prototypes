import { eq } from 'drizzle-orm';

import db from '../../database';
import { mcpServersTable } from '../../database/schema/mcpServer';

export default class MCPServer {
  static async create(data: typeof mcpServersTable.$inferInsert) {
    return db.insert(mcpServersTable).values(data);
  }

  static async getAll() {
    return db.select().from(mcpServersTable);
  }

  static async getById(id: (typeof mcpServersTable.$inferSelect)['id']) {
    return db.select().from(mcpServersTable).where(eq(mcpServersTable.id, id));
  }
}
