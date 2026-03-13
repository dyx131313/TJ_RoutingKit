#ifndef CCH_TRAFFIC_MODELER_H
#define CCH_TRAFFIC_MODELER_H

#include <routingkit/customizable_contraction_hierarchy.h>
#include <routingkit/timer.h>
#include <routingkit/edge_weight.h>
#include <routingkit/mapper.h>

#include <map>
#include <string>
#include <vector>
#include <memory>
#include <random>
#include <stdexcept>

namespace RoutingKit {

// Helper function to map our multi-dimensional weights to unsigned integers for CCH
void map_weights_to_unsigned(const std::vector<EdgeWeight>&in, std::vector<unsigned>&out, const UserContext&ctx);

class CCHTrafficModeler {
public:
    // Enum to define different built-in traffic profiles
    enum class TrafficProfile {
        NORMAL,
        MORNING_PEAK,
        EVENING_PEAK,
        WALKING,
        BUS
    };

    // Constructor takes the CCH topology and the base graph data required for modeling
    CCHTrafficModeler(
        const CustomizableContractionHierarchy& cch,
        const std::vector<unsigned>& travel_time,
        const std::vector<unsigned>& geo_distance,
        unsigned arc_count
    );

    // Builds and customizes a metric for a given profile, then caches it.
    // Returns the time taken for customization in milliseconds.
    long long build_and_cache_metric(TrafficProfile profile);

    // Retrieves a pre-built metric from the cache.
    // Throws an error if the metric for the profile hasn't been built.
    CustomizableContractionHierarchyMetric& get_metric(TrafficProfile profile);

    // Checks if a metric for the given profile is already in the cache.
    bool is_metric_cached(TrafficProfile profile) const;

    // Public wrapper to generate the underlying weight vector for a profile.
    // This allows external code to obtain the arc-weight array and
    // persist or reuse it for per-bucket metrics.
    std::vector<unsigned> generate_weights_for_profile_for_bucket(TrafficProfile profile);

private:
    // Reference to the global CCH topology
    const CustomizableContractionHierarchy& cch;

    // Base graph data
    const std::vector<unsigned>& base_travel_time;
    const std::vector<unsigned>& geo_distance;
    unsigned arc_count;

    // The cache for customized metrics
    std::map<TrafficProfile, CustomizableContractionHierarchyMetric> metric_cache;

    // Random number generator for congestion models
    std::mt19937 rng;

    // Generates the appropriate weight vector for a given traffic profile
    std::vector<unsigned> generate_weights_for_profile(TrafficProfile profile);
};

} // namespace RoutingKit

#endif // CCH_TRAFFIC_MODELER_H
