import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Polygon, useMap, useMapEvents } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import L from 'leaflet';
import { useMapStore, useRouteStore, useTemplateStore } from '../../stores';
import { queryNearest } from '../../services/api';
import { message } from 'antd';
import 'leaflet/dist/leaflet.css';

// 地图事件处理组件
function MapEventHandler() {
  const { selecting, drawing, addDrawPoint, setFrom, setTo, setSelecting } = useMapStore();

  useMapEvents({
    click: async (e) => {
      const { lat, lng } = e.latlng;

      if (drawing) {
        // 绘制模式 - 添加点
        addDrawPoint({ lat, lon: lng });
      } else if (selecting) {
        // 选择模式 - 查询最近节点
        try {
          const result = await queryNearest(lat, lng);
          if (selecting === 'from') {
            setFrom({ lat: result.lat, lon: result.lon });
            setSelecting('to');
          } else {
            setTo({ lat: result.lat, lon: result.lon });
          }
        } catch {
          message.error('查询最近节点失败');
        }
      }
    },
  });

  return null;
}

// 自动调整视图组件
function AutoFitBounds() {
  const map = useMap();
  const { routeCoords } = useRouteStore();

  useEffect(() => {
    if (routeCoords && routeCoords.length > 0) {
      // 这里可以添加自动调整视图的逻辑
    }
  }, [map, routeCoords]);

  return null;
}

// 起点标记组件
function FromMarker({ position }: { position: [number, number] }) {
  const icon = L.divIcon({
    html: `<div style="
      width: 28px;
      height: 28px;
      background: #52c41a;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: 14px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    ">S</div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

  return <Marker position={position} icon={icon} />;
}

// 终点标记组件
function ToMarker({ position }: { position: [number, number] }) {
  const icon = L.divIcon({
    html: `<div style="
      width: 28px;
      height: 28px;
      background: #f5222d;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: 14px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    ">T</div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

  return <Marker position={position} icon={icon} />;
}

export function MapView() {
  const { center, zoom, from, to, drawing, drawPoints } = useMapStore();
  const { routeCoords, ruleId } = useRouteStore();
  const { previewData, previewingSignature } = useTemplateStore();
  const { previewArcs } = useMapStore();

  const position: LatLngExpression = [center.lat, center.lon];

  // 构建预览弧线坐标（优先使用 previewArcs，否则兼容 previewData）
  const previewArcCoords = previewArcs
    ? previewArcs.flatMap(arc => [arc.u as [number, number], arc.v as [number, number]])
    : (previewingSignature && previewData && previewData.arc_coords
      ? previewData.arc_coords.flatMap((arc: any) => [arc.u as [number, number], arc.v as [number, number]])
      : []);

  console.log('MapView render:', { routeCoordsCount: routeCoords?.length, previewArcsCount: previewArcs?.length, previewArcCoordsCount: previewArcCoords.length, previewingSignature });

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <MapContainer
        center={position}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
      >
        <TileLayer
          url="http://localhost:3000/tiles/{z}/{x}/{y}.png"
          attribution='&copy; <a href="http://localhost:3000">Offline Tiles</a>'
        />

        <MapEventHandler />
        <AutoFitBounds />

        {/* 起点标记 */}
        {from && (
          <FromMarker position={[from.lat, from.lon]} />
        )}

        {/* 终点标记 */}
        {to && (
          <ToMarker position={[to.lat, to.lon]} />
        )}

        {/* 路径折线 - 有规则时用不同颜色显示 */}
        {routeCoords && routeCoords.length > 0 ? (
          <Polyline
            positions={routeCoords}
            pathOptions={{
              color: (ruleId && ruleId.length > 0) ? '#ff4d4f' : '#1890ff',
              weight: 5,
              opacity: (ruleId && ruleId.length > 0) ? 0.9 : 0.8
            }}
          />
        ) : null}

        {/* 绘制中的多边形 */}
        {drawing && drawPoints.length > 0 && (
          <Polygon
            positions={drawPoints.map(p => [p.lat, p.lon] as LatLngExpression)}
            pathOptions={{ color: '#1890ff', dashArray: '6,6', fillOpacity: 0.1 }}
          />
        )}

        {/* 预览弧线 */}
        {previewArcCoords.length > 0 && (
          <Polyline
            positions={previewArcCoords}
            pathOptions={{ color: '#ff0000', weight: 4, opacity: 1 }}
          />
        )}
      </MapContainer>
    </div>
  );
}

export default MapView;
