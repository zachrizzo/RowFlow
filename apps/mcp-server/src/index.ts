#!/usr/bin/env node

/**
 * RowFlow MCP Server - Main Entry Point
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { dbManager } from './db.js';
import { parseProfilesFromEnv, formatMCPError, log } from './utils.js';
import { handleDescribe } from './tools/describe.js';
import { handleQuery } from './tools/query.js';
import { handleExplain } from './tools/explain.js';
import { handleSample } from './tools/sample.js';
import { handleLocks } from './tools/locks.js';
import { handleCancel } from './tools/cancel.js';

// Load environment variables
dotenv.config();

// Initialize MCP server
const server = new Server(
  {
    name: 'rowflow-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions
const TOOLS = [
  {
    name: 'pg.describe',
    description: 'Get comprehensive schema metadata including tables, columns, types, and comments. Optionally filter by schema name.',
    inputSchema: {
      type: 'object',
      properties: {
        profile: {
          type: 'string',
          description: 'Connection profile name (e.g., "dev", "prod")',
        },
        schema: {
          type: 'string',
          description: 'Optional: specific schema name to describe. If omitted, all user schemas are returned.',
        },
      },
      required: ['profile'],
    },
  },
  {
    name: 'pg.query',
    description: 'Execute SELECT queries against the database. IMPORTANT: Only SELECT statements are allowed - no DML/DDL operations. Results are limited by maxRows parameter.',
    inputSchema: {
      type: 'object',
      properties: {
        profile: {
          type: 'string',
          description: 'Connection profile name',
        },
        sql: {
          type: 'string',
          description: 'SQL SELECT query to execute',
        },
        params: {
          type: 'array',
          description: 'Optional: parameterized query values (use $1, $2, etc. in sql)',
          items: {},
        },
        maxRows: {
          type: 'number',
          description: 'Maximum number of rows to return (default: 1000, max: 10000)',
          default: 1000,
        },
      },
      required: ['profile', 'sql'],
    },
  },
  {
    name: 'pg.explain',
    description: 'Get detailed query execution plan with EXPLAIN ANALYZE. Shows query performance metrics, buffer usage, and execution tree.',
    inputSchema: {
      type: 'object',
      properties: {
        profile: {
          type: 'string',
          description: 'Connection profile name',
        },
        sql: {
          type: 'string',
          description: 'SQL query to analyze',
        },
      },
      required: ['profile', 'sql'],
    },
  },
  {
    name: 'pg.sample',
    description: 'Get sample rows from a table with intelligent pagination. Uses primary key for efficient keyset pagination if available.',
    inputSchema: {
      type: 'object',
      properties: {
        profile: {
          type: 'string',
          description: 'Connection profile name',
        },
        schema: {
          type: 'string',
          description: 'Schema name',
        },
        table: {
          type: 'string',
          description: 'Table name',
        },
        limit: {
          type: 'number',
          description: 'Number of rows to return (default: 100, max: 1000)',
          default: 100,
        },
      },
      required: ['profile', 'schema', 'table'],
    },
  },
  {
    name: 'pg.locks',
    description: 'Get information about current database locks and blocking queries. Shows which processes are blocking others.',
    inputSchema: {
      type: 'object',
      properties: {
        profile: {
          type: 'string',
          description: 'Connection profile name',
        },
      },
      required: ['profile'],
    },
  },
  {
    name: 'pg.cancel',
    description: 'Cancel a running query by process ID (PID). WARNING: This terminates the query immediately. Use with caution. Get PIDs from pg.locks or pg_stat_activity.',
    inputSchema: {
      type: 'object',
      properties: {
        profile: {
          type: 'string',
          description: 'Connection profile name',
        },
        pid: {
          type: 'number',
          description: 'Process ID (PID) of the query to cancel',
        },
      },
      required: ['profile', 'pid'],
    },
  },
];

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOLS,
  };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    log('info', `Executing tool: ${name}`, args);

    let result: any;

    switch (name) {
      case 'pg.describe':
        result = await handleDescribe(args as any);
        break;

      case 'pg.query':
        result = await handleQuery(args as any);
        break;

      case 'pg.explain':
        result = await handleExplain(args as any);
        break;

      case 'pg.sample':
        result = await handleSample(args as any);
        break;

      case 'pg.locks':
        result = await handleLocks(args as any);
        break;

      case 'pg.cancel':
        result = await handleCancel(args as any);
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    log('info', `Tool ${name} executed successfully`);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    log('error', `Tool ${name} failed:`, error);

    const mcpError = formatMCPError(error);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: mcpError,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
});

// Graceful shutdown handler
async function shutdown(): Promise<void> {
  log('info', 'Shutting down MCP server...');
  await dbManager.closeAll();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Main startup
async function main(): Promise<void> {
  try {
    log('info', 'Starting RowFlow MCP Server...');

    // Parse profiles from environment
    const profiles = parseProfilesFromEnv();

    if (Object.keys(profiles).length === 0) {
      log('error', 'No database profiles configured. Please set PG_PROFILE_* environment variables.');
      process.exit(1);
    }

    // Initialize database manager
    dbManager.initialize(profiles);

    log('info', `Configured profiles: ${dbManager.getAvailableProfiles().join(', ')}`);

    // Start MCP server with stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    log('info', 'RowFlow MCP Server is running');
  } catch (error) {
    log('error', 'Failed to start server:', error);
    process.exit(1);
  }
}

main();
