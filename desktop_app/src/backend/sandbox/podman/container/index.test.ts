import { describe, expect, it } from 'vitest';

import PodmanContainer from './index';

describe('PodmanContainer', () => {
  describe('injectUserConfigValuesIntoServerConfig', () => {
    // Access the private static method via bracket notation for testing
    const injectUserConfigValues = (PodmanContainer as any)['injectUserConfigValuesIntoServerConfig'];

    it('should replace template variables in environment variables', () => {
      const serverConfig = {
        command: 'node',
        args: ['server.js'],
        env: {
          SLACK_MCP_XOXC_TOKEN: '${user_config.slack_mcp_xoxc_token}',
          SLACK_MCP_XOXD_TOKEN: '${user_config.slack_mcp_xoxd_token}',
          SLACK_BOT_TOKEN: '${user_config.slack_bot_token}',
          NODE_ENV: 'production',
        },
      };

      const userConfigValues = {
        slack_mcp_xoxc_token: 'xoxc-test-token-123',
        slack_mcp_xoxd_token: 'xoxd-test-token-456',
        slack_bot_token: 'xoxb-test-bot-token-789',
      };

      const result = injectUserConfigValues(serverConfig, userConfigValues);

      expect(result.env.SLACK_MCP_XOXC_TOKEN).toBe('xoxc-test-token-123');
      expect(result.env.SLACK_MCP_XOXD_TOKEN).toBe('xoxd-test-token-456');
      expect(result.env.SLACK_BOT_TOKEN).toBe('xoxb-test-bot-token-789');
      expect(result.env.NODE_ENV).toBe('production');
    });

    it('should replace template variables in command', () => {
      const serverConfig = {
        command: '${user_config.custom_command}',
        args: [],
        env: {},
      };

      const userConfigValues = {
        custom_command: '/usr/bin/python3',
      };

      const result = injectUserConfigValues(serverConfig, userConfigValues);

      expect(result.command).toBe('/usr/bin/python3');
    });

    it('should replace template variables in args', () => {
      const serverConfig = {
        command: 'node',
        args: ['--port', '${user_config.port}', '--host', '${user_config.host}'],
        env: {},
      };

      const userConfigValues = {
        port: '3000',
        host: 'localhost',
      };

      const result = injectUserConfigValues(serverConfig, userConfigValues);

      expect(result.args).toEqual(['--port', '3000', '--host', 'localhost']);
    });

    it('should handle missing user config values gracefully', () => {
      const serverConfig = {
        command: 'node',
        args: [],
        env: {
          TOKEN: '${user_config.missing_token}',
          STATIC_VALUE: 'static',
        },
      };

      const userConfigValues = {};

      const result = injectUserConfigValues(serverConfig, userConfigValues);

      // Should keep the template if value is missing
      expect(result.env.TOKEN).toBe('${user_config.missing_token}');
      expect(result.env.STATIC_VALUE).toBe('static');
    });

    it('should handle null userConfigValues', () => {
      const serverConfig = {
        command: 'node',
        args: ['${user_config.arg}'],
        env: {
          TOKEN: '${user_config.token}',
        },
      };

      const result = injectUserConfigValues(serverConfig, null as any);

      // Should return original values when userConfigValues is null
      expect(result.command).toBe('node');
      expect(result.args).toEqual(['${user_config.arg}']);
      expect(result.env.TOKEN).toBe('${user_config.token}');
    });

    it('should handle array values by joining with commas', () => {
      const serverConfig = {
        command: 'node',
        args: [],
        env: {
          ALLOWED_HOSTS: '${user_config.allowed_hosts}',
        },
      };

      const userConfigValues = {
        allowed_hosts: ['localhost', '127.0.0.1', '0.0.0.0'],
      };

      const result = injectUserConfigValues(serverConfig, userConfigValues);

      expect(result.env.ALLOWED_HOSTS).toBe('localhost,127.0.0.1,0.0.0.0');
    });

    it('should handle boolean and number values', () => {
      const serverConfig = {
        command: 'node',
        args: [],
        env: {
          DEBUG: '${user_config.debug}',
          MAX_CONNECTIONS: '${user_config.max_connections}',
        },
      };

      const userConfigValues = {
        debug: true,
        max_connections: 100,
      };

      const result = injectUserConfigValues(serverConfig, userConfigValues);

      expect(result.env.DEBUG).toBe('true');
      expect(result.env.MAX_CONNECTIONS).toBe('100');
    });

    it('should handle multiple template variables in a single value', () => {
      const serverConfig = {
        command: 'node',
        args: [],
        env: {
          CONNECTION_STRING: 'postgres://${user_config.db_user}:${user_config.db_pass}@${user_config.db_host}/mydb',
        },
      };

      const userConfigValues = {
        db_user: 'admin',
        db_pass: 'secret123',
        db_host: 'localhost:5432',
      };

      const result = injectUserConfigValues(serverConfig, userConfigValues);

      expect(result.env.CONNECTION_STRING).toBe('postgres://admin:secret123@localhost:5432/mydb');
    });
  });
});
