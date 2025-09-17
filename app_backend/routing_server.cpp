// ...existing code from navigator_app/backend/routing_server.cpp...
// For parsing command line arguments
#include "cxxopts.hpp"

#include <iostream>
#include <vector>
#include <string>
#include <stdexcept>
#include <functional>
#include <memory>
#include <thread>
#include <sstream>
#include <algorithm>

// System headers for TCP networking
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>

// TJ_RoutingKit headers
#include <routingkit/osm_simple.h>
#include <routingkit/contraction_hierarchy.h>
#include <routingkit/customizable_contraction_hierarchy.h>
#include <routingkit/timer.h>
#include <routingkit/inverse_vector.h>
#include <routingkit/nested_dissection.h>
#include <routingkit/geo_position_to_node.h>
#include <routingkit/cch_traffic_modeler.h>

// --- 数据结构 ---
struct GraphData {
    unsigned node_count;
    unsigned arc_count;
    std::vector<unsigned> first_out;
    std::vector<unsigned> head;
    std::vector<unsigned> travel_time;
    std::vector<float> latitude;
    std::vector<float> longitude;
    std::vector<unsigned> geo_distance;
};

// New struct to hold all shared routing data
struct RoutingData {
    GraphData graph;
    std::unique_ptr<RoutingKit::CustomizableContractionHierarchy> cch; // CCH也必须被持久化
    std::unique_ptr<RoutingKit::CCHTrafficModeler> traffic_modeler;
    std::unique_ptr<RoutingKit::GeoPositionToNode> geo_pos_to_node;
};


// A simple logging function for RoutingKit
void log_message(const std::string& msg) {
    std::cout << msg << std::endl;
}

// -----------------------------------------------------------------------------
// API 处理函数
// -----------------------------------------------------------------------------
void perform_routing(
    float from_lat, float from_lon, float to_lat, float to_lon, const std::string& profile_str,
    const RoutingData& routing_data,
    int client_socket
) {
    std::cout << "[Thread " << std::this_thread::get_id() << "] ==> In perform_routing." << std::endl;
    
    // 2. 查找最近的节点
    unsigned source_node = routing_data.geo_pos_to_node->find_nearest_neighbor_within_radius(from_lat, from_lon, 5000).id;
    unsigned target_node = routing_data.geo_pos_to_node->find_nearest_neighbor_within_radius(to_lat, to_lon, 5000).id;
    std::cout << "[Thread " << std::this_thread::get_id() << "] Found nearest neighbors: source=" << source_node << ", target=" << target_node << std::endl;

    std::string response_json;

    if (source_node == RoutingKit::invalid_id || target_node == RoutingKit::invalid_id) {
        response_json = "{\"error\":\"无法在5公里半径内找到起点或终点。\"}";
    } else {
        // 3. 获取正确的 metric 并创建 query 对象
        const RoutingKit::CustomizableContractionHierarchyMetric* metric;
        if (profile_str == "morning_peak") {
            metric = &routing_data.traffic_modeler->get_metric(RoutingKit::CCHTrafficModeler::TrafficProfile::MORNING_PEAK);
        } else if (profile_str == "evening_peak") {
            metric = &routing_data.traffic_modeler->get_metric(RoutingKit::CCHTrafficModeler::TrafficProfile::EVENING_PEAK);
        } else {
            metric = &routing_data.traffic_modeler->get_metric(RoutingKit::CCHTrafficModeler::TrafficProfile::NORMAL);
        }
        std::cout << "[Thread " << std::this_thread::get_id() << "] Got CCH metric for profile: " << profile_str << std::endl;

        RoutingKit::CustomizableContractionHierarchyQuery query(*metric);
        query.reset().add_source(source_node).add_target(target_node).run();
        std::cout << "[Thread " << std::this_thread::get_id() << "] CCH query finished." << std::endl;
        
        // 关键改动：立即获取所有结果
        unsigned distance = query.get_distance();

        std::cout << "[Thread " << std::this_thread::get_id() << "] Got distance: " << distance << std::endl;

        std::vector<unsigned> path_nodes = query.get_node_path();
        
        std::cout << "[Thread " << std::this_thread::get_id() << "] Got path with " << path_nodes.size() << " nodes." << std::endl;

        if (distance == RoutingKit::inf_weight) {
            response_json = "{\"error\":\"在所选交通模式下找不到路径。\"}";
        } else {
            // 4. 将路径节点转换回经纬度坐标
            std::string path_json = "[";
            if (!path_nodes.empty()) {
                for (size_t i = 0; i < path_nodes.size(); ++i) {
                    path_json += "[" + std::to_string(routing_data.graph.latitude[path_nodes[i]]) + "," + std::to_string(routing_data.graph.longitude[path_nodes[i]]) + "]";
                    if (i < path_nodes.size() - 1) {
                        path_json += ",";
                    }
                }
            }
            path_json += "]";

            // 5. 构建JSON响应
            response_json = "{";
            response_json += "\"distance_meters\": " + std::to_string(distance) + ",";
            response_json += "\"path_coordinates\": " + path_json;
            response_json += "}";
        }
    }

    // 将响应发送回客户端，并添加换行符作为消息分隔符
    response_json += "\n";
    std::cout << "[Thread " << std::this_thread::get_id() << "] Sending response: " << response_json;
    send(client_socket, response_json.c_str(), response_json.length(), 0);
    std::cout << "[Thread " << std::this_thread::get_id() << "] <== perform_routing finished." << std::endl;
}

