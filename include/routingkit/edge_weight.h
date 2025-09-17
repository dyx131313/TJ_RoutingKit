#pragma once

#include <cstdint>

namespace RoutingKit {

struct EdgeWeight{
    float base_weight = 1.0f; // 基础权重
    float congestion = 0.0f;  // 实时拥堵因子
    uint64_t restriction_mask = 0ULL; // 限行掩码
};

}
