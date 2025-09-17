#pragma once

#include <routingkit/edge_weight.h>
#include <vector>
#include <functional>

namespace RoutingKit {

struct UserContext{
    uint64_t user_mask = 0ULL; // 与 edge.restriction_mask 做 AND 判断
    float preference_scale = 1.0f; // 用户偏好缩放
    float alpha = 1.0f; // congestion 权重系数
};

std::function<float(const EdgeWeight&)> make_mapper(const UserContext&ctx);

// 批量映射
void map_weights(const std::vector<EdgeWeight>&in, std::vector<float>&out, const UserContext&ctx);

}