// --- 核心功能 ---

GraphData load_graph_data(const std::string& pbf_file) {
    std::cout << "正在从 " << pbf_file << " 加载路网图..." << std::endl;
    auto osm_graph = RoutingKit::simple_load_osm_car_routing_graph_from_pbf(pbf_file);
    
    GraphData graph;
    graph.node_count = osm_graph.node_count();
    graph.arc_count = osm_graph.arc_count();
    graph.first_out = std::move(osm_graph.first_out);
    graph.head = std::move(osm_graph.head);
    graph.travel_time = std::move(osm_graph.travel_time);
    graph.latitude = std::move(osm_graph.latitude);
    graph.longitude = std::move(osm_graph.longitude);
    graph.geo_distance = std::move(osm_graph.geo_distance);

    std::cout << "图加载完成. 节点数: " << graph.node_count << ", 边数: " << graph.arc_count << std::endl;
    return graph;
}

// -----------------------------------------------------------------------------
// TCP 连接处理
// -----------------------------------------------------------------------------
void handle_connection(int client_socket, std::shared_ptr<RoutingData> routing_data) {
    std::cout << "[Thread " << std::this_thread::get_id() << "] New connection accepted. Reading data..." << std::endl;
    char buffer[1024] = {0};
    int valread = read(client_socket, buffer, 1024);
    if (valread > 0) {
        std::string line(buffer, valread);
        std::cout << "[Thread " << std::this_thread::get_id() << "] Received data: " << line << std::endl;
        
        // 移除换行符
        line.erase(std::remove(line.begin(), line.end(), '\n'), line.end());
        line.erase(std::remove(line.begin(), line.end(), '\r'), line.end());

        std::stringstream ss(line);
        std::string segment;
        std::vector<std::string> params;
        while(std::getline(ss, segment, ',')) {
           params.push_back(segment);
        }

        if (params.size() >= 4) {
            try {
                float from_lat = std::stof(params[0]);
                float from_lon = std::stof(params[1]);
                float to_lat = std::stof(params[2]);
                float to_lon = std::stof(params[3]);
                std::string profile_str = (params.size() > 4) ? params[4] : "normal";

                perform_routing(from_lat, from_lon, to_lat, to_lon, profile_str, *routing_data, client_socket);
            } catch (const std::invalid_argument& ia) {
                std::string error_msg = "{\"error\":\"输入格式错误，无法解析坐标。\"}\n";
                std::cerr << "[Thread " << std::this_thread::get_id() << "] Invalid argument: " << ia.what() << std::endl;
                send(client_socket, error_msg.c_str(), error_msg.length(), 0);
            }
        } else {
            std::string error_msg = "{\"error\":\"输入格式错误，需要至少4个参数。\"}\n";
            std::cerr << "[Thread " << std::this_thread::get_id() << "] Invalid parameters count: " << params.size() << std::endl;
            send(client_socket, error_msg.c_str(), error_msg.length(), 0);
        }
    } else {
        std::cerr << "[Thread " << std::this_thread::get_id() << "] Read failed or connection closed prematurely." << std::endl;
    }
    close(client_socket);
    std::cout << "[Thread " << std::this_thread::get_id() << "] Connection closed." << std::endl;
}


