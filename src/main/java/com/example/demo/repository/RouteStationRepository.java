package com.example.demo.repository;

import com.example.demo.entity.RouteStation;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface RouteStationRepository extends JpaRepository<RouteStation, Long> {
    List<RouteStation> findByRouteIdOrderBySequenceNumberAsc(String routeId);
}
