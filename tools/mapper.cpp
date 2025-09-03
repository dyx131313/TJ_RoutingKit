#include "mapper.h"
#include <limits>

using namespace RoutingKit;

std::function<float(const EdgeWeight&)> RoutingKit::make_mapper(const UserContext&ctx){
    return [ctx](const EdgeWeight&ew)->float{
        if((ew.restriction_mask & ctx.user_mask) != 0ULL) return std::numeric_limits<float>::infinity();
        float w = ew.base_weight * (1.0f + ctx.alpha * ew.congestion) * ctx.preference_scale;
        return w;
    };
}

void RoutingKit::map_weights(const std::vector<EdgeWeight>&in, std::vector<float>&out, const UserContext&ctx){
    out.resize(in.size());
    auto mapper = make_mapper(ctx);
    for(size_t i=0;i<in.size();++i) out[i]=mapper(in[i]);
}
