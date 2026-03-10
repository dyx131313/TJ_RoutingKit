import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// 导入数据库模型
import TemplateModel from './template.js';
import RuleModel from './rule.js';
import ResolveCacheModel from './resolveCache.js';

// 配置
const CACHE_BASE = path.join(__dirname, '../../cache');

// 混合存储层 - 优先使用数据库，fallback 到文件系统
const HybridStorage = {
  // ========== 模板 ==========

  // 获取所有模板
  async getTemplates() {
    try {
      const templates = TemplateModel.findAll();
      if (templates && templates.length > 0) {
        console.log('[HybridStorage] 从数据库获取模板:', templates.length);
        return templates;
      }
    } catch (err) {
      console.warn('[HybridStorage] 数据库获取模板失败，fallback 到文件系统:', err.message);
    }
    return null;
  },

  // 获取单个模板
  async getTemplate(signature) {
    try {
      const template = await TemplateModel.findBySignature(signature);
      if (template) {
        console.log('[HybridStorage] 从数据库获取模板:', signature.slice(0, 12));
        return template;
      }
    } catch (err) {
      console.warn('[HybridStorage] 数据库获取模板失败，fallback 到文件系统:', err.message);
    }
    return null;
  },

  // 保存模板（同时写数据库和文件）
  async saveTemplate(signature, data) {
    try {
      // 先尝试写入数据库
      const template = TemplateModel.create({
        signature,
        type: data.type,
        canonical: data.canonical,
        original: data.original,
      });
      console.log('[HybridStorage] 模板写入数据库:', signature.slice(0, 12));
      return template;
    } catch (err) {
      console.warn('[HybridStorage] 数据库写入失败:', err.message);
    }

    // Fallback: 写入文件
    const pbfHash = this.detectPbfHash();
    const dir = path.join(CACHE_BASE, pbfHash, 'templates');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const filePath = path.join(dir, `tpl_${signature}.json`);
    fs.writeFileSync(filePath, JSON.stringify({
      signature,
      ...data,
      created_at: new Date().toISOString(),
    }, null, 2));
    console.log('[HybridStorage] 模板写入文件:', filePath);
    return { signature, ...data, created_at: new Date().toISOString() };
  },

  // 删除模板（软删除）
  async deleteTemplate(signature) {
    try {
      TemplateModel.delete(signature);
      console.log('[HybridStorage] 模板从数据库删除:', signature.slice(0, 12));
      return true;
    } catch (err) {
      console.warn('[HybridStorage] 数据库删除失败，尝试文件删除:', err.message);
    }

    // Fallback: 移动到回收站
    const pbfHash = this.detectPbfHash();
    const src = path.join(CACHE_BASE, pbfHash, 'templates', `tpl_${signature}.json`);
    const trashDir = path.join(CACHE_BASE, pbfHash, 'templates', 'trash');
    if (!fs.existsSync(trashDir)) {
      fs.mkdirSync(trashDir, { recursive: true });
    }
    const dest = path.join(trashDir, `tpl_${signature}.json`);

    if (fs.existsSync(src)) {
      fs.renameSync(src, dest);
      console.log('[HybridStorage] 模板移动到回收站:', signature.slice(0, 12));
      return true;
    }
    return false;
  },

  // ========== 规则 ==========

  // 获取所有规则
  async getRules() {
    try {
      const rules = RuleModel.findAll();
      if (rules && rules.length > 0) {
        console.log('[HybridStorage] 从数据库获取规则:', rules.length);
        return rules;
      }
    } catch (err) {
      console.warn('[HybridStorage] 数据库获取规则失败，fallback 到文件系统:', err.message);
    }
    return null;
  },

  // 获取单个规则
  async getRule(id) {
    try {
      const rule = await RuleModel.findById(id);
      if (rule) {
        console.log('[HybridStorage] 从数据库获取规则:', id);
        return rule;
      }
    } catch (err) {
      console.warn('[HybridStorage] 数据库获取规则失败，fallback 到文件系统:', err.message);
    }
    return null;
  },

  // 保存规则
  async saveRule(id, data) {
    try {
      const rule = RuleModel.create({
        id,
        name: data.name,
        description: data.description,
        templates: data.templates,
      });
      console.log('[HybridStorage] 规则写入数据库:', id);
      return rule;
    } catch (err) {
      console.warn('[HybridStorage] 数据库写入失败:', err.message);
    }

    // Fallback: 写入文件
    const pbfHash = this.detectPbfHash();
    const dir = path.join(CACHE_BASE, pbfHash, 'rules');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const filePath = path.join(dir, `rules_${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify({
      id,
      ...data,
      created_at: new Date().toISOString(),
    }, null, 2));
    console.log('[HybridStorage] 规则写入文件:', filePath);
    return { id, ...data, created_at: new Date().toISOString() };
  },

  // 删除规则
  async deleteRule(id) {
    try {
      RuleModel.delete(id);
      console.log('[HybridStorage] 规则从数据库删除:', id);
      return true;
    } catch (err) {
      console.warn('[HybridStorage] 数据库删除失败，尝试文件删除:', err.message);
    }

    // Fallback: 删除文件
    const pbfHash = this.detectPbfHash();
    const filePath = path.join(CACHE_BASE, pbfHash, 'rules', `rules_${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('[HybridStorage] 规则文件删除:', id);
      return true;
    }
    return false;
  },

  // 更新规则 metric
  async updateRuleMetric(id, metricPath, mergedArcCount) {
    try {
      RuleModel.updateMetricPath(id, metricPath, mergedArcCount);
      console.log('[HybridStorage] 规则 metric 更新到数据库:', id);
      return true;
    } catch (err) {
      console.warn('[HybridStorage] 数据库更新失败:', err.message);
    }
    return false;
  },

  // ========== 解析缓存 ==========

  // 获取解析缓存
  async getResolveCache(polygon) {
    try {
      const cached = await ResolveCacheModel.findByPolygon(polygon);
      if (cached) {
        console.log('[HybridStorage] 从数据库获取解析缓存');
        return cached;
      }
    } catch (err) {
      console.warn('[HybridStorage] 数据库获取缓存失败:', err.message);
    }
    return null;
  },

  // 保存解析缓存
  async saveResolveCache(polygon, data) {
    try {
      ResolveCacheModel.create(polygon, data);
      console.log('[HybridStorage] 解析缓存写入数据库');
      return true;
    } catch (err) {
      console.warn('[HybridStorage] 数据库缓存写入失败:', err.message);
    }
    return false;
  },

  // ========== 辅助方法 ==========

  // 检测 PBF hash
  detectPbfHash() {
    if (process.env.PBF_HASH && /^[0-9a-f]{64}$/.test(process.env.PBF_HASH)) {
      return process.env.PBF_HASH;
    }
    try {
      const entries = fs.readdirSync(CACHE_BASE, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory() && /^[0-9a-f]{64}$/.test(e.name)) {
          return e.name;
        }
      }
    } catch (e) {
      // ignore
    }
    return 'unknown';
  },
};

export default HybridStorage;
