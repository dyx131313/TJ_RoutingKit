#include <iostream>
#include <vector>
#include <cmath>
#include "edge_weight.h"
#include "rule_registry.h"
#include "mapper.h"

using namespace RoutingKit;

int main(){
    // 简单 PoC：构造几个边并测试 mapper
    RuleRegistry rr;
    uint32_t r1 = rr.register_rule("morning_peak");
    uint32_t r2 = rr.register_rule("odd_plate");

    EdgeWeight e1; e1.base_weight=10; e1.congestion=0.2f; e1.restriction_mask=(1ULL<<r1);
    EdgeWeight e2; e2.base_weight=5; e2.congestion=0.0f; e2.restriction_mask=0;
    EdgeWeight e3; e3.base_weight=3; e3.congestion=0.4f; e3.restriction_mask=(1ULL<<r2);

    std::vector<EdgeWeight> edges = {e1,e2,e3};

    UserContext uc;
    uc.user_mask = rr.rules_to_mask({"odd_plate"});
    uc.alpha = 1.0f;
    uc.preference_scale = 1.0f;

    std::vector<float> mapped;
    map_weights(edges,mapped,uc);

    for(size_t i=0;i<mapped.size();++i){
        if(std::isinf(mapped[i])) std::cout<<"edge "<<i<<" -> INF (restricted)\n";
        else std::cout<<"edge "<<i<<" -> "<<mapped[i]<<"\n";
    }

    return 0;
}
