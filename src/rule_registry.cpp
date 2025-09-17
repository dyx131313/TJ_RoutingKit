#include <routingkit/rule_registry.h>

using namespace RoutingKit;

uint32_t RuleRegistry::register_rule(const std::string&rule_name){
    std::lock_guard<std::mutex>lk(mtx);
    auto it = name_to_idx.find(rule_name);
    if(it!=name_to_idx.end()) return it->second;
    uint32_t idx = next_idx++;
    name_to_idx[rule_name]=idx;
    return idx;
}

uint32_t RuleRegistry::get_rule_index(const std::string&rule_name) const{
    std::lock_guard<std::mutex>lk(mtx);
    auto it = name_to_idx.find(rule_name);
    if(it==name_to_idx.end()) return UINT32_MAX;
    return it->second;
}

uint64_t RuleRegistry::rules_to_mask(const std::vector<std::string>&rules) const{
    std::lock_guard<std::mutex>lk(mtx);
    uint64_t mask=0;
    for(const auto&r:rules){
        auto it=name_to_idx.find(r);
        if(it!=name_to_idx.end()){
            if(it->second<64) mask |= (1ULL<<it->second);
        }
    }
    return mask;
}
