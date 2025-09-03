#pragma once

#include <string>
#include <unordered_map>
#include <mutex>
#include <cstdint>

namespace RoutingKit {

class RuleRegistry{
public:
    // 注册规则，返回分配的 bit index；重复注册返回相同 index
    uint32_t register_rule(const std::string&rule_name);

    // 根据规则名获取 bit index，找不到返回 UINT32_MAX
    uint32_t get_rule_index(const std::string&rule_name) const;

    // 将一组规则名转换为掩码
    uint64_t rules_to_mask(const std::vector<std::string>&rules) const;

private:
    mutable std::mutex mtx;
    std::unordered_map<std::string,uint32_t> name_to_idx;
    uint32_t next_idx = 0;
};

}
