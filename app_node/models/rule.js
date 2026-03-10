import db from '../db/sqlite.js';
import cache from '../cache/redis.js';

// 规则模型
const RuleModel = {
  // 获取所有规则
  findAll() {
    const stmt = db.prepare(`
      SELECT * FROM rules
      ORDER BY created_at DESC
    `);
    const rows = stmt.all();
    return rows.map(row => ({
      ...row,
      templates: JSON.parse(row.template_signatures),
    }));
  },

  // 根据 ID 查找
  async findById(id) {
    // 先尝试从缓存获取
    const cached = await cache.rule.get(id);
    if (cached) return cached;

    const stmt = db.prepare(`
      SELECT * FROM rules WHERE id = ?
    `);
    const row = stmt.get(id);

    if (row) {
      const rule = {
        ...row,
        templates: JSON.parse(row.template_signatures),
      };
      // 存入缓存
      cache.rule.set(id, rule);
      return rule;
    }
    return null;
  },

  // 创建规则
  create(data) {
    const { id, name, description, templates } = data;

    const stmt = db.prepare(`
      INSERT INTO rules (id, name, description, template_signatures)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(
      id,
      name,
      description || '',
      JSON.stringify(templates)
    );

    // 清除缓存
    cache.rule.del(id);

    return {
      id,
      name,
      description,
      templates,
      created_at: new Date().toISOString(),
    };
  },

  // 更新规则
  update(id, data) {
    const { name, description, merged_arc_count, metric_path } = data;

    const stmt = db.prepare(`
      UPDATE rules
      SET name = ?, description = ?, merged_arc_count = ?, metric_path = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const result = stmt.run(
      name,
      description || '',
      merged_arc_count || null,
      metric_path || null,
      id
    );

    // 清除缓存
    cache.rule.del(id);

    return result.changes > 0;
  },

  // 删除规则
  delete(id) {
    const stmt = db.prepare(`
      DELETE FROM rules WHERE id = ?
    `);

    const result = stmt.run(id);

    // 清除缓存
    cache.rule.del(id);

    return result.changes > 0;
  },

  // 更新 metric 路径
  updateMetricPath(id, metricPath, mergedArcCount) {
    const stmt = db.prepare(`
      UPDATE rules
      SET metric_path = ?, merged_arc_count = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const result = stmt.run(metricPath, mergedArcCount, id);

    // 清除缓存
    cache.rule.del(id);

    return result.changes > 0;
  },
};

export default RuleModel;
