/**
 * Database connection management for RowFlow MCP Server
 */

import pg from 'pg';
import { ProfileConfig, Profiles } from './types.js';
import { log } from './utils.js';

const { Pool } = pg;

class DatabaseManager {
  private pools: Map<string, pg.Pool> = new Map();
  private profiles: Profiles = {};

  /**
   * Initialize the database manager with profiles
   */
  initialize(profiles: Profiles): void {
    this.profiles = profiles;
    log('info', `Initialized database manager with ${Object.keys(profiles).length} profiles`);
  }

  /**
   * Get or create a connection pool for a profile
   */
  getPool(profileName: string): pg.Pool {
    const profile = this.profiles[profileName.toLowerCase()];

    if (!profile) {
      throw new Error(`Profile not found: ${profileName}. Available profiles: ${Object.keys(this.profiles).join(', ')}`);
    }

    const poolKey = profileName.toLowerCase();

    if (this.pools.has(poolKey)) {
      return this.pools.get(poolKey)!;
    }

    // Create new pool
    const pool = new Pool({
      host: profile.host,
      port: profile.port,
      database: profile.database,
      user: profile.user,
      password: profile.password,
      ssl: profile.ssl ? { rejectUnauthorized: false } : undefined,
      max: profile.max || 10,
      idleTimeoutMillis: profile.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: profile.connectionTimeoutMillis || 5000,
    });

    // Handle pool errors
    pool.on('error', (err) => {
      log('error', `Pool error for profile ${profileName}:`, err);
    });

    this.pools.set(poolKey, pool);
    log('info', `Created connection pool for profile: ${profileName}`);

    return pool;
  }

  /**
   * Validate connection to a profile
   */
  async validateConnection(profileName: string): Promise<boolean> {
    try {
      const pool = this.getPool(profileName);
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      log('info', `Connection validated for profile: ${profileName}`);
      return true;
    } catch (error) {
      log('error', `Connection validation failed for profile ${profileName}:`, error);
      return false;
    }
  }

  /**
   * Execute a query with a specific profile
   */
  async query<T extends pg.QueryResultRow = any>(
    profileName: string,
    sql: string,
    params?: any[]
  ): Promise<pg.QueryResult<T>> {
    const pool = this.getPool(profileName);
    return await pool.query<T>(sql, params);
  }

  /**
   * Get a client from the pool for transactions
   */
  async getClient(profileName: string): Promise<pg.PoolClient> {
    const pool = this.getPool(profileName);
    return await pool.connect();
  }

  /**
   * Close all connection pools
   */
  async closeAll(): Promise<void> {
    const closePromises: Promise<void>[] = [];

    for (const [profileName, pool] of this.pools.entries()) {
      log('info', `Closing pool for profile: ${profileName}`);
      closePromises.push(pool.end());
    }

    await Promise.all(closePromises);
    this.pools.clear();
    log('info', 'All connection pools closed');
  }

  /**
   * Get list of available profiles
   */
  getAvailableProfiles(): string[] {
    return Object.keys(this.profiles);
  }

  /**
   * Get profile configuration (without password)
   */
  getProfileInfo(profileName: string): Omit<ProfileConfig, 'password'> | null {
    const profile = this.profiles[profileName.toLowerCase()];
    if (!profile) {
      return null;
    }

    const { password, ...safeProfile } = profile;
    return safeProfile;
  }
}

// Singleton instance
export const dbManager = new DatabaseManager();