// -----------------------------------------------------------------------------
// 主函数
// -----------------------------------------------------------------------------
int main(int argc, char* argv[]) {
    // 1. 解析命令行参数
    std::string pbf_file;

    try {
        cxxopts::Options options(argv[0], "TJ_RoutingKit - 路由计算后台服务 (TCP模式)");
        options.add_options()
            ("p,pbf", "PBF文件路径", cxxopts::value<std::string>())
            ("h,help", "打印帮助信息");
        
        auto result = options.parse(argc, argv);

        if (result.count("help")) {
            std::cout << options.help() << std::endl;
            return 0;
        }

        if (!result.count("pbf")) {
            std::cerr << "错误: --pbf 是必需参数。" << std::endl;
            std::cerr << options.help() << std::endl;
            return 1;
        }
        pbf_file = result["pbf"].as<std::string>();

    } catch (const cxxopts::exceptions::exception& e) {
        std::cerr << "解析选项时出错: " << e.what() << std::endl;
        return 1;
    }

    // --- TCP 服务器设置 (快速失败测试) ---
    int server_fd;
    struct sockaddr_in address;
    int opt = 1;
    int addrlen = sizeof(address);
    const int PORT = 12345;

    if ((server_fd = socket(AF_INET, SOCK_STREAM, 0)) == 0) {
        perror("socket failed");
        exit(EXIT_FAILURE);
    }

    if (setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR | SO_REUSEPORT, &opt, sizeof(opt))) {
        perror("setsockopt");
        exit(EXIT_FAILURE);
    }
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = INADDR_ANY;
    address.sin_port = htons(PORT);

    if (bind(server_fd, (struct sockaddr *)&address, sizeof(address)) < 0) {
        perror("bind failed");
        exit(EXIT_FAILURE);
    }
    if (listen(server_fd, 10) < 0) { // Listen with a backlog of 10
        perror("listen");
        exit(EXIT_FAILURE);
    }
    
    std::cout << "TCP 端口 " << PORT << " 绑定成功。现在开始加载地图数据..." << std::endl;

    // --- 数据预加载 ---
    auto routing_data = std::make_shared<RoutingData>();
    
    try {
        routing_data->graph = load_graph_data(pbf_file);

        auto tail = RoutingKit::invert_inverse_vector(routing_data->graph.first_out);
        auto order = RoutingKit::compute_nested_node_dissection_order_using_inertial_flow(
            routing_data->graph.node_count, tail, routing_data->graph.head, routing_data->graph.latitude, routing_data->graph.longitude);

        // 关键修复：将 cch 对象持久化在 RoutingData 中
        routing_data->cch = std::make_unique<RoutingKit::CustomizableContractionHierarchy>(order, tail, routing_data->graph.head);
        
        // 现在 traffic_modeler 使用持久化的 cch 对象
        routing_data->traffic_modeler = std::make_unique<RoutingKit::CCHTrafficModeler>(*routing_data->cch, routing_data->graph.travel_time, routing_data->graph.geo_distance, routing_data->graph.arc_count);
        routing_data->traffic_modeler->build_and_cache_metric(RoutingKit::CCHTrafficModeler::TrafficProfile::NORMAL);
        routing_data->traffic_modeler->build_and_cache_metric(RoutingKit::CCHTrafficModeler::TrafficProfile::MORNING_PEAK);
        routing_data->traffic_modeler->build_and_cache_metric(RoutingKit::CCHTrafficModeler::TrafficProfile::EVENING_PEAK);

        routing_data->geo_pos_to_node = std::make_unique<RoutingKit::GeoPositionToNode>(routing_data->graph.latitude, routing_data->graph.longitude);

    } catch (const std::exception& e) {
        std::cerr << "预加载数据时发生致命错误: " << e.what() << std::endl;
        return 1;
    }
    
    // --- 开始接受连接 ---
    std::cout << "TCP 服务器正在端口 " << PORT << " 上监听..." << std::endl;
    std::cout << "Ready" << std::endl; // 信号：服务器已就绪

    while (true) {
        int new_socket;
        std::cout << "Main thread waiting for new connection..." << std::endl;
        if ((new_socket = accept(server_fd, (struct sockaddr *)&address, (socklen_t*)&addrlen)) < 0) {
            perror("accept");
            continue; // 继续等待下一个连接
        }
        
        // 为每个连接创建一个新线程来处理
        std::cout << "Accepted a new connection. Spawning a handler thread." << std::endl;
        std::thread(handle_connection, new_socket, routing_data).detach();
    }

    return 0;
}