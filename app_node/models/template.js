import db from '../db/sqlite.js';
import cache from '../cache/redis.js';
import crypto from 'crypto';

// 模板模型
const TemplateModel = {
  // 获取所有模板（非删除）
  findAll() {
    const stmt = db.prepare(`
      SELECT * FROM templates
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
    `);
    const rows = stmt.all();
    return rows.map(row => ({
      ...row,
      canonical: JSON.parse(row.canonical),
      original: row.original ? JSON.parse(row.original) : null,
    }));
  },

  // 根据签名查找
  async findBySignature(signature) {
    // 先尝试从缓存获取
    const cached = await cache.template.get(signature);
    if (cached) return cached;

    const stmt = db.prepare(`
      SELECT * FROM templates
      WHERE signature = ? AND deleted_at IS NULL
    `);
    const row = stmt.get(signature);

    if (row) {
      const template = {
        ...row,
        canonical: JSON.parse(row.canonical),
        original: row.original ? JSON.parse(row.original) : null,
      };
      // 存入缓存
      cache.template.set(signature, template);
      return template;
    }
    return null;
  },

  // 创建模板
  create(data) {
    const { signature, type, canonical, original } = data;

    const stmt = db.prepare(`
      INSERT INTO templates (signature, type, canonical, original)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(
      signature,
      type,
      JSON.stringify(canonical),
      original ? JSON.stringify(original) : null
    );

    // 清除缓存
    cache.template.del(signature);

    return {
      id: result.lastInsertRowid,
      signature,
      type,
      canonical,
      original,
      created_at: new Date().toISOString(),
    };
  },

  // 软删除模板
  delete(signature) {
    const stmt = db.prepare(`
      UPDATE templates
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE signature = ? AND deleted_at IS NULL
    `);

    const result = stmt.run(signature);

    // 清除缓存
    cache.template.del(signature);

    return result.changes > 0;
  },

  // 恢复模板
  restore(signature) {
    const stmt = db.prepare(`
      UPDATE templates
      SET deleted_at = NULL
      WHERE signature = ? AND deleted_at IS NOT NULL
    `);

    const result = stmt.run(signature);

    // 清除缓存
    cache.template.del(signature);

    return result.changes > 0;
  },

  // 获取删除的模板（回收站）
  findDeleted() {
    const stmt = db.prepare(`
      SELECT * FROM templates
      WHERE deleted_at IS NOT NULL
      ORDER BY deleted_at DESC
    `);
    const rows = stmt.all();
    return rows.map(row => ({
      ...row,
      canonical: JSON.parse(row.canonical),
      original: row.original ? JSON.parse(row.original) : null,
    }));
  },

  // 检查签名是否存在
  exists(signature) {
    const stmt = db.prepare(`
      SELECT 1 FROM templates
      WHERE signature = ? AND deleted_at IS NULL
    `);
    return stmt.get(signature) !== undefined;
  },
};

export default TemplateModel;
