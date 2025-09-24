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
#include <mutex>
#include <condition_variable>

#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>

#include <routingkit/osm_simple.h>
#include <routingkit/contraction_hierarchy.h>
#include <routingkit/customizable_contraction_hierarchy.h>
#include <routingkit/timer.h>
#include <routingkit/inverse_vector.h>
#include <routingkit/nested_dissection.h>
#include <routingkit/geo_position_to_node.h>
#include <routingkit/cch_traffic_modeler.h>
#include <openssl/sha.h>
#include <fstream>
#include <iomanip>
#include <ctime>
#include <sys/stat.h>
#include <errno.h>
#include <cstring>
#include <cmath>
#include <dirent.h>

// Global configuration
int GLOBAL_BUCKET_MINUTES = 30;

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

// Forward declarations for binary vector helpers (used by perform_routing)
template<typename T>
static bool read_vector_bin(const std::string &path, std::vector<T> &v);
template<typename T>
static bool write_vector_bin(const std::string &path, const std::vector<T> &v);

struct RoutingData {
    GraphData graph;
    std::unique_ptr<RoutingKit::CustomizableContractionHierarchy> cch; 
    std::unique_ptr<RoutingKit::CCHTrafficModeler> traffic_modeler;
    std::unique_ptr<RoutingKit::GeoPositionToNode> geo_pos_to_node;
    // bucketed metrics: pointers to metrics (initially point to NORMAL metric)
    std::vector<const RoutingKit::CustomizableContractionHierarchyMetric*> time_bucket_metrics;
    // per-bucket state for on-demand load/build
    struct BucketState {
        std::mutex mtx;
        std::condition_variable cv;
        bool loaded = false;
        bool building = false;
        std::unique_ptr<RoutingKit::CustomizableContractionHierarchyMetric> metric_owned; // when loaded from disk or built
    };
    std::vector<std::unique_ptr<BucketState>> bucket_states;
    // base cache directory for this dataset
    std::string cache_base;
};

// forward declaration for bucket metric loader (defined later)
static const RoutingKit::CustomizableContractionHierarchyMetric* ensure_bucket_metric_loaded(RoutingData &routing_data, const std::string &cache_base, int bucket_idx, int bucket_minutes);


void log_message(const std::string& msg) {
    std::cout << msg << std::endl;
}

