import db from '../db/sqlite.js';
import cache from '../cache/redis.js';
import crypto from 'crypto';

// 解析缓存模型
const ResolveCacheModel = {
  // 生成多边形哈希
  generateHash(polygon) {
    // 规范化多边形坐标（6位小数）
    const normalized = polygon.map(([lat, lon]) => [
      parseFloat(lat.toFixed(6)),
      parseFloat(lon.toFixed(6)),
    ]).sort((a, b) => {
      if (a[0] !== b[0]) return a[0] - b[0];
      return a[1] - b[1];
    });

    const key = normalized.flat().join(',');
    return crypto.createHash('sha256').update(key).digest('hex');
  },

  // 查找缓存
  async findByPolygon(polygon, policy = 'both_inside') {
    const hash = this.generateHash(polygon);

    // 先尝试从缓存获取
    const cached = await cache.resolvePoly.get(hash);
    if (cached) return cached;

    const stmt = db.prepare(`
      SELECT * FROM resolve_cache
      WHERE polygon_hash = ? AND policy = ?
    `);
    const row = stmt.get(hash, policy);

    if (row) {
      const result = {
        ...row,
        arc_ids: JSON.parse(row.arc_ids),
        arc_coords: JSON.parse(row.arc_coords),
      };
      // 存入缓存
      cache.resolvePoly.set(hash, result);
      return result;
    }
    return null;
  },

  // 创建缓存
  create(polygon, data) {
    const hash = this.generateHash(polygon);
    const { policy, arc_count, arc_ids, arc_coords } = data;

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO resolve_cache (polygon_hash, policy, arc_count, arc_ids, arc_coords)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      hash,
      policy || 'both_inside',
      arc_count,
      JSON.stringify(arc_ids),
      JSON.stringify(arc_coords)
    );

    // 存入缓存
    const result = {
      polygon_hash: hash,
      policy: policy || 'both_inside',
      arc_count,
      arc_ids,
      arc_coords,
    };
    cache.resolvePoly.set(hash, result);

    return result;
  },

  // 删除缓存
  delete(hash) {
    const stmt = db.prepare(`
      DELETE FROM resolve_cache WHERE polygon_hash = ?
    `);

    const result = stmt.run(hash);
    cache.resolvePoly.del(hash);

    return result.changes > 0;
  },

  // 清理所有缓存
  clearAll() {
    db.exec('DELETE FROM resolve_cache');
  },
};

export default ResolveCacheModel;
