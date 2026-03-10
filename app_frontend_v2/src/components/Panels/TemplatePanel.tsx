import { useState, useEffect } from 'react';
import {
  Drawer,
  Button,
  Space,
  Table,
  Tag,
  Checkbox,
  Select,
  Input,
  Typography,
  message,
  Popconfirm,
  Spin,
  Empty,
} from 'antd';
import {
  DeleteOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  PlusOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { useTemplateStore, useMapStore } from '../../stores';
import { useTemplates } from '../../hooks';
import type { Template, TemplateType } from '../../types';

const { Text, Title } = Typography;

interface TemplatePanelProps {
  open?: boolean;
  onClose?: () => void;
  embedded?: boolean;
}

export function TemplatePanel({ open = false, onClose = () => {}, embedded = false }: TemplatePanelProps) {
  const {
    templates,
    templateType,
    arcIdsInput,
    tagKey,
    tagValue,
    selectedSignatures,
    previewingSignature,
    previewData,
    loading,
    setTemplateType,
    setArcIdsInput,
    setTagKey,
    setTagValue,
    loadTemplates,
    removeTemplate,
    previewTemplate,
    closePreview,
  } = useTemplates();

  const { drawPoints, setPreviewArcs, drawing, setDrawing, clearDrawPoints } = useMapStore();
  const [saving, setSaving] = useState(false);
  const [precomputing, setPrecomputing] = useState<string | null>(null);

  // 预计算模板
  const handlePrecompute = async (signature: string) => {
    setPrecomputing(signature);
    try {
      const { precomputeTemplate } = await import('../../services/api');
      await precomputeTemplate(signature);
      message.success('预计算完成，请点击预览查看');
      await loadTemplates();
    } catch (err: any) {
      message.error(err.message || '预计算失败');
    } finally {
      setPrecomputing(null);
    }
  };

  // 监听 previewData 变化并更新地图上的预览弧线
  useEffect(() => {
    console.log('Preview effect triggered:', { previewingSignature, previewData });
    if (previewingSignature && previewData) {
      // 兼容不同的 API 返回格式
      if (previewData.arc_coords && previewData.arc_coords.length > 0) {
        console.log('Setting preview arcs from arc_coords:', previewData.arc_coords.length);
        setPreviewArcs(previewData.arc_coords.map((arc: any) => ({
          u: arc.u,
          v: arc.v,
        })));
      } else if (previewData.preview && previewData.preview.arc_coords && previewData.preview.arc_coords.length > 0) {
        // 处理嵌套在 preview 字段中的数据
        console.log('Setting preview arcs from preview.arc_coords:', previewData.preview.arc_coords.length);
        setPreviewArcs(previewData.preview.arc_coords.map((arc: any) => ({
          u: arc.u,
          v: arc.v,
        })));
      } else {
        console.log('Preview data has no arc_coords:', previewData);
      }
    } else if (!previewingSignature) {
      // 关闭预览时清除
      setPreviewArcs(null);
    }
  }, [previewingSignature, previewData, setPreviewArcs]);

  // 处理绘制多边形
  const handleToggleDrawing = () => {
    setDrawing(!drawing);
    if (drawing) {
      clearDrawPoints();
    }
  };

  // 处理保存模板
  const handleSave = async () => {
    if (templateType === 'polygon' && drawPoints.length < 3) {
      message.warning('请至少绘制3个点形成多边形');
      return;
    }

    setSaving(true);
    try {
      let payload: any = { type: templateType };

      if (templateType === 'polygon') {
        payload.polygon = drawPoints.map(p => [p.lat, p.lon]);
      } else if (templateType === 'arc_ids') {
        payload.arc_ids = arcIdsInput;
      } else if (templateType === 'tag_filter') {
        if (!tagKey || !tagValue) {
          message.warning('请输入标签键值');
          setSaving(false);
          return;
        }
        payload.tag_filter = { key: tagKey, value: tagValue };
      }

      const { createTemplate } = await import('../../services/api');
      await createTemplate(payload);
      message.success('模板保存成功');
      await loadTemplates();

      // 清除绘制
      const { clearDrawPoints } = useMapStore.getState();
      clearDrawPoints();
    } catch (err: any) {
      message.error(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 关闭预览
  const handleClosePreview = () => {
    closePreview();
    setPreviewArcs(null);
  };

  // 处理预览
  const handlePreview = async (signature: string) => {
    if (previewingSignature === signature) {
      // 关闭预览
      handleClosePreview();
    } else {
      // 调用预览 API，数据更新会通过 useEffect 自动同步到地图
      await previewTemplate(signature);
    }
  };

  // 处理删除
  const handleDelete = async (signature: string) => {
    try {
      await removeTemplate(signature);
      message.success('模板已删除');
    } catch {
      message.error('删除失败');
    }
  };

  const columns = [
    {
      title: '选择',
      key: 'checkbox',
      width: 50,
      render: (_: any, record: Template) => (
        <Checkbox
          checked={selectedSignatures.has(record.signature)}
          onChange={() => {
            const { toggleSelected } = useTemplateStore.getState();
            toggleSelected(record.signature);
          }}
        />
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 80,
      render: (type: TemplateType) => (
        <Tag color={type === 'polygon' ? 'blue' : type === 'arc_ids' ? 'green' : 'orange'}>
          {type}
        </Tag>
      ),
    },
    {
      title: '签名',
      dataIndex: 'signature',
      key: 'signature',
      render: (sig: string) => (
        <Text code style={{ fontSize: 10 }}>{sig.slice(0, 12)}...</Text>
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
      render: (_: any, record: Template) => (
        <Space>
          <Button
            size="small"
            type="primary"
            onClick={() => handlePrecompute(record.signature)}
            loading={precomputing === record.signature}
          >
            预计算
          </Button>
          <Button
            size="small"
            icon={previewingSignature === record.signature ? <EyeInvisibleOutlined /> : <EyeOutlined />}
            onClick={() => handlePreview(record.signature)}
          >
            {previewingSignature === record.signature ? '关闭' : '预览'}
          </Button>
          <Popconfirm
            title="确认删除此模板？"
            onConfirm={() => handleDelete(record.signature)}
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
      {/* 创建新模板 */}
      <div style={{ padding: 12, background: '#fafafa', borderRadius: 8 }}>
        <Title level={5} style={{ marginBottom: 12 }}>创建模板</Title>

        <Space orientation="vertical" style={{ width: '100%' }} size="small">
          <div>
            <Text>模板类型:</Text>
            <Select
              value={templateType}
              onChange={setTemplateType}
              style={{ width: '100%', marginTop: 4 }}
              options={[
                { value: 'polygon', label: '多边形区域' },
                { value: 'arc_ids', label: '弧线 ID 列表' },
                { value: 'tag_filter', label: 'OSM 标签过滤' },
              ]}
            />
          </div>

            {templateType === 'arc_ids' && (
              <div>
                <Text>弧线 ID (逗号分隔):</Text>
                <Input
                  value={arcIdsInput}
                  onChange={e => setArcIdsInput(e.target.value)}
                  placeholder="例如: 123,456,789"
                  style={{ marginTop: 4 }}
                />
              </div>
            )}

            {templateType === 'tag_filter' && (
              <Space>
                <div>
                  <Text>Key:</Text>
                  <Input
                    value={tagKey}
                    onChange={e => setTagKey(e.target.value)}
                    placeholder="例如: highway"
                    style={{ marginTop: 4, width: 120 }}
                  />
                </div>
                <div>
                  <Text>Value:</Text>
                  <Input
                    value={tagValue}
                    onChange={e => setTagValue(e.target.value)}
                    placeholder="例如: residential"
                    style={{ marginTop: 4, width: 120 }}
                  />
                </div>
              </Space>
            )}

            {templateType === 'polygon' && (
              <Space orientation="vertical" style={{ width: '100%' }}>
                <Text type="secondary">
                  点击下方按钮进入绘制模式，在地图上点击添加多边形顶点
                </Text>
                <Space>
                  <Button
                    type={drawing ? 'primary' : 'default'}
                    icon={<EditOutlined />}
                    onClick={handleToggleDrawing}
                  >
                    {drawing ? '退出绘制' : '绘制多边形'}
                  </Button>
                  <Button
                    icon={<DeleteOutlined />}
                    onClick={clearDrawPoints}
                    disabled={drawPoints.length === 0}
                  >
                    清除绘制 ({drawPoints.length} 点)
                  </Button>
                </Space>
              </Space>
            )}

            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleSave}
              loading={saving}
              disabled={templateType === 'polygon' && drawPoints.length < 3}
            >
              保存为模板
            </Button>
          </Space>
        </div>

        {/* 已选计数 */}
        <div>
          <Text>已选模板: </Text>
          <Tag color="blue">{selectedSignatures.size}</Tag>
        </div>

        {/* 模板列表 */}
        <Spin spinning={loading}>
          {templates.length > 0 ? (
            <Table
              dataSource={templates}
              columns={columns}
              rowKey="signature"
              size="small"
              pagination={{ pageSize: 5 }}
            />
          ) : (
            <Empty description="暂无模板" />
          )}
        </Spin>
      </Space>
  );

  // 如果是嵌入模式，直接渲染内容；否则使用 Drawer
  if (embedded) {
    return panelContent;
  }

  return (
    <Drawer
      title="模板管理"
      placement="left"
      onClose={onClose}
      open={open}
      size="large"
      extra={
        <Button onClick={loadTemplates} loading={loading}>刷新</Button>
      }
    >
      {panelContent}
    </Drawer>
  );
}

export default TemplatePanel;
