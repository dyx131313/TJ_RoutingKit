import { Button, Space, Select, Card, Divider, Typography } from 'antd';
import {
  EnvironmentOutlined,
  AimOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useMapStore, useRouteStore, useRuleStore } from '../../stores';
import { useRoute } from '../../hooks';

const { Text } = Typography;

interface RouteControlsProps {}

export function RouteControls({}: RouteControlsProps) {
  const { from, to, selecting, setSelecting } = useMapStore();
  const { profile, setProfile, ruleId, setRuleId, loading, error, routeResult } = useRouteStore();
  const { rules } = useRuleStore();
  const { executeRoute } = useRoute();

  const handleSelectFrom = () => setSelecting('from');
  const handleSelectTo = () => setSelecting('to');

  const handleRoute = async () => {
    await executeRoute();
  };

  return (
    <Card
      size="small"
      style={{ marginBottom: 8 }}
      styles={{ body: { padding: 12 } }}
    >
      <Space orientation="vertical" size="small" style={{ width: '100%' }}>
        {/* 起点终点输入 */}
        <Space size="middle">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <EnvironmentOutlined style={{ color: '#52c41a' }} />
            <Text strong>起点:</Text>
            <Text>
              {from ? `${from.lat.toFixed(4)}, ${from.lon.toFixed(4)}` : '未选择'}
            </Text>
          </div>
        </Space>

        <Space size="middle">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <EnvironmentOutlined style={{ color: '#f5222d' }} />
            <Text strong>终点:</Text>
            <Text>
              {to ? `${to.lat.toFixed(4)}, ${to.lon.toFixed(4)}` : '未选择'}
            </Text>
          </div>
        </Space>

        <Divider style={{ margin: '8px 0' }} />

        {/* 交通模式 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text>交通模式:</Text>
          <Select
            value={profile}
            onChange={setProfile}
            style={{ width: 140 }}
            options={[
              { value: 'normal', label: '正常' },
              { value: 'morning_peak', label: '早高峰' },
              { value: 'evening_peak', label: '晚高峰' },
            ]}
          />
        </div>

        {/* 规则选择 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text>规则:</Text>
          <Select
            value={ruleId || undefined}
            onChange={setRuleId}
            placeholder="选择规则"
            allowClear
            style={{ width: 160 }}
            options={rules.map(r => ({ value: r.id, label: r.name }))}
          />
        </div>

        <Divider style={{ margin: '8px 0' }} />

        {/* 操作按钮 */}
        <Space wrap>
          <Button
            type={selecting === 'from' ? 'primary' : 'default'}
            icon={<AimOutlined />}
            onClick={handleSelectFrom}
          >
            选择起点
          </Button>
          <Button
            type={selecting === 'to' ? 'primary' : 'default'}
            icon={<AimOutlined />}
            onClick={handleSelectTo}
          >
            选择终点
          </Button>
        </Space>

        <Divider style={{ margin: '8px 0' }} />

        {/* 主要操作 */}
        <Space>
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={handleRoute}
            loading={loading}
            disabled={!from || !to}
            size="large"
          >
            查询路径
          </Button>
        </Space>

        {/* 错误显示 */}
        {error && (
          <Text type="danger">{error}</Text>
        )}

        {/* 结果显示 */}
        {routeResult && (
          <Card size="small" style={{ background: '#f6ffed', marginTop: 8 }}>
            <Space orientation="vertical" size={4}>
              <Text>距离: <Text strong>{((routeResult.distance || routeResult.distance_meters || 0) / 1000).toFixed(2)} km</Text></Text>
              {routeResult.geo_distance_arcs_meters && (
                <Text>沿弧距离: <Text strong>{(routeResult.geo_distance_arcs_meters / 1000).toFixed(2)} km</Text></Text>
              )}
              <Text>预计时间: <Text strong>{Math.round((routeResult.travel_time || routeResult.metric_distance || 0) / 60000)} 分钟</Text></Text>
              {routeResult.metric_unit && (
                <Text type="secondary">
                  度量: {routeResult.metric_unit} (来源: {routeResult.metric_source || '默认'})
                </Text>
              )}
            </Space>
          </Card>
        )}
      </Space>
    </Card>
  );
}

export default RouteControls;
