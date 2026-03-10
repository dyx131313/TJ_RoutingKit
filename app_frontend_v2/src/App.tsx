import { Layout, ConfigProvider, theme } from 'antd';
import { MapView, RouteControls, TemplatePanel, RulePanel, Header } from './components';
import { useRouteStore } from './stores';
import './App.css';

const { Content, Sider } = Layout;

function App() {
  const { setRuleId } = useRouteStore();

  const handleSelectRule = (ruleId: string) => {
    setRuleId(ruleId);
  };

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1890ff',
          borderRadius: 6,
        },
      }}
    >
      <Layout style={{ minHeight: '100vh' }}>
        <Header />

        <Layout>
          {/* 左侧控制面板 */}
          <Sider
            width={600}
            style={{
              background: '#fff',
              overflow: 'auto',
              height: 'calc(100vh - 64px)',
              position: 'absolute',
              left: 0,
              top: 64,
            }}
          >
            <div style={{ padding: '16px', paddingBottom: '32px' }}>
              <RouteControls />
              {/* 模板管理 - 嵌入到左侧面板 */}
              <TemplatePanel embedded />
              {/* 规则管理 - 嵌入到左侧面板 */}
              <RulePanel embedded onSelectRule={handleSelectRule} />
            </div>
          </Sider>

          {/* 地图区域 */}
          <Content style={{ position: 'relative', marginLeft: 600 }}>
            <MapView />
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}

export default App;
