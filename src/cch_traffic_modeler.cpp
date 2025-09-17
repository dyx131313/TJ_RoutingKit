#include <routingkit/cch_traffic_modeler.h>
#include <iostream>
#include <random>

namespace RoutingKit {

// Implementation of the helper function declared in the header
void map_weights_to_unsigned(const std::vector<EdgeWeight>&in, std::vector<unsigned>&out, const UserContext&ctx){
    out.resize(in.size());
    auto mapper = make_mapper(ctx);
    static int overflow_detection_count = 0;

    for(size_t i=0; i<in.size(); ++i){
        float w = mapper(in[i]);
        if(w == std::numeric_limits<float>::infinity()){
            out[i] = inf_weight;
        } else {
            if (w >= inf_weight && overflow_detection_count < 5) {
                std::cerr << "[DEBUG] POTENTIAL OVERFLOW DETECTED! Arc " << i
                          << ": Calculated float weight (" << w 
                          << ") is >= inf_weight (" << inf_weight << ")." << std::endl;
                overflow_detection_count++;
            }
            out[i] = static_cast<unsigned>(w);
        }
    }
}


CCHTrafficModeler::CCHTrafficModeler(
    const CustomizableContractionHierarchy& cch,
    const std::vector<unsigned>& travel_time,
    const std::vector<unsigned>& geo_distance,
    unsigned arc_count
) : cch(cch), base_travel_time(travel_time), geo_distance(geo_distance), arc_count(arc_count) {
    std::random_device rd;
    rng.seed(rd());
}

long long CCHTrafficModeler::build_and_cache_metric(TrafficProfile profile) {
    if (is_metric_cached(profile)) {
        return 0; // Already cached, no time taken
    }

    std::cout << "Building and caching metric for profile " << static_cast<int>(profile) << "..." << std::endl;

    long long timer = -get_micro_time();
    
    std::vector<unsigned> weights = generate_weights_for_profile(profile);
    
    // Use emplace to construct the metric directly in the map
    auto result = metric_cache.emplace(profile, CustomizableContractionHierarchyMetric(cch, weights));
    result.first->second.customize(); // Customize the newly created metric
    
    timer += get_micro_time();
    
    std::cout << "Profile " << static_cast<int>(profile) << " customized and cached in " << timer / 1000 << " ms." << std::endl;
    return timer / 1000;
}

CustomizableContractionHierarchyMetric& CCHTrafficModeler::get_metric(TrafficProfile profile) {
    if (!is_metric_cached(profile)) {
        throw std::runtime_error("Metric for the requested profile has not been built or cached.");
    }
    return metric_cache.at(profile);
}

bool CCHTrafficModeler::is_metric_cached(TrafficProfile profile) const {
    return metric_cache.count(profile) > 0;
}

std::vector<unsigned> CCHTrafficModeler::generate_weights_for_profile(TrafficProfile profile) {
    std::vector<EdgeWeight> multi_weights(arc_count);
    for(unsigned i = 0; i < arc_count; ++i) {
        multi_weights[i].base_weight = (float)base_travel_time[i];
    }

    std::uniform_real_distribution<> dis_simple(0.0, 1.0);

    if (profile == TrafficProfile::MORNING_PEAK || profile == TrafficProfile::EVENING_PEAK) {
        for(unsigned i = 0; i < arc_count; ++i) {
            float speed = 0.0f;
            if (base_travel_time[i] > 0) {
                speed = (float)geo_distance[i] / ((float)base_travel_time[i] / 1000.0f) * 3.6f;
            }

            double p = 0.0; 
            double f_min = 1.0, f_max = 1.0;

            if (profile == TrafficProfile::MORNING_PEAK) {
                if (speed >= 90)      { p = 0.02; f_min = 2.0; f_max = 3.0; }
                else if (speed >= 70) { p = 0.08; f_min = 2.2; f_max = 3.5; }
                else if (speed >= 50) { p = 0.15; f_min = 2.5; f_max = 4.0; }
                else if (speed >= 30) { p = 0.10; f_min = 2.0; f_max = 3.0; }
                else                  { p = 0.05; f_min = 1.5; f_max = 2.0; }
            } else { // EVENING_PEAK
                if (speed >= 90)      { p = 0.03; f_min = 2.2; f_max = 3.5; }
                else if (speed >= 70) { p = 0.12; f_min = 2.5; f_max = 4.0; }
                else if (speed >= 50) { p = 0.18; f_min = 3.0; f_max = 5.0; }
                else if (speed >= 30) { p = 0.15; f_min = 2.5; f_max = 4.0; }
                else                  { p = 0.08; f_min = 1.8; f_max = 2.5; }
            }

            if (dis_simple(rng) < p) {
                std::uniform_real_distribution<> factor_dist(f_min, f_max);
                multi_weights[i].congestion = factor_dist(rng) - 1.0f;
            }
        }
    }
    // For NORMAL profile, we just use the base weights without modification.

    std::vector<unsigned> final_weights;
    map_weights_to_unsigned(multi_weights, final_weights, UserContext{});
    return final_weights;
}

} // namespace RoutingKit
