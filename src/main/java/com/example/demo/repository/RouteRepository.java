package com.example.demo.repository;

import com.example.demo.entity.Route;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RouteRepository extends JpaRepository<Route, String> {
    boolean existsByStartStationIdOrEndStationId(String startStationId, String endStationId);
}