// Geometry helpers for RESOLVE_POLY
static bool point_in_polygon(const std::vector<std::pair<double,double>> &poly, double lat, double lon){
    // ray casting algorithm (lon = x, lat = y)
    double x = lon;
    double y = lat;
    bool inside = false;
    size_t n = poly.size();
    if (n < 3) return false;
    for (size_t i = 0, j = n - 1; i < n; j = i++){
        double xi = poly[i].second; // lon
        double yi = poly[i].first;  // lat
        double xj = poly[j].second;
        double yj = poly[j].first;
        bool intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 0.0) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

static int orientation(double ax, double ay, double bx, double by, double cx, double cy){
    double v = (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
    if (std::fabs(v) < 1e-12) return 0;
    return (v > 0) ? 1 : 2;
}

static bool on_segment(double ax, double ay, double bx, double by, double cx, double cy){
    return (std::min(ax,cx) <= bx && bx <= std::max(ax,cx) && std::min(ay,cy) <= by && by <= std::max(ay,cy));
}

static bool segments_intersect(double ax, double ay, double bx, double by, double cx, double cy, double dx, double dy){
    int o1 = orientation(ax,ay,bx,by,cx,cy);
    int o2 = orientation(ax,ay,bx,by,dx,dy);
    int o3 = orientation(cx,cy,dx,dy,ax,ay);
    int o4 = orientation(cx,cy,dx,dy,bx,by);
    if (o1 != o2 && o3 != o4) return true;
    if (o1 == 0 && on_segment(ax,ay,cx,cy,bx,by)) return true;
    if (o2 == 0 && on_segment(ax,ay,dx,dy,bx,by)) return true;
    if (o3 == 0 && on_segment(cx,cy,ax,ay,dx,dy)) return true;
    if (o4 == 0 && on_segment(cx,cy,bx,by,dx,dy)) return true;
    return false;
}

static bool segment_intersects_polygon(const std::vector<std::pair<double,double>> &poly, double a_lat, double a_lon, double b_lat, double b_lon){
    size_t n = poly.size();
    if (n < 2) return false;
    for (size_t i = 0, j = n - 1; i < n; j = i++){
        double pl_lat1 = poly[j].first;
        double pl_lon1 = poly[j].second;
        double pl_lat2 = poly[i].first;
        double pl_lon2 = poly[i].second;
        if (segments_intersect(a_lon, a_lat, b_lon, b_lat, pl_lon1, pl_lat1, pl_lon2, pl_lat2)) return true;
    }
    return false;
}

void perform_routing(
    float from_lat, float from_lon, float to_lat, float to_lon, const std::string& profile_str,
    long query_time_sec,
    std::shared_ptr<RoutingData> routing_data_ptr,
    int client_socket,
        int bucket_minutes,
    const std::string &metric_sig
) {
    std::cout << "[Thread " << std::this_thread::get_id() << "] ==> In perform_routing." << std::endl;
    
    unsigned source_node = routing_data_ptr->geo_pos_to_node->find_nearest_neighbor_within_radius(from_lat, from_lon, 5000).id;
    unsigned target_node = routing_data_ptr->geo_pos_to_node->find_nearest_neighbor_within_radius(to_lat, to_lon, 5000).id;
    std::cout << "[Thread " << std::this_thread::get_id() << "] Found nearest neighbors: source=" << source_node << ", target=" << target_node << std::endl;

    std::string response_json;

    if (source_node == RoutingKit::invalid_id || target_node == RoutingKit::invalid_id) {
        response_json = "{\"error\":\"无法在5公里半径内找到起点或终点。\"}";
    } else {
    const RoutingKit::CustomizableContractionHierarchyMetric* metric = nullptr;
    std::string metric_source = "unknown";
    int chosen_bucket_index = -1;
        // If a metric signature is provided, try to load metric weights from cache and construct a metric
    std::unique_ptr<RoutingKit::CustomizableContractionHierarchyMetric> metric_local_owner;
    std::unique_ptr<std::vector<unsigned>> metric_weights_local;
        if (!metric_sig.empty()) {
            try {
                std::vector<std::string> candidates;
                // primary candidate: configured cache_base
                if (!routing_data_ptr->cache_base.empty()) candidates.push_back(routing_data_ptr->cache_base + "/metric_sig_" + metric_sig + ".bin");
                // also try a direct name in CWD (maintain backward compatibility)
                candidates.push_back(std::string("./metric_sig_") + metric_sig + ".bin");
                // search under ./cache/* for metric_sig_<id>.bin
                const char *cache_root = "./cache";
                DIR *d = opendir(cache_root);
                if (d) {
                    struct dirent *ent;
                    while ((ent = readdir(d)) != nullptr) {
                        if (ent->d_type == DT_DIR) {
                            std::string name = ent->d_name;
                            if (name == "." || name == "..") continue;
                            std::string p = std::string(cache_root) + "/" + name + "/metric_sig_" + metric_sig + ".bin";
                            candidates.push_back(p);
                        }
                    }
                    closedir(d);
                }

                bool loaded_ok = false;
                for (const auto &metric_path : candidates) {
                    std::vector<unsigned> weights;
                    std::cout << "Attempting to load metric signature from: " << metric_path << std::endl;
                    // attempt to read header first to log count if file exists
                    std::ifstream fh(metric_path, std::ios::binary);
                    if (fh) {
                        uint64_t n = 0;
                        fh.read(reinterpret_cast<char*>(&n), sizeof(n));
                        if (fh) {
                            std::cout << "Metric file header (N) reported: " << n << " for file: " << metric_path << std::endl;
                        }
                        fh.close();
                    }
                    if (read_vector_bin(metric_path, weights)) {
                        std::cout << "Read metric file '" << metric_path << "' with weights count=" << weights.size() << std::endl;
                        if (weights.size() == routing_data_ptr->graph.travel_time.size()) {
                        metric_weights_local = std::make_unique<std::vector<unsigned>>(std::move(weights));
                        metric_local_owner = std::make_unique<RoutingKit::CustomizableContractionHierarchyMetric>(*routing_data_ptr->cch, *metric_weights_local);
                            metric_local_owner->customize();
                            metric = metric_local_owner.get();
                            metric_source = std::string("signature:") + metric_path;
                            std::cout << "Loaded metric from signature file: " << metric_path << std::endl;
                            loaded_ok = true;
                            break;
                        } else {
                            std::cerr << "Metric signature file weights size mismatch: " << metric_path << " (" << weights.size() << " vs " << routing_data_ptr->graph.travel_time.size() << ")" << std::endl;
                        }
                    } else {
                        std::cerr << "Failed to read metric signature file: " << metric_path << std::endl;
                    }
                }
                if (!loaded_ok) {
                    std::cerr << "No usable metric signature found for id: " << metric_sig << std::endl;
                }
            } catch (const std::exception &e) {
                std::cerr << "Failed loading metric_sig file: " << e.what() << std::endl;
            }
        }
        if (!metric) {
            if (profile_str == "morning_peak") {
                metric = &routing_data_ptr->traffic_modeler->get_metric(RoutingKit::CCHTrafficModeler::TrafficProfile::MORNING_PEAK);
                metric_source = "traffic_modeler:morning_peak";
            } else if (profile_str == "evening_peak") {
                metric = &routing_data_ptr->traffic_modeler->get_metric(RoutingKit::CCHTrafficModeler::TrafficProfile::EVENING_PEAK);
                metric_source = "traffic_modeler:evening_peak";
            } else {
                // if bucketed metrics are available and query_time_sec provided, pick bucket
                auto rd_ptr = routing_data_ptr; // convenience
                if (!rd_ptr->time_bucket_metrics.empty()) {
                    long t = query_time_sec;
                    if (t <= 0) t = std::time(nullptr);
                    int minutes = (bucket_minutes > 0) ? bucket_minutes : 30;
                    int bucket_index = ((t % 86400) / (minutes * 60)) % rd_ptr->time_bucket_metrics.size();
                    // ensure the bucket metric is loaded (may build on-demand)
                    const RoutingKit::CustomizableContractionHierarchyMetric* loaded = ensure_bucket_metric_loaded(*rd_ptr, rd_ptr->cache_base, bucket_index, minutes);
                    if (loaded) {
                        metric = loaded;
                        chosen_bucket_index = bucket_index;
                        metric_source = std::string("bucket:") + std::to_string(bucket_index);
                    }
                }
                if (!metric) {
                    metric = &routing_data_ptr->traffic_modeler->get_metric(RoutingKit::CCHTrafficModeler::TrafficProfile::NORMAL);
                    // Only set metric_source to NORMAL if it wasn't set by bucket selection
                    if (metric_source == "unknown") metric_source = "traffic_modeler:normal";
                }
            }
        }
        std::cout << "[Thread " << std::this_thread::get_id() << "] Got CCH metric for profile: " << profile_str << std::endl;

                RoutingKit::CustomizableContractionHierarchyQuery query(*metric);
        query.reset().add_source(source_node).add_target(target_node).run();
        std::cout << "[Thread " << std::this_thread::get_id() << "] CCH query finished." << std::endl;
        
    unsigned distance = query.get_distance();

    std::cout << "[Thread " << std::this_thread::get_id() << "] Got distance: " << distance << std::endl;

        std::vector<unsigned> path_nodes = query.get_node_path();
        
        std::cout << "[Thread " << std::this_thread::get_id() << "] Got path with " << path_nodes.size() << " nodes." << std::endl;

        if (distance == RoutingKit::inf_weight) {
            // Diagnostic: if a custom metric was used and we got no path, check connectivity
            if (!metric_sig.empty() && metric_local_owner) {
                try {
                    if (!metric_weights_local) {
                        std::cerr << "Diagnostic: no metric_weights_local available for metric_sig=" << metric_sig << std::endl;
                        throw std::runtime_error("no metric weights available");
                    }
                    const std::vector<unsigned> &w = *metric_weights_local;
                    unsigned long big_count = 0;
                    unsigned long allowed_count = 0;
                    unsigned threshold = 100000; // consider weights >= threshold as blocked
                    for (size_t i = 0; i < w.size(); ++i) {
                        if (w[i] >= threshold) big_count++;
                        else allowed_count++;
                    }
                    std::cout << "[Thread " << std::this_thread::get_id() << "] Diagnostic: metric_sig='" << metric_sig << "' big_count=" << big_count << " allowed_count=" << allowed_count << std::endl;
                    // quick BFS from source to target using allowed arcs only
                    std::vector<char> vis(routing_data_ptr->graph.node_count, 0);
                    std::vector<unsigned> q;
                    q.reserve(1024);
                    q.push_back(source_node);
                    vis[source_node] = 1;
                    size_t qi = 0;
                    bool reachable = false;
                    while (qi < q.size()) {
                        unsigned u = q[qi++];
                        if (u == target_node) { reachable = true; break; }
                        unsigned start = routing_data_ptr->graph.first_out[u];
                        unsigned end = (u+1 < routing_data_ptr->graph.first_out.size()) ? routing_data_ptr->graph.first_out[u+1] : routing_data_ptr->graph.arc_count;
                        for (unsigned e = start; e < end; ++e) {
                            if (w[e] >= threshold) continue; // blocked
                            unsigned v = routing_data_ptr->graph.head[e];
                            if (!vis[v]) { vis[v]=1; q.push_back(v); }
                        }
                    }
                    std::cout << "[Thread " << std::this_thread::get_id() << "] Diagnostic: reachable_with_allowed_arcs=" << (reachable?"yes":"no") << std::endl;
                } catch (const std::exception &e) {
                    std::cerr << "Diagnostic check failed: " << e.what() << std::endl;
                }
            }
            response_json = "{\"error\":\"在所选交通模式下找不到路径。\"}";
        } else {
            std::string path_json = "[";
                    if (!path_nodes.empty()) {
                for (size_t i = 0; i < path_nodes.size(); ++i) {
                    path_json += "[" + std::to_string(routing_data_ptr->graph.latitude[path_nodes[i]]) + "," + std::to_string(routing_data_ptr->graph.longitude[path_nodes[i]]) + "]";
                    if (i < path_nodes.size() - 1) {
                        path_json += ",";
                    }
                }
            }
            path_json += "]";

            // compute geographic length (meters) from node coordinates as a more accurate physical distance
            auto deg2rad = [](double deg){ return deg * M_PI / 180.0; };
            double geo_len_m = 0.0;
            if (path_nodes.size() >= 2) {
                for (size_t i = 1; i < path_nodes.size(); ++i) {
                    unsigned a = path_nodes[i-1];
                    unsigned b = path_nodes[i];
                    double lat1 = routing_data_ptr->graph.latitude[a];
                    double lon1 = routing_data_ptr->graph.longitude[a];
                    double lat2 = routing_data_ptr->graph.latitude[b];
                    double lon2 = routing_data_ptr->graph.longitude[b];
                    double dlat = deg2rad(lat2 - lat1);
                    double dlon = deg2rad(lon2 - lon1);
                    double rlat1 = deg2rad(lat1);
                    double rlat2 = deg2rad(lat2);
                    double sin_dlat = std::sin(dlat/2.0);
                    double sin_dlon = std::sin(dlon/2.0);
                    double a_hav = sin_dlat*sin_dlat + std::cos(rlat1)*std::cos(rlat2)*sin_dlon*sin_dlon;
                    double c = 2.0 * std::atan2(std::sqrt(a_hav), std::sqrt(std::max(0.0, 1.0 - a_hav)));
                    const double R = 6371000.0; // earth radius in meters
                    geo_len_m += R * c;
                }
            }

            unsigned long geo_len_round = static_cast<unsigned long>(std::llround(geo_len_m));
            // compute arc-based geo_distance sum if graph.geo_distance is available
            unsigned long geo_arc_sum = 0;
            bool have_geo_arc = false;
            if (path_nodes.size() >= 2 && routing_data_ptr->graph.geo_distance.size() > 0) {
                // prefer using the arc path returned by the CCH query when available
                std::vector<unsigned> arc_path = query.get_arc_path();
                if (!arc_path.empty()) {
                    have_geo_arc = true;
                    for (unsigned a : arc_path) {
                        if (a < routing_data_ptr->graph.geo_distance.size()) geo_arc_sum += routing_data_ptr->graph.geo_distance[a];
                        else { have_geo_arc = false; break; }
                    }
                } else {
                    // fallback: map consecutive node pairs to outgoing arcs (older approach)
                    have_geo_arc = true;
                    for (size_t i = 1; i < path_nodes.size(); ++i) {
                        unsigned u = path_nodes[i-1];
                        unsigned v = path_nodes[i];
                        unsigned start = routing_data_ptr->graph.first_out[u];
                        unsigned end = (u+1 < routing_data_ptr->graph.first_out.size()) ? routing_data_ptr->graph.first_out[u+1] : routing_data_ptr->graph.arc_count;
                        bool found = false;
                        for (unsigned a = start; a < end; ++a) {
                            if (routing_data_ptr->graph.head[a] == v) {
                                if (a < routing_data_ptr->graph.geo_distance.size()) {
                                    geo_arc_sum += routing_data_ptr->graph.geo_distance[a];
                                }
                                found = true;
                                break;
                            }
                        }
                        if (!found) { have_geo_arc = false; break; }
                    }
                }
            }

            response_json = "{";
            // original `distance` is the sum of metric weights (may represent travel_time/ms or other units)
            response_json += "\"metric_distance\": " + std::to_string(distance) + ",";
            // return metric_source and metric_unit to avoid ambiguity
            response_json += "\"metric_source\": \"" + metric_source + "\",";
            std::string metric_unit = "unknown";
            if (routing_data_ptr->graph.travel_time.size() == routing_data_ptr->graph.geo_distance.size()) metric_unit = "ms";
            response_json += "\"metric_unit\": \"" + metric_unit + "\",";
            response_json += "\"distance_meters\": " + std::to_string(geo_len_round) + ",";
            if (have_geo_arc) response_json += "\"geo_distance_arcs_meters\": " + std::to_string(geo_arc_sum) + ",";
            response_json += "\"path_coordinates\": " + path_json;
            response_json += "}";
        }
    }

    response_json += "\n";
    std::cout << "[Thread " << std::this_thread::get_id() << "] Sending response: " << response_json;
    send(client_socket, response_json.c_str(), response_json.length(), 0);
    std::cout << "[Thread " << std::this_thread::get_id() << "] <== perform_routing finished." << std::endl;
}


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

// --- 简单缓存工具: 计算文件 SHA256、读写向量二进制 ---
static std::string sha256_file(const std::string &path) {
    std::ifstream f(path, std::ios::binary);
    if (!f) return std::string();
    SHA256_CTX ctx;
    SHA256_Init(&ctx);
    const size_t buf_size = 1 << 20;
    std::vector<char> buf(buf_size);
    while (f) {
        f.read(buf.data(), buf_size);
        std::streamsize s = f.gcount();
        if (s > 0) SHA256_Update(&ctx, buf.data(), (size_t)s);
    }
    unsigned char hash[SHA256_DIGEST_LENGTH];
    SHA256_Final(hash, &ctx);
    std::ostringstream oss;
    oss << std::hex << std::setfill('0');
    for (int i = 0; i < SHA256_DIGEST_LENGTH; ++i) {
        oss << std::setw(2) << static_cast<int>(hash[i]);
    }
    return oss.str();
}

template<typename T>
static bool write_vector_bin(const std::string &path, const std::vector<T> &v) {
    std::ofstream out(path, std::ios::binary);
    if (!out) return false;
    uint64_t n = v.size();
    out.write(reinterpret_cast<const char*>(&n), sizeof(n));
    if (n) out.write(reinterpret_cast<const char*>(v.data()), sizeof(T) * n);
    return out.good();
}

template<typename T>
static bool read_vector_bin(const std::string &path, std::vector<T> &v) {
    std::ifstream in(path, std::ios::binary);
    if (!in) return false;
    uint64_t n = 0;
    in.read(reinterpret_cast<char*>(&n), sizeof(n));
    if (!in) return false;
    v.resize(n);
    if (n) in.read(reinterpret_cast<char*>(v.data()), sizeof(T) * n);
    return in.good();
}

// Forward declarations so functions defined earlier can call these helpers.
template<typename T>
static bool read_vector_bin(const std::string &path, std::vector<T> &v);
template<typename T>
static bool write_vector_bin(const std::string &path, const std::vector<T> &v);

static bool ensure_dir_exists(const std::string &dir) {
    // Create directories recursively (like mkdir -p)
    if (dir.empty()) return false;
    std::string path;
    // If absolute path, preserve leading '/'
    if (dir[0] == '/') path = "/";
    for (size_t i = 0; i < dir.size(); ++i) {
        path += dir[i];
        if (dir[i] == '/' || i + 1 == dir.size()) {
            // skip if path is just "/"
            if (path == "/") continue;
            struct stat st;
            if (stat(path.c_str(), &st) != 0) {
                if (mkdir(path.c_str(), 0755) != 0) {
                    if (errno == EEXIST) continue;
                    std::cerr << "ensure_dir_exists: mkdir failed for '" << path << "': " << std::strerror(errno) << std::endl;
                    return false;
                }
            } else {
                if (!S_ISDIR(st.st_mode)) {
                    std::cerr << "ensure_dir_exists: path exists and is not a directory: '" << path << "'" << std::endl;
                    return false;
                }
            }
        }
    }
    return true;
}

static bool save_cache_files(const std::string &cache_dir, const std::vector<unsigned> &order, const std::vector<unsigned> &tail) {
    if (!ensure_dir_exists(cache_dir)) {
        std::cerr << "save_cache_files: ensure_dir_exists failed for '" << cache_dir << "'" << std::endl;
        return false;
    }
    std::string order_path = cache_dir + "/order.bin";
    std::string tail_path = cache_dir + "/tail.bin";
    bool ok1 = write_vector_bin(order_path, order);
    if (!ok1) std::cerr << "save_cache_files: failed to write '" << order_path << "'" << std::endl;
    bool ok2 = write_vector_bin(tail_path, tail);
    if (!ok2) std::cerr << "save_cache_files: failed to write '" << tail_path << "'" << std::endl;
    // write metadata timestamp
    std::string meta_path = cache_dir + "/metadata.txt";
    std::ofstream meta(meta_path);
    if (meta) {
        std::time_t t = std::time(nullptr);
        meta << "created_at=" << std::asctime(std::localtime(&t));
    } else {
        std::cerr << "save_cache_files: failed to write metadata to '" << meta_path << "'" << std::endl;
    }
    return ok1 && ok2;
}

static bool load_cache_files(const std::string &cache_dir, std::vector<unsigned> &order, std::vector<unsigned> &tail) {
    std::string order_path = cache_dir + "/order.bin";
    std::string tail_path = cache_dir + "/tail.bin";
    if (!read_vector_bin(order_path, order)) return false;
    if (!read_vector_bin(tail_path, tail)) return false;
    return true;
}

static bool save_metric_marker(const std::string &cache_dir, int bucket_idx) {
    if (!ensure_dir_exists(cache_dir)) return false;
    std::string path = cache_dir + "/metric_bucket_" + std::to_string(bucket_idx) + ".meta";
    std::ofstream out(path);
    if (!out) return false;
    std::time_t t = std::time(nullptr);
    out << "profile=NORMAL\n";
    out << "created_at=" << std::asctime(std::localtime(&t));
    return true;
}

static bool load_metric_marker(const std::string &cache_dir, int bucket_idx) {
    std::string path = cache_dir + "/metric_bucket_" + std::to_string(bucket_idx) + ".meta";
    std::ifstream in(path);
    return !!in;
}

// Save/Load arc-weight vector for a specific bucket. We store travel_time-like weights as unsigned ints.
static bool save_bucket_weights(const std::string &cache_dir, int bucket_idx, const std::vector<unsigned> &weights) {
    if (!ensure_dir_exists(cache_dir)) return false;
    std::string tmp = cache_dir + "/metric_bucket_" + std::to_string(bucket_idx) + ".bin.tmp";
    std::string finalp = cache_dir + "/metric_bucket_" + std::to_string(bucket_idx) + ".bin";
    if (!write_vector_bin(tmp, weights)) return false;
    // atomic rename
    if (std::rename(tmp.c_str(), finalp.c_str()) != 0) {
        std::cerr << "save_bucket_weights: rename failed: " << std::strerror(errno) << std::endl;
        std::remove(tmp.c_str());
        return false;
    }
    return true;
}

static bool load_bucket_weights(const std::string &cache_dir, int bucket_idx, std::vector<unsigned> &weights) {
    std::string finalp = cache_dir + "/metric_bucket_" + std::to_string(bucket_idx) + ".bin";
    return read_vector_bin(finalp, weights);
}

// Deterministic generator for per-bucket arc weights based on base travel_time.
// This is a lightweight, reproducible fallback when we cannot generate weights
// via the full traffic modeler API in-process. It applies a small, deterministic
// perturbation to the base travel times so that different buckets differ.
static std::vector<unsigned> generate_bucket_weights_from_base(const std::vector<unsigned> &base_travel_time, int bucket_idx) {
    std::vector<unsigned> out;
    out.resize(base_travel_time.size());
    const unsigned seed = static_cast<unsigned>(bucket_idx) + 0x9e3779b9u;
    for (size_t i = 0; i < base_travel_time.size(); ++i) {
        unsigned base = base_travel_time[i];
        // mix arc index and bucket to produce small deterministic variation
        unsigned h = static_cast<unsigned>(i) * 2654435761u + seed;
        // produce a signed delta in range [-10%, +30%] roughly
        int delta_pct = static_cast<int>((h % 41)) - 10; // [-10,30]
        long long w = base;
        long long adjusted = w + (w * delta_pct) / 100;
        if (adjusted < 1) adjusted = 1;
        if (adjusted > 0x7fffffff) adjusted = 0x7fffffff;
        out[i] = static_cast<unsigned>(adjusted);
    }
    return out;
}

// Ensure the metric for bucket is loaded; if not present on disk, build using traffic_modeler and persist.
static const RoutingKit::CustomizableContractionHierarchyMetric* ensure_bucket_metric_loaded(
    RoutingData &routing_data, const std::string &cache_base, int bucket_idx, int bucket_minutes)
{
    if (bucket_idx < 0 || bucket_idx >= (int)routing_data.bucket_states.size()) return nullptr;
    auto &bs = routing_data.bucket_states[bucket_idx];
    std::unique_lock<std::mutex> lk(bs->mtx);
    if (bs->loaded) return bs->metric_owned.get();
    if (bs->building) {
        // wait until built
        bs->cv.wait(lk, [&bs]{ return bs->loaded || !bs->building; });
        return bs->loaded ? bs->metric_owned.get() : nullptr;
    }
    // begin build/load
    bs->building = true;
    lk.unlock();

    // try load from disk
    std::vector<unsigned> weights;
    bool loaded_from_disk = load_bucket_weights(cache_base, bucket_idx, weights);

    if (loaded_from_disk) {
        try {
            // Construct metric directly from weights and customize
            auto metric_ptr = std::make_unique<RoutingKit::CustomizableContractionHierarchyMetric>(*routing_data.cch, weights);
            metric_ptr->customize();
            lk.lock();
            bs->metric_owned = std::move(metric_ptr);
            bs->loaded = true;
            bs->building = false;
            lk.unlock();
            bs->cv.notify_all();
            std::cout << "Loaded bucket metric from disk for bucket " << bucket_idx << std::endl;
            return bs->metric_owned.get();
        } catch (const std::exception &e) {
            std::cerr << "Failed to construct metric from disk weights for bucket " << bucket_idx << ": " << e.what() << std::endl;
            // fallthrough to rebuild
        }
    }

    // Not loaded from disk: generate deterministic bucket weights from base travel_time
    try {
        std::vector<unsigned> arc_weights = generate_bucket_weights_from_base(routing_data.graph.travel_time, bucket_idx);

        auto metric_ptr = std::make_unique<RoutingKit::CustomizableContractionHierarchyMetric>(*routing_data.cch, arc_weights);
        metric_ptr->customize();

        // persist
        if (!save_bucket_weights(cache_base, bucket_idx, arc_weights)) {
            std::cerr << "Warning: failed to save bucket weights for bucket " << bucket_idx << std::endl;
        } else {
            save_metric_marker(cache_base, bucket_idx);
        }

        lk.lock();
        bs->metric_owned = std::move(metric_ptr);
        bs->loaded = true;
        bs->building = false;
        lk.unlock();
        bs->cv.notify_all();
        std::cout << "Built and saved deterministic bucket metric for bucket " << bucket_idx << std::endl;
        return bs->metric_owned.get();
    } catch (const std::exception &e) {
        std::cerr << "Failed to build deterministic bucket metric for bucket " << bucket_idx << ": " << e.what() << std::endl;
        lk.lock();
        bs->building = false;
        lk.unlock();
        bs->cv.notify_all();
        return nullptr;
    }
}


void handle_connection(int client_socket, std::shared_ptr<RoutingData> routing_data) {
    std::cout << "[Thread " << std::this_thread::get_id() << "] New connection accepted. Reading data..." << std::endl;
    char buffer[1024] = {0};
    int valread = read(client_socket, buffer, 1024);
    if (valread > 0) {
        std::string line(buffer, valread);
        std::cout << "[Thread " << std::this_thread::get_id() << "] Received data: " << line << std::endl;
        
        line.erase(std::remove(line.begin(), line.end(), '\n'), line.end());
        line.erase(std::remove(line.begin(), line.end(), '\r'), line.end());

        std::stringstream ss(line);
        std::string segment;
        std::vector<std::string> params;
        while(std::getline(ss, segment, ',')) {
              // trim spaces
              while(!segment.empty() && isspace((unsigned char)segment.front())) segment.erase(0,1);
              while(!segment.empty() && isspace((unsigned char)segment.back())) segment.pop_back();
              params.push_back(segment);
        }

        // extract possible metric_sig parameter from params (formats: "metric_sig:HEX" or "metric_sig=HEX" or ["metric_sig", "HEX"]).
        // Normalize/truncate the extracted value to be robust against clients that already include a "metric_sig_" prefix
        std::string extracted_metric_sig;
        for (size_t pi = 0; pi < params.size(); ++pi) {
            const std::string &p = params[pi];
            if (p.rfind("metric_sig:", 0) == 0) {
                extracted_metric_sig = p.substr(strlen("metric_sig:"));
                break;
            }
            if (p.rfind("metric_sig=", 0) == 0) {
                extracted_metric_sig = p.substr(strlen("metric_sig="));
                break;
            }
            if (p == "metric_sig" && pi + 1 < params.size()) {
                extracted_metric_sig = params[pi+1];
                break;
            }
        }

        // sanitize extracted_metric_sig: trim whitespace and remove stray control chars
        if (!extracted_metric_sig.empty()) {
            // trim front
            while (!extracted_metric_sig.empty() && isspace((unsigned char)extracted_metric_sig.front())) extracted_metric_sig.erase(0,1);
            // trim back
            while (!extracted_metric_sig.empty() && isspace((unsigned char)extracted_metric_sig.back())) extracted_metric_sig.pop_back();
            // remove any embedded CR/LF that somehow survived
            extracted_metric_sig.erase(std::remove(extracted_metric_sig.begin(), extracted_metric_sig.end(), '\n'), extracted_metric_sig.end());
            extracted_metric_sig.erase(std::remove(extracted_metric_sig.begin(), extracted_metric_sig.end(), '\r'), extracted_metric_sig.end());
            // if the client already provided a name that includes the 'metric_sig_' prefix, strip it so later path construction is consistent
            const std::string prefix = "metric_sig_";
            if (extracted_metric_sig.rfind(prefix, 0) == 0) {
                extracted_metric_sig = extracted_metric_sig.substr(prefix.size());
            }
            // additional safety: if value accidentally contains a leading 'metric_sig:' or 'metric_sig=' remove it
            if (extracted_metric_sig.rfind("metric_sig:", 0) == 0) extracted_metric_sig = extracted_metric_sig.substr(strlen("metric_sig:"));
            if (extracted_metric_sig.rfind("metric_sig=", 0) == 0) extracted_metric_sig = extracted_metric_sig.substr(strlen("metric_sig="));
            std::cout << "[Thread " << std::this_thread::get_id() << "] Sanitized metric_sig: '" << extracted_metric_sig << "'" << std::endl;
        }

        // Special-case: NEAREST,lat,lon  -> return nearest node coordinates
        if (!params.empty()) {
            std::string up0 = params[0];
            // uppercase copy for case-insensitive compare
            std::string up0u = up0;
            std::transform(up0u.begin(), up0u.end(), up0u.begin(), [](unsigned char c){ return std::toupper(c); });
                if (up0u == "NEAREST") {
                if (params.size() >= 3) {
                    try {
                        float qlat = std::stof(params[1]);
                        float qlon = std::stof(params[2]);
                        unsigned nid = routing_data->geo_pos_to_node->find_nearest_neighbor_within_radius(qlat, qlon, 5000).id;
                        if (nid == RoutingKit::invalid_id) {
                            std::string error_msg = "{\"error\":\"无法在5公里半径内找到最近点。\"}\n";
                            send(client_socket, error_msg.c_str(), error_msg.length(), 0);
                        } else {
                            double snapped_lat = static_cast<double>(routing_data->graph.latitude[nid]);
                            double snapped_lon = static_cast<double>(routing_data->graph.longitude[nid]);
                            // compute simple snapped distance (approx) in meters using geo_distance if available
                            unsigned snapped_distance = 0;
                            try {
                                // find nearest arc index approximate by using geo_distance of node if present
                                // fallback: 0
                                if (nid < routing_data->graph.geo_distance.size()) snapped_distance = routing_data->graph.geo_distance[nid];
                            } catch(...) { snapped_distance = 0; }

                            std::ostringstream oss;
                            // keep old lat/lon keys for compatibility, add clearer latitude/longitude and snapped_distance_meters
                            oss << "{\"node\": " << nid
                                << ", \"lat\": " << snapped_lat
                                << ", \"lon\": " << snapped_lon
                                << ", \"latitude\": " << snapped_lat
                                << ", \"longitude\": " << snapped_lon
                                << ", \"snapped_distance_meters\": " << snapped_distance
                                << "}\n";
                            std::string resp = oss.str();
                            std::cout << "[Thread " << std::this_thread::get_id() << "] NEAREST response: " << resp;
                            send(client_socket, resp.c_str(), resp.length(), 0);
                        }
                    } catch (const std::exception &e) {
                        std::string error_msg = "{\"error\":\"NEAREST 参数解析错误。\"}\n";
                        std::cerr << "[Thread " << std::this_thread::get_id() << "] NEAREST parse error: " << e.what() << std::endl;
                        send(client_socket, error_msg.c_str(), error_msg.length(), 0);
                    }
                } else {
                    std::string error_msg = "{\"error\":\"NEAREST 需要 lat 和 lon 两个参数。\"}\n";
                    send(client_socket, error_msg.c_str(), error_msg.length(), 0);
                }
                close(client_socket);
                std::cout << "[Thread " << std::this_thread::get_id() << "] Connection closed after NEAREST." << std::endl;
                return;
            }
            // INFO: return simple graph metadata (node_count, arc_count)
            if (up0u == "INFO" || up0u == "METADATA") {
                try {
                    unsigned node_count = routing_data->graph.node_count;
                    unsigned arc_count = routing_data->graph.arc_count;
                    unsigned travel_time_count = static_cast<unsigned>(routing_data->graph.travel_time.size());
                    std::ostringstream oss;
                    oss << "{\"node_count\": " << node_count << ", \"arc_count\": " << arc_count << ", \"travel_time_count\": " << travel_time_count << "}\n";
                    std::string resp = oss.str();
                    send(client_socket, resp.c_str(), resp.length(), 0);
                } catch (...) {
                    std::string err = "{\"error\": \"failed to gather metadata\"}\n";
                    send(client_socket, err.c_str(), err.length(), 0);
                }
                close(client_socket);
                std::cout << "[Thread " << std::this_thread::get_id() << "] INFO responded." << std::endl;
                return;
            }
            // RESOLVE_POLY: RESOLVE_POLY,<lat1>,<lon1>,<lat2>,<lon2>,...,<latN>,<lonN>
            if (up0u == "RESOLVE_POLY") {
                if (params.size() >= 7 && ((params.size() - 1) % 2 == 0)) {
                    try {
                        std::vector<std::pair<double,double>> poly;
                        for (size_t i = 1; i + 1 < params.size(); i += 2) {
                            double plat = std::stod(params[i]);
                            double plon = std::stod(params[i+1]);
                            poly.emplace_back(plat, plon);
                        }
                        if (poly.size() < 3) {
                            std::string err = "{\"error\":\"多边形顶点至少需要3个点。\"}\n";
                            send(client_socket, err.c_str(), err.length(), 0);
                            close(client_socket);
                            return;
                        }

                        double minlat = poly[0].first, maxlat = poly[0].first, minlon = poly[0].second, maxlon = poly[0].second;
                        for (const auto &p : poly) {
                            minlat = std::min(minlat, p.first);
                            maxlat = std::max(maxlat, p.first);
                            minlon = std::min(minlon, p.second);
                            maxlon = std::max(maxlon, p.second);
                        }

                        std::vector<unsigned> affected_arcs;
                        // Scan all arcs in the graph and test against polygon
                        const GraphData &g = routing_data->graph;
                        for (unsigned u = 0; u < g.node_count; ++u) {
                            unsigned start = g.first_out[u];
                            unsigned end = (u + 1 < g.node_count) ? g.first_out[u+1] : g.arc_count;
                            double ulat = static_cast<double>(g.latitude[u]);
                            double ulon = static_cast<double>(g.longitude[u]);
                            // quick bbox check per-source node
                            if (ulat > maxlat || ulat < minlat) {
                                // still need to check arcs where v might be inside, so don't skip entirely
                            }
                            for (unsigned a = start; a < end; ++a) {
                                unsigned v = g.head[a];
                                double vlat = static_cast<double>(g.latitude[v]);
                                double vlon = static_cast<double>(g.longitude[v]);

                                // bbox prefilter
                                if (std::max(ulat, vlat) < minlat) continue;
                                if (std::min(ulat, vlat) > maxlat) continue;
                                if (std::max(ulon, vlon) < minlon) continue;
                                if (std::min(ulon, vlon) > maxlon) continue;

                                bool hit = false;
                                if (point_in_polygon(poly, ulat, ulon) || point_in_polygon(poly, vlat, vlon)) hit = true;
                                else if (segment_intersects_polygon(poly, ulat, ulon, vlat, vlon)) hit = true;

                                if (hit) affected_arcs.push_back(a);
                            }
                        }

                        std::ostringstream oss;
                        oss << "{\"arc_count\": " << affected_arcs.size() << ", \"arc_ids\": [";
                        for (size_t i = 0; i < affected_arcs.size(); ++i) {
                            if (i) oss << ",";
                            oss << affected_arcs[i];
                        }
                        oss << "]";
                        // add a limited preview of arc endpoint coordinates to help frontend visualize
                        size_t preview_limit = 500;
                        if (!affected_arcs.empty()) {
                            oss << ", \"arc_coords\": [";
                            size_t added = 0;
                            for (size_t idx = 0; idx < affected_arcs.size() && added < preview_limit; ++idx) {
                                unsigned a = affected_arcs[idx];
                                if (a < g.head.size()) {
                                    // find source node u quickly using upper_bound on first_out
                                    unsigned u = 0;
                                    auto it = std::upper_bound(g.first_out.begin(), g.first_out.begin() + g.node_count, a);
                                    if (it == g.first_out.begin()) u = 0;
                                    else u = static_cast<unsigned>((it - g.first_out.begin()) - 1);
                                    unsigned v = g.head[a];
                                    double ulat = static_cast<double>(g.latitude[u]);
                                    double ulon = static_cast<double>(g.longitude[u]);
                                    double vlat = static_cast<double>(g.latitude[v]);
                                    double vlon = static_cast<double>(g.longitude[v]);
                                    if (added) oss << ",";
                                    oss << "{\"arc\": " << a << ", \"u\": [" << ulat << "," << ulon << "], \"v\": [" << vlat << "," << vlon << "]}";
                                    ++added;
                                }
                            }
                            oss << "]";
                        }
                        oss << "}\n";
                        std::string resp = oss.str();
                        send(client_socket, resp.c_str(), resp.length(), 0);
                        close(client_socket);
                        return;
                    } catch (const std::exception &e) {
                        std::string err = "{\"error\":\"解析多边形参数失败。\"}\n";
                        std::cerr << "RESOLVE_POLY parse error: " << e.what() << std::endl;
                        send(client_socket, err.c_str(), err.length(), 0);
                        close(client_socket);
                        return;
                    }
                } else {
                    std::string err = "{\"error\":\"RESOLVE_POLY 参数不完整，格式: RESOLVE_POLY,lat1,lon1,lat2,lon2,...\"}\n";
                    send(client_socket, err.c_str(), err.length(), 0);
                    close(client_socket);
                    return;
                }
            }
        }

        if (params.size() >= 4) {
            try {
                float from_lat = std::stof(params[0]);
                float from_lon = std::stof(params[1]);
                float to_lat = std::stof(params[2]);
                float to_lon = std::stof(params[3]);
                std::string profile_str = (params.size() > 4) ? params[4] : "normal";
                long query_time_sec = 0;
                if (params.size() > 5) {
                    try { query_time_sec = std::stol(params[5]); } catch(...) { query_time_sec = 0; }
                }
                int bucket_minutes = 30; // default, will be overridden in main by captured value
                // perform_routing needs bucket_minutes; we'll use a global/static config variable
                extern int GLOBAL_BUCKET_MINUTES;
                bucket_minutes = GLOBAL_BUCKET_MINUTES;

                // extract possible metric_sig from params earlier in handle_connection and pass through
                std::string metric_sig = extracted_metric_sig; // pass-through from parsed params
                perform_routing(from_lat, from_lon, to_lat, to_lon, profile_str, query_time_sec, routing_data, client_socket, bucket_minutes, metric_sig);
            } catch (const std::invalid_argument& ia) {
                std::string error_msg = "{\"error\":\"输入格式错误，无法解析坐标。\"}\n";
                std::cerr << "[Thread " << std::this_thread::get_id() << "] Invalid argument: " << ia.what() << std::endl;
                send(client_socket, error_msg.c_str(), error_msg.length(), 0);
            }
        } else {
            std::string error_msg = "{\"error\":\"输入格式错误，需要至少4个参数。\"}\n";
            std::cerr << "[Thread " << std::this_thread::get_id() << "] Invalid parameters count: " << params.size() << std::endl;
            // debug: print each param with quotes
            for (size_t i = 0; i < params.size(); ++i) {
                std::cerr << "  param[" << i << "]='" << params[i] << "'\n";
            }
            send(client_socket, error_msg.c_str(), error_msg.length(), 0);
        }
    } else {
        std::cerr << "[Thread " << std::this_thread::get_id() << "] Read failed or connection closed prematurely." << std::endl;
    }
    close(client_socket);
    std::cout << "[Thread " << std::this_thread::get_id() << "] Connection closed." << std::endl;
}

int main(int argc, char* argv[]) {
    std::string pbf_file;
    int bucket_minutes = 30;
    int bucket_count = 0;

    try {
        cxxopts::Options options(argv[0], "TJ_RoutingKit - 路由计算后台服务 (TCP模式)");
        options.add_options()
            ("p,pbf", "PBF文件路径", cxxopts::value<std::string>())
            ("bucket-minutes", "时间桶粒度（分钟）", cxxopts::value<int>()->default_value("30"))
            ("buckets", "预构建时间桶数量（0表示不预构建）", cxxopts::value<int>()->default_value("0"))
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
    bucket_minutes = result["bucket-minutes"].as<int>();
    bucket_count = result["buckets"].as<int>();
    if (bucket_minutes > 0) GLOBAL_BUCKET_MINUTES = bucket_minutes;

    } catch (const cxxopts::exceptions::exception& e) {
        std::cerr << "解析选项时出错: " << e.what() << std::endl;
        return 1;
    }

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

    auto routing_data = std::make_shared<RoutingData>();
    
    try {
        routing_data->graph = load_graph_data(pbf_file);

        // Prepare cache directory based on PBF file hash.
        // Place cache inside the TJ_RoutingKit repository if possible.
        std::string pbf_hash = sha256_file(pbf_file);
        std::string hash_sub = pbf_hash.empty() ? std::string("unknown") : pbf_hash;

        // Determine repo root: prefer env TJ_ROUTINGKIT_ROOT, else try to infer from PBF path,
        // else try current working dir containing "TJ_RoutingKit", else fallback to current dir.
        std::string repo_root;
        const char *env_root = std::getenv("TJ_ROUTINGKIT_ROOT");
        if (env_root && env_root[0] != '\0') {
            repo_root = env_root;
        } else {
            const std::string marker = "TJ_RoutingKit";
            size_t pos = pbf_file.find(marker);
            if (pos != std::string::npos) {
                repo_root = pbf_file.substr(0, pos + marker.size());
            } else {
                char cwd_buf[4096];
                if (getcwd(cwd_buf, sizeof(cwd_buf))) {
                    std::string cwd(cwd_buf);
                    size_t pos2 = cwd.find(marker);
                    if (pos2 != std::string::npos) repo_root = cwd.substr(0, pos2 + marker.size());
                    else {
                        std::string cand = cwd + "/" + marker;
                        struct stat st;
                        if (stat(cand.c_str(), &st) == 0 && S_ISDIR(st.st_mode)) repo_root = cand;
                        else repo_root = cwd; // best-effort fallback
                    }
                } else {
                    repo_root = std::string(".");
                }
            }
        }

        std::string cache_base = repo_root + "/cache/" + hash_sub;

        auto tail = RoutingKit::invert_inverse_vector(routing_data->graph.first_out);
        std::vector<unsigned> order;
        bool loaded_from_cache = false;

        if (!pbf_hash.empty()) {
            if (load_cache_files(cache_base, order, tail)) {
                std::cout << "Loaded CCH order and tail from cache: " << cache_base << std::endl;
                routing_data->cch = std::make_unique<RoutingKit::CustomizableContractionHierarchy>(order, tail, routing_data->graph.head);
                loaded_from_cache = true;
            } else {
                std::cout << "No valid cache found at " << cache_base << ", will compute order." << std::endl;
            }
        }

        if (!loaded_from_cache) {
            order = RoutingKit::compute_nested_node_dissection_order_using_inertial_flow(
                routing_data->graph.node_count, tail, routing_data->graph.head, routing_data->graph.latitude, routing_data->graph.longitude);

            routing_data->cch = std::make_unique<RoutingKit::CustomizableContractionHierarchy>(order, tail, routing_data->graph.head);

            // best-effort save
            if (!pbf_hash.empty()) {
                if (save_cache_files(cache_base, order, tail)) {
                    std::cout << "Saved CCH order/tail to cache: " << cache_base << std::endl;
                } else {
                    std::cout << "Warning: failed to save CCH cache to " << cache_base << std::endl;
                }
            }
        }

        routing_data->traffic_modeler = std::make_unique<RoutingKit::CCHTrafficModeler>(*routing_data->cch, routing_data->graph.travel_time, routing_data->graph.geo_distance, routing_data->graph.arc_count);
        routing_data->traffic_modeler->build_and_cache_metric(RoutingKit::CCHTrafficModeler::TrafficProfile::NORMAL);
        routing_data->traffic_modeler->build_and_cache_metric(RoutingKit::CCHTrafficModeler::TrafficProfile::MORNING_PEAK);
        routing_data->traffic_modeler->build_and_cache_metric(RoutingKit::CCHTrafficModeler::TrafficProfile::EVENING_PEAK);

        // prepare time bucket metrics (initial simple implementation)
        if (bucket_count > 0) {
            routing_data->time_bucket_metrics.resize(bucket_count, nullptr);
            routing_data->bucket_states.resize(bucket_count);
            for (int i = 0; i < bucket_count; ++i) routing_data->bucket_states[i] = std::make_unique<RoutingData::BucketState>();
            const RoutingKit::CustomizableContractionHierarchyMetric &normal_metric = routing_data->traffic_modeler->get_metric(RoutingKit::CCHTrafficModeler::TrafficProfile::NORMAL);
            for (int i = 0; i < bucket_count; ++i) routing_data->time_bucket_metrics[i] = &normal_metric;
            routing_data->cache_base = cache_base;
            std::cout << "Prepared " << bucket_count << " time-bucket metrics (placeholder -> NORMAL metric)." << std::endl;
            // write small marker files so subsequent runs can detect bucket presence
            for (int i = 0; i < bucket_count; ++i) {
                if (!load_metric_marker(cache_base, i)) {
                    if (!save_metric_marker(cache_base, i)) {
                        std::cerr << "Warning: failed to save metric marker for bucket " << i << std::endl;
                    }
                }
            }
        }

        routing_data->geo_pos_to_node = std::make_unique<RoutingKit::GeoPositionToNode>(routing_data->graph.latitude, routing_data->graph.longitude);

    } catch (const std::exception& e) {
        std::cerr << "预加载数据时发生致命错误: " << e.what() << std::endl;
        return 1;
    }
    
    std::cout << "TCP 服务器正在端口 " << PORT << " 上监听..." << std::endl;
    std::cout << "Ready" << std::endl; // 信号：服务器已就绪

    while (true) {
        int new_socket;
        std::cout << "Main thread waiting for new connection..." << std::endl;
        if ((new_socket = accept(server_fd, (struct sockaddr *)&address, (socklen_t*)&addrlen)) < 0) {
            perror("accept");
            continue; // 继续等待下一个连接
        }
        
        std::cout << "Accepted a new connection. Spawning a handler thread." << std::endl;
        std::thread(handle_connection, new_socket, routing_data).detach();
    }

    return 0;
}