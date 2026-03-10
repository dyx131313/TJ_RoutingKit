import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(__dirname, '../../cache');
const DB_PATH = path.join(DB_DIR, 'routingkit.db');

// 确保目录存在
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// 创建数据库连接
const db = new Database(DB_PATH);

// 启用外键约束
db.pragma('foreign_keys = ON');

// 创建表
function initializeDatabase() {
  // 模板表
  db.exec(`
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signature VARCHAR(64) UNIQUE NOT NULL,
      type VARCHAR(20) NOT NULL,
      canonical TEXT NOT NULL,
      original TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME
    )
  `);

  // 规则表
  db.exec(`
    CREATE TABLE IF NOT EXISTS rules (
      id VARCHAR(20) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      template_signatures TEXT NOT NULL,
      merged_arc_count INTEGER,
      metric_path VARCHAR(255),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 模板解析缓存表
  db.exec(`
    CREATE TABLE IF NOT EXISTS resolve_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      polygon_hash VARCHAR(64) UNIQUE NOT NULL,
      policy VARCHAR(20) DEFAULT 'both_inside',
      arc_count INTEGER NOT NULL,
      arc_ids TEXT NOT NULL,
      arc_coords TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 路由历史表（可选，用于统计）
  db.exec(`
    CREATE TABLE IF NOT EXISTS route_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_lat REAL NOT NULL,
      from_lon REAL NOT NULL,
      to_lat REAL NOT NULL,
      to_lon REAL NOT NULL,
      profile VARCHAR(20),
      rule_id VARCHAR(20),
      distance INTEGER,
      travel_time INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_templates_signature ON templates(signature);
    CREATE INDEX IF NOT EXISTS idx_templates_type ON templates(type);
    CREATE INDEX IF NOT EXISTS idx_templates_deleted ON templates(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_resolve_cache_hash ON resolve_cache(polygon_hash);
    CREATE INDEX IF NOT EXISTS idx_route_history_created ON route_history(created_at);
  `);

  console.log('数据库初始化完成:', DB_PATH);
}

// 初始化数据库
initializeDatabase();

export default db;
