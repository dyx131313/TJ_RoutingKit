import { Layout, Typography, Space } from 'antd';
import { EnvironmentOutlined } from '@ant-design/icons';

const { Header: AntHeader } = Layout;
const { Title } = Typography;

export function Header() {
  return (
    <AntHeader
      style={{
        background: '#001529',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 64,
        lineHeight: '64px',
      }}
    >
      <Space>
        <EnvironmentOutlined style={{ fontSize: 24, color: '#1890ff' }} />
        <Title
          level={4}
          style={{
            margin: 0,
            color: '#fff',
            fontWeight: 500,
          }}
        >
          TJ_RoutingKit 智能导航
        </Title>
      </Space>
    </AntHeader>
  );
}

export default Header;
