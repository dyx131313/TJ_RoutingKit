import { useState } from 'react';
import {
  Drawer,
  Button,
  Space,
  Table,
  Tag,
  Input,
  Typography,
  message,
  Popconfirm,
  Empty,
} from 'antd';
import {
  DeleteOutlined,
  BuildOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useTemplateStore } from '../../stores';
import { useRules } from '../../hooks';
import type { Rule } from '../../types';

const { Text, Title } = Typography;

interface RulePanelProps {
  open?: boolean;
  onClose?: () => void;
  onSelectRule: (ruleId: string) => void;
  embedded?: boolean;
}

export function RulePanel({ open = false, onClose = () => {}, onSelectRule, embedded = false }: RulePanelProps) {
  const { rules, loading } = useRules();
  const { selectedSignatures } = useTemplateStore();
  const [newRuleName, setNewRuleName] = useState('');
  const [creating, setCreating] = useState(false);

  // 创建规则
  const handleCreate = async () => {
    if (!newRuleName.trim()) {
      message.warning('请输入规则名称');
      return;
    }

    if (selectedSignatures.size === 0) {
      message.warning('请先选择模板');
      return;
    }

    setCreating(true);
    try {
      const { createRule } = await import('../../services/api');
      await createRule({
        name: newRuleName,
        templates: Array.from(selectedSignatures),
      });
      message.success('规则创建成功');
      setNewRuleName('');
      // 刷新列表
      window.location.reload();
    } catch (err: any) {
      message.error(err?.message || '创建失败');
    } finally {
      setCreating(false);
    }
  };

  // 删除规则
  const handleDelete = async (id: string) => {
    try {
      const { deleteRule } = await import('../../services/api');
      await deleteRule(id);
      message.success('规则已删除');
      window.location.reload();
    } catch {
      message.error('删除失败');
    }
  };

  // 构建 metric
  const handleBuild = async (id: string) => {
    try {
      const { buildRuleMetric } = await import('../../services/api');
      await buildRuleMetric(id);
      message.success('Metric 构建成功');
    } catch {
      message.error('构建失败');
    }
  };

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: Rule) => (
        <Space>
          <Text strong>{name}</Text>
          {record.merged_arc_count && (
            <Tag>{record.merged_arc_count} 弧</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '模板数',
      dataIndex: 'templates',
      key: 'templates',
      width: 80,
      render: (templates: string[]) => (
        <Tag color="blue">{templates.length}</Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_: any, record: Rule) => (
        <Space>
          <Button
            size="small"
            type="primary"
            icon={<BuildOutlined />}
            onClick={() => handleBuild(record.id)}
          >
            构建
          </Button>
          <Button
            size="small"
            onClick={() => onSelectRule(record.id)}
          >
            应用
          </Button>
          <Popconfirm
            title="确认删除此规则？"
            onConfirm={() => handleDelete(record.id)}
            okText="确认"
            cancelText="取消"
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // 面板内容
  const panelContent = (
    <Space orientation="vertical" style={{ width: '100%' }} size="middle">
      {/* 创建新规则 */}
      <div style={{ padding: 12, background: '#fafafa', borderRadius: 8 }}>
        <Title level={5} style={{ marginBottom: 12 }}>创建规则</Title>

        <Space orientation="vertical" style={{ width: '100%' }} size="small">
          <div>
            <Text>规则名称:</Text>
            <Input
              value={newRuleName}
              onChange={e => setNewRuleName(e.target.value)}
              placeholder="例如: 早高峰禁行"
              style={{ marginTop: 4 }}
            />
          </div>

          <Text type="secondary">
            已选模板: {selectedSignatures.size} 个
          </Text>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleCreate}
            loading={creating}
            disabled={selectedSignatures.size === 0 || !newRuleName.trim()}
          >
            创建并构建 Metric
          </Button>
        </Space>
      </div>

      {/* 规则列表 */}
      {rules.length > 0 ? (
        <Table
          dataSource={rules}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 5 }}
          loading={loading}
        />
      ) : (
        <Empty description="暂无规则" />
      )}
    </Space>
  );

  // 如果是嵌入模式，直接渲染内容；否则使用 Drawer
  if (embedded) {
    return panelContent;
  }

  return (
    <Drawer
      title="规则管理"
      placement="right"
      onClose={onClose}
      open={open}
      size="large"
    >
      {panelContent}
    </Drawer>
  );
}

export default RulePanel;
