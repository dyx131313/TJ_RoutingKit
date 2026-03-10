/**
 * 数据迁移脚本
 * 将文件系统中的模板和规则迁移到 SQLite 数据库
 *
 * 使用方法: node scripts/migrate.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 导入数据库模块
import db from '../db/sqlite.js';
import TemplateModel from '../models/template.js';
import RuleModel from '../models/rule.js';
import ResolveCacheModel from '../models/resolveCache.js';

const CACHE_BASE = path.join(__dirname, '../../cache');

// 检测 PBF hash
function detectPbfHash() {
  try {
    const entries = fs.readdirSync(CACHE_BASE, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && /^[0-9a-f]{64}$/.test(e.name)) {
        return e.name;
      }
    }
  } catch (e) {
    console.error('检测 PBF hash 失败:', e.message);
  }
  return 'unknown';
}

// 迁移模板
function migrateTemplates(pbfHash) {
  const templatesDir = path.join(CACHE_BASE, pbfHash, 'templates');

  if (!fs.existsSync(templatesDir)) {
    console.log('模板目录不存在，跳过');
    return { migrated: 0, skipped: 0 };
  }

  const files = fs.readdirSync(templatesDir)
    .filter(f => f.startsWith('tpl_') && f.endsWith('.json'));

  console.log(`\n开始迁移模板，共 ${files.length} 个...`);

  let migrated = 0;
  let skipped = 0;

  for (const file of files) {
    try {
      const filePath = path.join(templatesDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);

      // 检查是否已存在
      if (TemplateModel.exists(data.signature)) {
        console.log(`  跳过 (已存在): ${data.signature.slice(0, 12)}...`);
        skipped++;
        continue;
      }

      // 确定类型
      let type = 'polygon';
      if (data.canonical?.arc_ids || data.original?.arc_ids) {
        type = 'arc_ids';
      } else if (data.canonical?.tag_filter || data.original?.tag_filter) {
        type = 'tag_filter';
      }

      // 写入数据库
      TemplateModel.create({
        signature: data.signature,
        type,
        canonical: data.canonical || {},
        original: data.original || {},
      });

      console.log(`  迁移: ${data.signature.slice(0, 12)}... (${type})`);
      migrated++;
    } catch (err) {
      console.error(`  迁移失败: ${file}`, err.message);
    }
  }

  // 迁移回收站
  const trashDir = path.join(templatesDir, 'trash');
  if (fs.existsSync(trashDir)) {
    const trashFiles = fs.readdirSync(trashDir)
      .filter(f => f.startsWith('tpl_') && f.endsWith('.json'));

    console.log(`\n迁移回收站模板，共 ${trashFiles.length} 个...`);

    for (const file of trashFiles) {
      try {
        const filePath = path.join(trashDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);

        // 检查是否已存在
        if (TemplateModel.exists(data.signature)) {
          console.log(`  跳过 (已存在): ${data.signature.slice(0, 12)}...`);
          continue;
        }

        let type = 'polygon';
        if (data.canonical?.arc_ids || data.original?.arc_ids) {
          type = 'arc_ids';
        } else if (data.canonical?.tag_filter || data.original?.tag_filter) {
          type = 'tag_filter';
        }

        // 写入数据库（标记为已删除）
        const template = TemplateModel.create({
          signature: data.signature,
          type,
          canonical: data.canonical || {},
          original: data.original || {},
        });

        // 软删除
        db.prepare('UPDATE templates SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(template.id);

        console.log(`  迁移 (已删除): ${data.signature.slice(0, 12)}...`);
      } catch (err) {
        console.error(`  迁移失败: ${file}`, err.message);
      }
    }
  }

  return { migrated, skipped };
}

// 迁移规则
function migrateRules(pbfHash) {
  const rulesDir = path.join(CACHE_BASE, pbfHash, 'rules');

  if (!fs.existsSync(rulesDir)) {
    console.log('规则目录不存在，跳过');
    return { migrated: 0, skipped: 0 };
  }

  const files = fs.readdirSync(rulesDir)
    .filter(f => f.startsWith('rules_') && f.endsWith('.json'));

  console.log(`\n开始迁移规则，共 ${files.length} 个...`);

  let migrated = 0;
  let skipped = 0;

  for (const file of files) {
    try {
      const filePath = path.join(rulesDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);

      // 提取 ID
      const id = file.replace('rules_', '').replace('.json', '');

      // 检查是否已存在
      const existing = RuleModel.findById(id);
      if (existing) {
        console.log(`  跳过 (已存在): ${data.name || id}`);
        skipped++;
        continue;
      }

      // 写入数据库
      RuleModel.create({
        id,
        name: data.name || id,
        description: data.description || '',
        templates: data.templates || [],
      });

      // 更新 metric 信息
      if (data.metric_path) {
        RuleModel.updateMetricPath(id, data.metric_path, data.merged_arc_count);
      }

      console.log(`  迁移: ${data.name || id}`);
      migrated++;
    } catch (err) {
      console.error(`  迁移失败: ${file}`, err.message);
    }
  }

  return { migrated, skipped };
}

// 迁移解析缓存
function migrateResolveCache(pbfHash) {
  const templatesDir = path.join(CACHE_BASE, pbfHash, 'templates');

  if (!fs.existsSync(templatesDir)) {
    console.log('模板目录不存在，跳过');
    return { migrated: 0 };
  }

  const files = fs.readdirSync(templatesDir)
    .filter(f => f.startsWith('resolve_poly_') && f.endsWith('.json'));

  console.log(`\n开始迁移解析缓存，共 ${files.length} 个...`);

  let migrated = 0;

  for (const file of files) {
    try {
      const filePath = path.join(templatesDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);

      // 提取多边形哈希
      const hash = file.replace('resolve_poly_', '').replace('.json', '');

      // 写入数据库
      db.prepare(`
        INSERT OR REPLACE INTO resolve_cache (polygon_hash, policy, arc_count, arc_ids, arc_coords)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        hash,
        data.policy || 'both_inside',
        data.arc_count,
        JSON.stringify(data.arc_ids || []),
        JSON.stringify(data.arc_coords || [])
      );

      console.log(`  迁移: ${hash.slice(0, 16)}...`);
      migrated++;
    } catch (err) {
      console.error(`  迁移失败: ${file}`, err.message);
    }
  }

  return { migrated };
}

// 主函数
async function main() {
  console.log('='.repeat(50));
  console.log('TJ_RoutingKit 数据迁移脚本');
  console.log('='.repeat(50));

  const pbfHash = detectPbfHash();
  console.log(`PBF Hash: ${pbfHash}`);

  // 迁移模板
  const templateResult = migrateTemplates(pbfHash);
  console.log(`\n模板迁移完成: ${templateResult.migrated} 迁移, ${templateResult.skipped} 跳过`);

  // 迁移规则
  const ruleResult = migrateRules(pbfHash);
  console.log(`\n规则迁移完成: ${ruleResult.migrated} 迁移, ${ruleResult.skipped} 跳过`);

  // 迁移解析缓存
  const cacheResult = migrateResolveCache(pbfHash);
  console.log(`\n解析缓存迁移完成: ${cacheResult.migrated} 迁移`);

  console.log('\n' + '='.repeat(50));
  console.log('迁移完成！');
  console.log('='.repeat(50));

  // 验证数据
  console.log('\n数据库统计:');
  const templateCount = db.prepare('SELECT COUNT(*) as count FROM templates WHERE deleted_at IS NULL').get();
  const ruleCount = db.prepare('SELECT COUNT(*) as count FROM rules').get();
  const cacheCount = db.prepare('SELECT COUNT(*) as count FROM resolve_cache').get();
  console.log(`  模板: ${templateCount.count}`);
  console.log(`  规则: ${ruleCount.count}`);
  console.log(`  解析缓存: ${cacheCount.count}`);

  process.exit(0);
}

main().catch(err => {
  console.error('迁移失败:', err);
  process.exit(1);
});
